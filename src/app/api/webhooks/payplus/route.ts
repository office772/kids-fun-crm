export const dynamic = 'force-dynamic'

// ─── PayPlus Webhook Handler ─────────────────────────────────────────────────
// PayPlus יקרא ל-endpoint זה לאחר תשלום מוצלח / כישלון
// Docs: https://docs.payplus.co.il/reference/validate-requests-received-from-payplus
//
// POST /api/webhooks/payplus
// ──────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { isDemoMode } from '@/lib/demo-data'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // ─── לוג לדיבוג ────────────────────────────────────────────────────────
    console.log('[PayPlus Webhook] Received:', JSON.stringify(body, null, 2))

    if (isDemoMode()) {
      console.log('[PayPlus Webhook] Demo mode — ignoring')
      return NextResponse.json({ ok: true })
    }

    // ─── חילוץ נתונים ─────────────────────────────────────────────────────
    // PayPlus שולח את פרטי העסקה בשדה transaction או ישירות
    const transaction = body?.transaction ?? body
    const status      = transaction?.status_code ?? transaction?.status
    const externalUid = transaction?.order?.external_uid ?? body?.order?.external_uid
    const amount      = transaction?.amount ?? body?.amount
    const orderId     = transaction?.uid ?? body?.uid

    // ─── עסקה מוצלחת ──────────────────────────────────────────────────────
    if (status === '000' || status === 'COMPLETED' || Number(status) === 0) {
      console.log(`[PayPlus Webhook] Payment SUCCESS — order: ${externalUid}, amount: ${amount}₪, payplus_id: ${orderId}`)

      try {
        const { createServiceClient } = await import('@/lib/supabase/server')
        const supabase = createServiceClient()

        // עדכן תשלום קיים לפי registration_id (external_uid)
        if (externalUid) {
          const paidAt = new Date().toISOString()

          // עדכן payment
          await supabase
            .from('payments')
            .update({
              status:      'שולם',
              paid_at:     paidAt,
              payplus_ref: orderId,
            })
            .eq('parent_id', externalUid)  // fallback — אפשר לשפר לפי registration_id
            .eq('status', 'ממתין')

          // עדכן registration לאישור אם ממתין לתשלום
          await supabase
            .from('registrations')
            .update({
              status:            'מאושר',
              payment_method:    'credit',
              payment_setup_at:  paidAt,
            })
            .eq('id', externalUid)
            .eq('status', 'ממתין לאישור')
        }
      } catch (dbErr) {
        console.error('[PayPlus Webhook] DB update error:', dbErr)
        // לא מחזירים שגיאה — PayPlus לא צריך לדעת על בעיות DB פנימיות
      }

      return NextResponse.json({ ok: true })
    }

    // ─── עסקה נכשלה ────────────────────────────────────────────────────────
    console.log(`[PayPlus Webhook] Payment FAILED — order: ${externalUid}, status: ${status}`)

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[PayPlus Webhook] Error processing webhook:', err)
    // תמיד מחזירים 200 ל-PayPlus (לא לנסות שוב)
    return NextResponse.json({ ok: true })
  }
}
