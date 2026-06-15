export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { processMessage } from '@/lib/bot/handler'
import { BotSession } from '@/lib/types'

// Sessions in-memory לסימולטור
const simulatorSessions = new Map<string, BotSession>()

export async function POST(req: NextRequest) {
  try {
    const { message, sessionId, parentName, reset, clientState, testPhone } = await req.json()

    if (!message || !sessionId) {
      return NextResponse.json({ error: 'Missing message or sessionId' }, { status: 400 })
    }

    if (reset) {
      simulatorSessions.delete(sessionId)
    }

    // ב-Vercel (serverless) הזיכרון מתאפס בין קריאות — אם ה-session לא בזיכרון,
    // משחזרים אותו ממצב הלקוח (localStorage בדפדפן) כדי שהמסלול לא "יישכח" אחרי רענון.
    // טלפון לבדיקה (אם סופק) — מאפשר לדמות זיהוי הורה אמיתי בסימולטור
    const cleanTestPhone = typeof testPhone === 'string' && testPhone.trim() ? testPhone.trim() : null

    const existing = simulatorSessions.get(sessionId)
    if (existing && cleanTestPhone && existing.phone !== cleanTestPhone) {
      existing.phone = cleanTestPhone
    }

    const session: BotSession = existing || {
      sessionId,
      phone: cleanTestPhone || 'simulator',
      parentName: parentName || 'הורה לדוגמה',
      currentFlow: clientState?.currentFlow || undefined,
      messages: Array.isArray(clientState?.messages)
        ? clientState.messages.slice(-10).map((m: { role: string; text: string }) => ({
            role: m.role === 'user' ? 'user' : 'bot',
            text: String(m.text ?? ''),
            timestamp: new Date(),
          }))
        : [],
      collectedData: (clientState?.collectedData && typeof clientState.collectedData === 'object')
        ? { ...clientState.collectedData }
        : {},
    }

    // processMessage הוא עכשיו async (LLM fallback)
    const response = await processMessage(session, message)

    // עדכון session
    if (response.nextFlow) {
      session.currentFlow = response.nextFlow
    } else if (response.isComplete) {
      session.currentFlow = undefined
      // שמירת נתונים שנאספו להצגה בסימולטור — לא מנקה
    }

    // שמירת ההודעה בהיסטוריה (לcontext של LLM)
    session.messages.push({ role: 'user', text: message, timestamp: new Date() })
    if (response.text) {
      session.messages.push({ role: 'bot', text: response.text, timestamp: new Date(), intent: response.intent })
    }

    simulatorSessions.set(sessionId, session)

    // ─── שמירת task ב-DB כדי שיופיע בלשונית "פניות" ─────────────────────────
    // הסימולטור עד עכשיו רק החזיר createTask ב-response — אבל לא שמר ב-DB.
    // עכשיו שומרים בדיוק כמו ב-webhook הראשי (manychat/route.ts).
    if (response.createTask) {
      try {
        const { createServiceClient } = await import('@/lib/supabase/server')
        const supabase = createServiceClient()
        // חיפוש הורה לפי הטלפון (אם זוהה) — אחרת parent_id = null
        let parentId: string | null = null
        if (cleanTestPhone) {
          const normalized = cleanTestPhone.replace(/\D/g, '').replace(/^972/, '0')
          const intl       = '972' + normalized.replace(/^0/, '')
          const { data: parent } = await supabase
            .from('parents').select('id')
            .or(`phone.eq.${normalized},phone.eq.${intl}`)
            .maybeSingle()
          parentId = parent?.id ?? null
        }
        await supabase.from('tasks').insert({
          parent_id:   parentId,
          type:        response.createTask.type,
          description: `[סימולטור] ${response.createTask.description}`,
          priority:    response.createTask.priority,
          status:      'פתוח',
        })
      } catch (err) {
        console.error('[simulator] task insert error:', err)
      }
    }

    return NextResponse.json({
      reply: response.text,
      intent: response.intent,
      escalate: response.escalate || false,
      createTask: response.createTask || null,
      currentFlow: session.currentFlow || null,
      collectedData: session.collectedData || {},
      isComplete: response.isComplete || false,
    })
  } catch (error) {
    console.error('Simulator error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
