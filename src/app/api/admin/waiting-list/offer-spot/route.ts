export const dynamic = 'force-dynamic'

// POST /api/admin/waiting-list/offer-spot
//
// מופעל כשהנציגה לוחצת "הצע מקום" על רישום ברשימת המתנה בדשבורד.
//
// מה שקורה:
//   1. מעדכן סטטוס הרישום → 'ממתין לאישור' (מחכים לאישור ההורה)
//   2. שומר bot_session עם הנתונים הדרושים לבוט (ילד, אזור, מחיר)
//   3. יוצר task לנציגה כרשומה (שליחת ה-WhatsApp עצמה — uchat בסשן הבא)
//   4. שומר את ההודעה ב-conversations כ-outgoing
//   5. מחזיר את טקסט ההודעה לשליחה ב-WhatsApp
//
// ⚠️  שליחה בפועל ל-WhatsApp תתבצע דרך uchat (יחובר בסשן נפרד).
//     כרגע — מחזיר את הטקסט לשליחה ומתעד הכל ב-CRM.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient }       from '@/lib/supabase/server'
import { buildSpotOfferMessage, DEFAULT_MONTHLY_FEE } from '@/lib/bot/payment-helpers'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      registrationId:  string
      phone:           string
      parentName:      string
      childName:       string
      areaCode:        string
      areaLabel:       string
      waitingPosition: number
      monthlyFee?:     number
    }

    const {
      registrationId,
      phone,
      parentName,
      childName,
      areaCode,
      areaLabel,
      waitingPosition,
      monthlyFee = DEFAULT_MONTHLY_FEE,
    } = body

    if (!registrationId || !phone || !childName) {
      return NextResponse.json(
        { error: 'חסרים שדות: registrationId, phone, childName' },
        { status: 400 }
      )
    }

    const supabase   = createServiceClient()
    const cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '972')
    const firstName  = parentName?.split(' ')[0] ?? ''

    // ── 1. בנה את טקסט ההודעה ──────────────────────────────────────────────
    const messageText = buildSpotOfferMessage(
      firstName,
      childName,
      areaLabel,
      waitingPosition
    )

    // ── 2. עדכן סטטוס רישום → 'ממתין לאישור' (spot offered) ────────────────
    const { error: regError } = await supabase
      .from('registrations')
      .update({
        status:  'ממתין לאישור',
        notes:   `הצעת מקום נשלחה ${new Date().toLocaleDateString('he-IL')}`,
      })
      .eq('id', registrationId)

    if (regError) {
      console.error('[offer-spot] Failed to update registration:', regError)
    }

    // ── 3. שמור bot_session נפרד עם נתוני הזמנה ─────────────────────────────
    // ה-bot session נשמר ב-conversations / sessions table
    // כשההורה עונה — הבוט מזהה phone + currentFlow = 'waiting_spot_confirm'
    // ↓ מנסים לעדכן sessions אם קיים, אחרת יוצרים
    const sessionData = {
      phone:        cleanPhone,
      currentFlow:  'waiting_spot_confirm',
      collectedData: {
        registration_id: registrationId,
        child_name:      childName,
        area_code:       areaCode,
        area_label:      areaLabel,
        monthly_fee:     String(monthlyFee),
        waiting_position: String(waitingPosition),
        from_spot_offer: 'true',
      },
    }

    // שמירה ב-Supabase (טבלת bot_sessions אם קיימת, אחרת רשומה ב-tasks)
    const { error: sessionError } = await supabase
      .from('bot_sessions')
      .upsert(
        {
          phone:          cleanPhone,
          current_flow:   'waiting_spot_confirm',
          collected_data: sessionData.collectedData,
          updated_at:     new Date().toISOString(),
        },
        { onConflict: 'phone' }
      )

    if (sessionError) {
      // bot_sessions טבלה אולי לא קיימת עדיין — לא קריטי, נמשיך
      console.warn('[offer-spot] bot_sessions upsert failed (table may not exist):', sessionError.message)
    }

    // ── 4. שמור conversation כ-outgoing ────────────────────────────────────
    // מחפשים parent_id לפי הטלפון
    const { data: parent } = await supabase
      .from('parents')
      .select('id')
      .eq('phone', cleanPhone)
      .maybeSingle()

    await supabase.from('conversations').insert({
      phone:        cleanPhone,
      parent_id:    parent?.id ?? null,
      platform:     'whatsapp',
      direction:    'יוצא',
      message_text: messageText,
      intent:       'הצעת_מקום_יזומה',
      handled_by:   'בוט',
    })

    // ── 5. צור task לנציגה ──────────────────────────────────────────────────
    await supabase.from('tasks').insert({
      parent_id:   parent?.id ?? null,
      type:        'רשימת המתנה',
      description: `הצעת מקום נשלחה ל${parentName} (${cleanPhone}) — ${childName} ב${areaLabel} | ממתין לתגובה`,
      status:      'בטיפול',
      priority:    'גבוה',
    })

    return NextResponse.json({
      success:     true,
      messageText,           // ← זה מה שuchat ישלח לWhatsApp
      sessionData,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאה'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
