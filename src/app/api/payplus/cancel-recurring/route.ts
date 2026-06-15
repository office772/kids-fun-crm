export const dynamic = 'force-dynamic'

// ─── ביטול הוראת קבע ב-PayPlus ────────────────────────────────────────────────
// קריאה מהדשבורד: POST /api/payplus/cancel-recurring { parentId }
// 1. שולפת את payplus_recurring_uid מההורה
// 2. שולחת לביטול ב-PayPlus
// 3. מעדכנת ב-CRM שההוראה בוטלה (+timeline)
// אם ה-API לא מוגדר עדיין — מחזיר שגיאה ידידותית.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { cancelRecurringPayment, isPayPlusApiConfigured } from '@/lib/payplus-api'

export async function POST(req: NextRequest) {
  const { parentId } = await req.json()
  if (!parentId) return NextResponse.json({ error: 'parentId נדרש' }, { status: 400 })

  if (!isPayPlusApiConfigured()) {
    return NextResponse.json({
      error: 'PayPlus API עוד לא מופעל. הפעלי את גישת ה-API ב-PayPlus והוסיפי את המפתחות (PAYPLUS_API_KEY, PAYPLUS_SECRET_KEY) ב-Vercel.',
    }, { status: 503 })
  }

  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()

  // שלוף את הוראת הקבע של ההורה
  const { data: parent } = await supabase
    .from('parents')
    .select('id, name, payplus_recurring_uid, payplus_recurring_status')
    .eq('id', parentId).maybeSingle()

  if (!parent) return NextResponse.json({ error: 'הורה לא נמצא' }, { status: 404 })
  if (!parent.payplus_recurring_uid) {
    return NextResponse.json({
      error: 'לא רשומה הוראת קבע פעילה ב-PayPlus עבור ההורה הזה. ייתכן שהיא לא הוקמה דרך המערכת — בטלי ידנית בדשבורד PayPlus.',
    }, { status: 422 })
  }
  if (parent.payplus_recurring_status === 'cancelled') {
    return NextResponse.json({ error: 'הוראת הקבע כבר בוטלה' }, { status: 422 })
  }

  const result = await cancelRecurringPayment(parent.payplus_recurring_uid)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // האם הביטול בוצע בסביבת טסטים? (משפיע על תיוג ההצגה ב-CRM)
  const isSandbox = process.env.PAYPLUS_SANDBOX === 'true'
  const envLabel  = isSandbox ? '🧪 בסביבת טסטים' : ''

  // עדכון מצב ב-CRM — סטטוס כולל סימון "test" כך שניתן להבחין בכרטיס
  await supabase.from('parents').update({
    payplus_recurring_status:       isSandbox ? 'cancelled_test' : 'cancelled',
    payplus_recurring_cancelled_at: new Date().toISOString(),
  }).eq('id', parentId)

  await supabase.from('registration_timeline').insert({
    parent_id:    parentId,
    event_type:   'status_change',
    new_value:    isSandbox ? 'הוראת קבע בוטלה (טסט)' : 'הוראת קבע בוטלה',
    description:  `${isSandbox ? '🧪 ' : ''}הוראת קבע בוטלה אוטומטית ב-PayPlus${envLabel ? ' — ' + envLabel : ''} דרך הדשבורד (UID: ${parent.payplus_recurring_uid})`,
    performed_by: 'נציגה',
    metadata:     { sandbox: isSandbox, recurring_uid: parent.payplus_recurring_uid },
  })

  return NextResponse.json({ ok: true, parent: parent.name, sandbox: isSandbox })
}
