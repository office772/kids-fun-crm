export const dynamic = 'force-dynamic'

// ─── Green Invoice (Morning) Webhook Handler ──────────────────────────────────
// Morning קורא ל-endpoint זה לאחר תשלום בקישור
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
    console.log('[GI Webhook]', JSON.stringify(body, null, 2))

    // Morning שולח את פרטי המסמך שנוצר
    const docId    = String(body?.id ?? body?.uid ?? body?.documentId ?? '')
    const docName  = String(body?.description ?? body?.title ?? body?.name ?? '')
    const amount   = Number(body?.sum ?? body?.amount ?? body?.total ?? 0)
    const paidAt   = new Date().toISOString()

    // פרטי לקוח
    const client   = body?.client ?? body?.customer ?? body?.contact ?? {}
    const name     = String(client?.name ?? body?.customerName ?? '')
    const email    = String(client?.email ?? body?.customerEmail ?? client?.emailAddress ?? '')
    const rawPhone = String(client?.phone ?? body?.customerPhone ?? client?.telephone ?? '')

    console.log(`[GI Webhook] docId=${docId}, name=${name}, phone=${rawPhone}`)

    if (!name && !email) {
      console.warn('[GI Webhook] No customer data')
      return NextResponse.json({ ok: true })
    }

    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()

    // ── מניעת כפילויות ─────────────────────────────────────────────────────
    if (docId) {
      const { data: existing } = await supabase
        .from('payments')
        .select('id')
        .eq('greeninvoice_ref', docId)
        .maybeSingle()

      if (existing) {
        console.log(`[GI Webhook] Duplicate ${docId} — skipping`)
        return NextResponse.json({ ok: true, duplicate: true })
      }
    }

    // ── חיפוש רב-שלבי ──────────────────────────────────────────────────────
    const phone = rawPhone ? normalizePhone(rawPhone) : null
    let parentId: string | null = null

    if (phone) {
      const { data } = await supabase.from('parents').select('id').eq('phone', phone).maybeSingle()
      if (data) parentId = data.id
    }
    if (!parentId && email) {
      const { data } = await supabase.from('parents').select('id').eq('email', email).maybeSingle()
      if (data) parentId = data.id
    }
    if (!parentId && name) {
      const { data } = await supabase.from('parents').select('id').eq('name', name).maybeSingle()
      if (data) parentId = data.id
    }

    // ── צור הורה אם לא קיים ────────────────────────────────────────────────
    if (!parentId) {
      // phone הוא NOT NULL — placeholder אם אין טלפון אמיתי
      const phoneToUse = phone || `gi_${docId || Date.now()}`
      const { data: newParent } = await supabase
        .from('parents')
        .insert({ name: name || 'לא ידוע', phone: phoneToUse, email: email || null, sync_source: 'greeninvoice_webhook' })
        .select('id')
        .single()

      if (newParent) parentId = newParent.id
    }

    if (!parentId) return NextResponse.json({ ok: true, warning: 'parent not resolved' })

    // ── צור רשומת תשלום ────────────────────────────────────────────────────
    await supabase.from('payments').insert({
      parent_id:        parentId,
      amount:           amount || null,
      status:           'שולם',
      paid_at:          paidAt,
      greeninvoice_ref: docId || null,
      source:           'greeninvoice_webhook',
      failure_reason:   docName || null,
    })

    // ── timeline ────────────────────────────────────────────────────────────
    await supabase.from('registration_timeline').insert({
      parent_id:   parentId,
      event_type:  'payment',
      new_value:   'שולם',
      description: `תשלום חשבונית ירוקה — ${amount}₪ (${docName})`,
      performed_by: 'מערכת',
    })

    console.log(`[GI Webhook] ✅ parent ${parentId}, amount ${amount}₪`)
    return NextResponse.json({ ok: true, parent_id: parentId })

  } catch (err) {
    console.error('[GI Webhook] Error:', err)
    return NextResponse.json({ ok: true })
  }
}
