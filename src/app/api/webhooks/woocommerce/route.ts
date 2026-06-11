export const dynamic = 'force-dynamic'

// ─── WooCommerce Webhook Handler (אתר kidsandfun.co.il) ──────────────────────
// רישום לקייטנה נשאר באתר (מוצר ווקומרס + סליקת PayPlus בקופה).
// ה-webhook שולח לכאן כל הזמנה (order.created / order.updated) —
// ואנחנו יוצרים: הורה + ילד + רישום (קייטנה) + תשלום.
// שדות הילד מגיעים מ-meta_data של הפריט (תוסף "שדות מוצר גמישים").
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s\-.()+]/g, '')
  if (p.startsWith('972')) p = '0' + p.slice(3)
  if (!p.startsWith('0') && p.length === 9) p = '0' + p
  return p
}

// מיפוי סטטוס הזמנה בווקומרס → סטטוס תשלום אצלנו
function mapOrderStatus(wcStatus: string): 'שולם' | 'ממתין' | 'נכשל' | 'זיכוי' {
  switch (wcStatus) {
    case 'processing':
    case 'completed':  return 'שולם'
    case 'failed':     return 'נכשל'
    case 'refunded':
    case 'cancelled':  return 'זיכוי'
    default:           return 'ממתין'   // pending / on-hold
  }
}

interface WCMetaData { key?: string; display_key?: string; value?: unknown; display_value?: unknown }
interface WCLineItem { name?: string; product_id?: number; meta_data?: WCMetaData[]; total?: string }

// חילוץ שדה מתוך meta_data לפי תווית בעברית (תוסף השדות הגמישים שולח את התווית)
function metaByLabel(meta: WCMetaData[], pattern: RegExp): string {
  for (const m of meta) {
    const label = String(m.display_key ?? m.key ?? '')
    if (pattern.test(label)) {
      const v = m.display_value ?? m.value
      if (v != null && String(v).trim()) return String(v).trim()
    }
  }
  return ''
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()

    // ── אימות חתימה (HMAC-SHA256, base64) ──────────────────────────────────
    const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET
    const signature = req.headers.get('x-wc-webhook-signature')
    if (secret && signature) {
      const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
      if (signature !== expected) {
        console.error('[Woo Webhook] Invalid signature — rejecting')
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
      }
    }

    // ── ping בעת יצירת ה-webhook (form-encoded: webhook_id=...) ─────────────
    if (!rawBody.trim().startsWith('{')) {
      console.log('[Woo Webhook] Ping received:', rawBody.slice(0, 100))
      return NextResponse.json({ ok: true, ping: true })
    }

    const order = JSON.parse(rawBody)
    const orderId = order?.id
    if (!orderId) return NextResponse.json({ ok: true, warning: 'no order id' })

    const wcStatus  = String(order.status ?? '')
    const payStatus = mapOrderStatus(wcStatus)
    const total     = Number(order.total ?? 0)
    const billing   = order.billing ?? {}
    const parentName  = `${billing.first_name ?? ''} ${billing.last_name ?? ''}`.trim()
    const rawPhone    = String(billing.phone ?? '')
    const email       = String(billing.email ?? '')
    const lineItems: WCLineItem[] = Array.isArray(order.line_items) ? order.line_items : []
    const productNames = lineItems.map(li => li.name).filter(Boolean).join(' + ')
    const paidAt = order.date_paid ? new Date(order.date_paid).toISOString() : null

    console.log(`[Woo Webhook] order=${orderId}, status=${wcStatus}, total=${total}, parent=${parentName}, phone=${rawPhone}`)

    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const wooRef = `woo_${orderId}`

    // ── מציאה/יצירה של הורה ─────────────────────────────────────────────────
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
    if (!parentId) {
      const { data: newParent, error } = await supabase
        .from('parents')
        .insert({
          name:         parentName || 'לא ידוע',
          phone:        phone || wooRef,
          email:        email || null,
          city:         billing.city || null,
          sync_source:  'woocommerce',
          external_ref: wooRef,
        })
        .select('id').single()
      if (error || !newParent) {
        console.error('[Woo Webhook] Failed to create parent:', error?.message)
        return NextResponse.json({ ok: true, warning: 'parent not resolved' })
      }
      parentId = newParent.id
    }

    // ── ילד מתוך שדות המוצר הגמישים ────────────────────────────────────────
    let childId: string | null = null
    const meta = lineItems.flatMap(li => li.meta_data ?? [])
    if (meta.length) {
      const childFirst = metaByLabel(meta, /^שם פרטי/)
      const childLast  = metaByLabel(meta, /^שם משפחה/)
      // חלק מההורים מקלידים שם מלא בשדה "שם פרטי" — נמנעים מכפילות ("שי וינטראוב וינטראוב")
      const childName  = (childLast && childFirst.endsWith(childLast)
        ? childFirst
        : `${childFirst} ${childLast}`).trim()
      if (childName) {
        const { data: existingChild } = await supabase
          .from('children').select('id').eq('parent_id', parentId).eq('name', childName).maybeSingle()
        if (existingChild) {
          childId = existingChild.id
        } else {
          const { data: newChild } = await supabase
            .from('children')
            .insert({
              parent_id:     parentId,
              name:          childName,
              framework:     'קייטנה',
              school:        metaByLabel(meta, /בית חינוכי|בית ספר|^גן/) || null,
              grade:         metaByLabel(meta, /כיתה/) || null,
              gender:        metaByLabel(meta, /^מין/) || null,
              id_number:     metaByLabel(meta, /תעודת זהות|ת\.?ז/) || null,
              allergies:     metaByLabel(meta, /אלרגיה|רגישות למזון/) || null,
              dietary:       metaByLabel(meta, /צמחוני|טבעוני/) || null,
              medical_notes: metaByLabel(meta, /בעיה רפואית|פרט\/י בתיבה/) || null,
              program:       productNames || null,
            })
            .select('id').single()
          if (newChild) childId = newChild.id
        }
      }
    }

    // ── תשלום: עדכון אם קיים (order.updated) או יצירה ───────────────────────
    const { data: existingPay } = await supabase
      .from('payments').select('id,status').eq('payplus_ref', wooRef).maybeSingle()

    if (existingPay) {
      if (existingPay.status !== payStatus) {
        await supabase.from('payments').update({
          status:  payStatus,
          paid_at: payStatus === 'שולם' ? (paidAt ?? new Date().toISOString()) : null,
          amount:  total || null,
        }).eq('id', existingPay.id)

        // התשלום הושלם → גם הרישום לקייטנה מאושר (ולהפך בזיכוי/ביטול)
        if (payStatus === 'שולם') {
          await supabase.from('registrations')
            .update({ status: 'מאושר' })
            .eq('parent_id', parentId).eq('type', 'קייטנה')
            .eq('status', 'ממתין לאישור')
            .like('notes', `%#${orderId})%`)
        } else if (payStatus === 'זיכוי') {
          await supabase.from('registrations')
            .update({ status: 'בוטל' })
            .eq('parent_id', parentId).eq('type', 'קייטנה')
            .like('notes', `%#${orderId})%`)
        }
        console.log(`[Woo Webhook] Payment ${wooRef} updated → ${payStatus}`)
      }
    } else {
      await supabase.from('payments').insert({
        parent_id:      parentId,
        child_id:       childId,
        amount:         total || null,
        status:         payStatus,
        payment_type:   'כרטיס אשראי',
        paid_at:        payStatus === 'שולם' ? (paidAt ?? new Date().toISOString()) : null,
        payplus_ref:    wooRef,
        source:         'woocommerce',
        failure_reason: productNames || null,   // שם הקייטנה כהקשר (כמו בייבוא חשבונית ירוקה)
      })

      // רישום לקייטנה
      await supabase.from('registrations').insert({
        parent_id: parentId,
        child_id:  childId,
        type:      'קייטנה',
        status:    payStatus === 'שולם' ? 'מאושר' : 'ממתין לאישור',
        notes:     `רישום מאתר kidsandfun.co.il — ${productNames} (הזמנה #${orderId})`,
      })

      await supabase.from('registration_timeline').insert({
        parent_id:    parentId,
        event_type:   'payment',
        new_value:    payStatus,
        description:  `הזמנת קייטנה מהאתר — ${productNames} — ₪${total} (#${orderId})`,
        performed_by: 'מערכת',
        metadata:     { amount: total, woo_order_id: orderId, wc_status: wcStatus },
      })

      // כשל תשלום → משימה
      if (payStatus === 'נכשל') {
        await supabase.from('tasks').insert({
          parent_id:   parentId,
          type:        'כשל תשלום',
          description: `כשל תשלום בהזמנת קייטנה מהאתר — ${productNames} — ₪${total} (#${orderId})`,
          priority:    'דחוף',
          status:      'פתוח',
        })
      }
    }

    console.log(`[Woo Webhook] ✅ order ${orderId} → parent ${parentId}, payment ${payStatus}`)
    return NextResponse.json({ ok: true, parent_id: parentId, status: payStatus })

  } catch (err) {
    console.error('[Woo Webhook] Error:', err)
    return NextResponse.json({ ok: true }) // תמיד 200 כדי שווקומרס לא ישבית את ה-webhook
  }
}
