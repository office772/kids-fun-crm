export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { processMessage } from '@/lib/bot/handler'
import { BotSession } from '@/lib/types'

// פשוט sessions in-memory (להחליף ב-Redis בפרודקשן)
const sessions = new Map<string, BotSession>()

// GET — אימות webhook (uchat/ManyChat שולחים בקשת GET לאימות)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_SECRET) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// POST — הודעה נכנסת מ-uchat/ManyChat
export async function POST(req: NextRequest) {
  try {
    // אימות secret header
    const signature = req.headers.get('x-webhook-secret')
    if (process.env.WHATSAPP_WEBHOOK_SECRET && signature !== process.env.WHATSAPP_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    // פרמטרים מ-uchat/ManyChat (מבנה נפוץ)
    const phone: string = body.phone || body.sender?.phone || body.contact?.phone
    const text: string = body.text || body.message?.text || body.message || ''

    if (!phone || !text) {
      return NextResponse.json({ error: 'Missing phone or text' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // חיפוש/יצירת הורה
    let { data: parent } = await supabase
      .from('parents')
      .select('*, children(*)')
      .eq('phone', phone)
      .single()

    if (!parent) {
      const { data: newParent } = await supabase
        .from('parents')
        .insert({ phone })
        .select()
        .single()
      parent = newParent
    }

    // קבלת/יצירת session
    const session: BotSession = sessions.get(phone) || {
      sessionId: `${phone}_${Date.now()}`,
      phone,
      parentId: parent?.id,
      parentName: parent?.name,
      messages: [],
      collectedData: {}
    }

    // עיבוד ההודעה (async — כולל LLM fallback)
    const response = await processMessage(session, text)

    // עדכון session
    if (response.nextFlow) {
      session.currentFlow = response.nextFlow
    } else if (response.isComplete) {
      session.currentFlow = undefined
    }
    sessions.set(phone, session)

    // שמירת הודעה נכנסת ב-DB
    await supabase.from('conversations').insert({
      parent_id: parent?.id,
      phone,
      platform: 'whatsapp',
      direction: 'נכנס',
      message_text: text,
      intent: response.intent,
      session_id: session.sessionId
    })

    // שמירת תשובת בוט ב-DB
    await supabase.from('conversations').insert({
      parent_id: parent?.id,
      phone,
      platform: 'whatsapp',
      direction: 'יוצא',
      message_text: response.text,
      intent: response.intent,
      handled_by: response.escalate ? 'נציג' : 'בוט',
      session_id: session.sessionId
    })

    // יצירת משימה אם נדרש
    if (response.createTask) {
      await supabase.from('tasks').insert({
        parent_id: parent?.id,
        type: response.createTask.type,
        description: response.createTask.description,
        priority: response.createTask.priority,
        status: 'פתוח'
      })
    }

    // תשובה ל-uchat/ManyChat
    return NextResponse.json({
      success: true,
      reply: response.text,
      escalate: response.escalate || false
    })

  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
