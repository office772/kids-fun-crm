export const dynamic = 'force-dynamic'

// ─── PayPlus Webhook Handler ──────────────────────────────────────────────────
// PayPlus קורא ל-endpoint זה לאחר כל תשלום
// לוגיקה כמו Summit: חפש הורה → אם לא קיים → צור חדש
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'

function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s\-\.\(\)\+]/g, '')
  if (p.startsWith('972')) p = '0' + p.slice(3)
  if (!p.startsWith('0') && p.length === 9) p = '0' + p
  return p
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('[PayPlus Webhook]', JSON.stringify(body, null, 2))

    // ── חילוץ נתונים ────────────────────────────────────────────────────────
    const tx        = body?.transaction ?? body?.Transaction ?? body
    const status    = tx?.status_code   ?? tx?.StatusCode   ?? tx?.status ?? body?.status
    const txId      = tx?.uid           ?? tx?.UID          ?? tx?.page_request_uid ?? body?.page_request_uid
    const amount    = Number(tx?.amount ?? tx?.Amount ?? body?.amount ?? 0)
    const paidAt    = new Date().toISOString()

    // פרטי לקוח
    const customer  = tx?.customer ?? tx?.Customer ?? body?.customer ?? {}
    const name      = String(customer?.name  ?? customer?.Name  ?? tx?.customer_name  ?? body?.customer_name  ?? '')
    const rawPhone  = String(customer?.phone ?? customer?.Phone ?? tx?.customer_phone ?? body?.customer_phone ?? '')
    const email     = String(customer?.email ?? customer?.Email ?? tx?.customer_email ?? body?.customer_email ?? '')

    // external_uid = registration_id שהכנסנו בבקשה
    const externalUid = tx?.order?.external_uid ?? body?.order?.external_uid ?? body?.external_uid

    console.log(`[PayPlus Webhook] status=${status}, txId=${txId}, name=${name}, phone=${rawPhone}`)

    // ── תשלום מוצלח ────────────────────────────────────────────────────────
    const isSuccess = status === '000' || status === 'COMPLETED' || Number(status) === 0 || status === '1'

    if (!isSuccess) {
      console.log(`[PayPlus Webhook] Not a success status: ${status}`)
      return NextResponse.json({ ok: true })
    }

    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()

    // ── מניעת כפילויות ─────────────────────────────────────────────────────
    if (txId) {
      const { data: existingPay } = await supabase
        .from('payments')
        .select('id')
        .eq('payplus_ref', txId)
        .maybeSingle()

      if (existingPay) {
        console.log(`[PayPlus Webhook] Duplicate txId ${txId} — skipping`)
        return NextResponse.json({ ok: true, duplicate: true })
      }
    }

    // ── חיפוש רב-שלבי (כמו Summit) ─────────────────────────────────────────
    let parentId: string | null = null

    // 1. חפש לפי external_uid (registration_id)
    if (externalUid) {
      const { data: reg } = await supabase
        .from('registrations')
        .select('parent_id')
        .eq('id', externalUid)
        .maybeSingle()
      if (reg?.parent_id) parentId = reg.parent_id
    }

    // 2. חפש לפי טלפון
    const phone = rawPhone ? normalizePhone(rawPhone) : null
    if (!parentId && phone) {
      const { data: byPhone } = await supabase
        .from('parents')
        .select('id')
        .eq('phone', phone)
        .maybeSingle()
      if (byPhone) parentId = byPhone.id
    }

    // 3. חפש לפי אימייל
    if (!parentId && email) {
      const { data: byEmail } = await supabase
        .from('parents')
        .select('id')
        .eq('email', email)
        .maybeSingle()
      if (byEmail) parentId = byEmail.id
    }

    // 4. חפש לפי שם
    if (!parentId && name) {
      const { data: byName } = await supabase
        .from('parents')
        .select('id')
        .eq('name', name)
        .maybeSingle()
      if (byName) parentId = byName.id
    }

    // 5. אם לא נמצא — צור הורה חדש (כמו Summit!)
    if (!parentId) {
      console.log(`[PayPlus Webhook] Parent not found — creating: ${name} / ${phone}`)
      // phone הוא NOT NULL — placeholder אם אין טלפון אמיתי
      const phoneToUse = phone || `pp_${txId || Date.now()}`
      const { data: newParent } = await supabase
        .from('parents')
        .insert({
          name:        name || 'לא ידוע',
          phone:       phoneToUse,
          email:       email || null,
          sync_source: 'payplus_webhook',
          external_ref: txId || null,
        })
        .select('id')
        .single()

      if (newParent) parentId = newParent.id
    }

    if (!parentId) {
      console.error('[PayPlus Webhook] Could not find or create parent')
      return NextResponse.json({ ok: true, warning: 'parent not resolved' })
    }

    // ── צור רשומת תשלום ────────────────────────────────────────────────────
    await supabase.from('payments').insert({
      parent_id:   parentId,
      amount:      amount || null,
      status:      'שולם',
      paid_at:     paidAt,
      payplus_ref: txId || null,
      source:      'payplus_webhook',
    })

    // ── עדכן רישום אם קיים ─────────────────────────────────────────────────
    if (externalUid) {
      await supabase
        .from('registrations')
        .update({ status: 'מאושר', payment_method: 'credit', payment_setup_at: paidAt })
        .eq('id', externalUid)
        .eq('status', 'ממתין לאישור')
    }

    // ── רשומה ב-timeline ────────────────────────────────────────────────────
    await supabase.from('registration_timeline').insert({
      parent_id:   parentId,
      event_type:  'payment',
      new_value:   'שולם',
      description: `תשלום PayPlus התקבל — ${amount}₪ (ref: ${txId})`,
      performed_by: 'מערכת',
    })

    console.log(`[PayPlus Webhook] ✅ Success — parent ${parentId}, amount ${amount}₪`)
    return NextResponse.json({ ok: true, parent_id: parentId })

  } catch (err) {
    console.error('[PayPlus Webhook] Error:', err)
    return NextResponse.json({ ok: true }) // תמיד 200 ל-PayPlus
  }
}
