export const dynamic = 'force-dynamic'

// ─── PayPlus Webhook Handler ──────────────────────────────────────────────────
// PayPlus קורא ל-endpoint זה לאחר כל תשלום — הצלחה או כשל.
// לוגיקה: חפש הורה → אם לא קיים → צור חדש → רשום תשלום עם סטטוס מתאים.
// כשל חיוב (הוראת קבע / כרטיס פג תוקף) נרשם כ-🔴 ויוצר משימה לטיפול.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'

function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s\-.()+]/g, '')
  if (p.startsWith('972')) p = '0' + p.slice(3)
  if (!p.startsWith('0') && p.length === 9) p = '0' + p
  return p
}

// מזהה אם מדובר בכשל בגלל כרטיס פג תוקף (מתוך קוד/הודעת השגיאה של PayPlus)
function isCardExpired(statusCode: string, reason: string): boolean {
  const s = `${statusCode} ${reason}`.toLowerCase()
  return /expir|פג תוקף|פג-תוקף|054|033/.test(s)
}

// PayPlus עשוי לשלוח callback גם כ-GET עם query params (תלוי בהגדרת "שיטת החזרת מידע" בדף הסליקה)
export async function GET(req: NextRequest) {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries())
  console.log('[PayPlus Webhook GET]', JSON.stringify(params))
  return handlePayPlusEvent(params)
}

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: Record<string, any> = {}
  try {
    const raw = await req.text()
    if (raw.trim().startsWith('{')) {
      body = JSON.parse(raw)
    } else if (raw.includes('=')) {
      // form-encoded
      body = Object.fromEntries(new URLSearchParams(raw).entries())
    }
  } catch { /* גוף לא קריא — ימשיך עם אובייקט ריק וייעצר בבדיקת התקינות */ }
  console.log('[PayPlus Webhook]', JSON.stringify(body, null, 2))
  return handlePayPlusEvent(body)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePayPlusEvent(body: Record<string, any>) {
  try {

    // ── חילוץ נתונים ────────────────────────────────────────────────────────
    const tx        = body?.transaction ?? body?.Transaction ?? body
    const status    = String(tx?.status_code ?? tx?.StatusCode ?? tx?.status ?? body?.status ?? '')
    const txId      = tx?.uid ?? tx?.UID ?? tx?.page_request_uid ?? body?.page_request_uid
    const amount    = Number(tx?.amount ?? tx?.Amount ?? body?.amount ?? 0)
    const reason    = String(tx?.status_error_description ?? tx?.status_description ?? tx?.error ?? body?.error ?? '')
    const failures  = Number(tx?.number_of_failures ?? tx?.failures ?? body?.number_of_failures ?? 0)
    const paidAt    = new Date().toISOString()

    // פרטי לקוח
    const customer  = tx?.customer ?? tx?.Customer ?? body?.customer ?? {}
    const name      = String(customer?.name  ?? customer?.Name  ?? tx?.customer_name  ?? body?.customer_name  ?? '')
    const rawPhone  = String(customer?.phone ?? customer?.Phone ?? tx?.customer_phone ?? body?.customer_phone ?? '')
    const email     = String(customer?.email ?? customer?.Email ?? tx?.customer_email ?? body?.customer_email ?? '')

    // external_uid = registration_id שהכנסנו בבקשה
    const externalUid = tx?.order?.external_uid ?? body?.order?.external_uid ?? body?.external_uid

    // האם הוראת קבע (חיוב חוזר) או כרטיס רגיל + מזהה הוראת הקבע (נדרש לביטול אוטומטי)
    const recurringUid = String(tx?.recurring_uid ?? tx?.recurring ?? body?.recurring_uid ?? '') || null
    const isRecurring  = !!recurringUid
    const paymentType  = isRecurring ? 'הוראת קבע' : 'כרטיס אשראי'

    // מספר תשלום + סה"כ תשלומים (PayPlus שולח בהוראות קבע)
    const paymentNumber = Number(tx?.payment_number ?? tx?.payment_num ?? body?.payment_number ?? 0) || null
    const totalPayments = Number(tx?.number_of_payments ?? tx?.num_of_payments ?? body?.number_of_payments ?? 0) || null

    const isSuccess = status === '000' || status === 'COMPLETED' || Number(status) === 0 || status === '1'
    const cardExpired = !isSuccess && isCardExpired(status, reason)

    console.log(`[PayPlus Webhook] status=${status}, success=${isSuccess}, txId=${txId}, name=${name}, phone=${rawPhone}`)

    // ── בדיקת תקינות: בלי שום פרט מזהה (לקוח/עסקה/סכום) — זה ping או קריאה ריקה.
    // לא יוצרים "הורה לא ידוע" ולא רושמים תשלום.
    if (!txId && !rawPhone && !name && !email && !amount) {
      console.log('[PayPlus Webhook] Empty/ping payload — ignoring')
      return NextResponse.json({ ok: true, ignored: true })
    }

    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()

    // ── מניעת כפילויות (רק עבור הצלחות עם txId יציב) ──────────────────────────
    if (txId && isSuccess) {
      const { data: existingPay } = await supabase
        .from('payments').select('id').eq('payplus_ref', txId).maybeSingle()
      if (existingPay) {
        console.log(`[PayPlus Webhook] Duplicate txId ${txId} — skipping`)
        return NextResponse.json({ ok: true, duplicate: true })
      }
    }

    // ── חיפוש רב-שלבי של ההורה ─────────────────────────────────────────────
    let parentId: string | null = null

    if (externalUid) {
      const { data: reg } = await supabase
        .from('registrations').select('parent_id').eq('id', externalUid).maybeSingle()
      if (reg?.parent_id) parentId = reg.parent_id
    }

    const phone = rawPhone ? normalizePhone(rawPhone) : null
    if (!parentId && phone) {
      const { data: byPhone } = await supabase.from('parents').select('id').eq('phone', phone).maybeSingle()
      if (byPhone) parentId = byPhone.id
    }
    if (!parentId && email) {
      const { data: byEmail } = await supabase.from('parents').select('id').eq('email', email).maybeSingle()
      if (byEmail) parentId = byEmail.id
    }
    if (!parentId && name) {
      const { data: byName } = await supabase.from('parents').select('id').eq('name', name).maybeSingle()
      if (byName) parentId = byName.id
    }

    // צור הורה חדש אם לא נמצא
    if (!parentId) {
      console.log(`[PayPlus Webhook] Parent not found — creating: ${name} / ${phone}`)
      const phoneToUse = phone || `pp_${txId || Date.now()}`
      const { data: newParent } = await supabase
        .from('parents')
        .insert({
          name:         name || 'לא ידוע',
          phone:        phoneToUse,
          email:        email || null,
          sync_source:  'payplus_webhook',
          external_ref: txId || null,
        })
        .select('id').single()
      if (newParent) parentId = newParent.id
    }

    if (!parentId) {
      console.error('[PayPlus Webhook] Could not find or create parent')
      return NextResponse.json({ ok: true, warning: 'parent not resolved' })
    }

    // ── שמירת מזהה הוראת הקבע ברמת ההורה (לביטול אוטומטי בעתיד) ───────────
    if (recurringUid) {
      await supabase.from('parents').update({
        payplus_recurring_uid:    recurringUid,
        payplus_recurring_status: isSuccess ? 'active' : 'failed',
      }).eq('id', parentId)
    }

    // ── רשומת תשלום ────────────────────────────────────────────────────────
    await supabase.from('payments').insert({
      parent_id:          parentId,
      amount:             amount || null,
      status:             isSuccess ? 'שולם' : 'נכשל',
      payment_type:       paymentType,
      number_of_failures: isSuccess ? 0 : (failures || 1),
      card_expired:       cardExpired,
      paid_at:            isSuccess ? paidAt : null,
      payplus_ref:        txId || null,
      payplus_transaction_uid: txId || null,
      source:             'payplus_webhook',
      failure_reason:     isSuccess ? null : (reason || 'חיוב נכשל'),
      payment_number:     paymentNumber,
      total_payments:     totalPayments,
    })

    if (isSuccess) {
      // עדכן רישום אם קיים
      if (externalUid) {
        await supabase
          .from('registrations')
          .update({ status: 'מאושר', payment_method: 'credit', payment_setup_at: paidAt })
          .eq('id', externalUid)
          .eq('status', 'ממתין לאישור')
      }

      await supabase.from('registration_timeline').insert({
        parent_id:   parentId,
        event_type:  'payment',
        new_value:   'שולם',
        description: `תשלום PayPlus התקבל — ${amount}₪ (${paymentType})${paymentNumber && totalPayments ? ` — תשלום ${paymentNumber} מתוך ${totalPayments}` : paymentNumber ? ` — תשלום מס׳ ${paymentNumber}` : ''}`,
        performed_by: 'מערכת',
        metadata:    { amount, payplus_ref: txId },
      })
      console.log(`[PayPlus Webhook] ✅ Success — parent ${parentId}, amount ${amount}₪`)
    } else {
      // ── כשל חיוב — צור משימה לטיפול + רשומת timeline ─────────────────────
      const failLabel = cardExpired ? 'כרטיס אשראי פג תוקף' : (reason || 'חיוב נכשל')
      await supabase.from('tasks').insert({
        parent_id:   parentId,
        type:        'כשל תשלום',
        description: `כשל חיוב ב-PayPlus (${paymentType}): ${failLabel} — ₪${amount}`,
        priority:    'דחוף',
        status:      'פתוח',
      })
      const { notifyStaff } = await import('@/lib/notify')
      await notifyStaff({
        text: `כשל חיוב PayPlus: ${name || 'לקוח'} — ${failLabel} (₪${amount})`,
        priority: 'דחוף',
      })
      await supabase.from('registration_timeline').insert({
        parent_id:   parentId,
        event_type:  'payment',
        new_value:   'נכשל',
        description: `🔴 כשל חיוב PayPlus — ${failLabel} (₪${amount})`,
        performed_by: 'מערכת',
        metadata:    { amount, payplus_ref: txId, card_expired: cardExpired },
      })
      console.log(`[PayPlus Webhook] 🔴 Failure recorded — parent ${parentId}, reason: ${failLabel}`)
    }

    return NextResponse.json({ ok: true, parent_id: parentId, success: isSuccess })

  } catch (err) {
    console.error('[PayPlus Webhook] Error:', err)
    return NextResponse.json({ ok: true }) // תמיד 200 ל-PayPlus
  }
}
