export const dynamic = 'force-dynamic'

// ─── סנכרון יומי של חיובים מ-PayPlus ─────────────────────────────────────────
// רץ כל בוקר (בנפרד מ-payments-check). שולף את 3 הדו"חות מ-PayPlus:
//   - חיובים שבוצעו (charged)
//   - חיובים שנכשלו (failures)
//   - כרטיסים שפג תוקפם (expiredcards)
// מצליב מול ה-CRM ומשלים רשומות חסרות / מעדכן סטטוסים.
// משמש כ-safety net במקרה ש-callback אחד נכשל או הלך לאיבוד.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import { fetchChargedReport, fetchFailuresReport, fetchExpiredCardsReport, isPayPlusApiConfigured, type ChargedRecord } from '@/lib/payplus-api'

export async function GET() {
  if (!isPayPlusApiConfigured()) {
    console.log('[Cron payplus-sync] PayPlus API not configured — skipping')
    return NextResponse.json({ ok: true, skipped: true, reason: 'api not configured' })
  }

  // טווח: 7 ימים אחורה (יתפוס גם חיובים שדווחו באיחור)
  const toDate   = new Date().toISOString().slice(0, 10)
  const fromDate = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)

  const [charged, failures, expired] = await Promise.all([
    fetchChargedReport(fromDate, toDate),
    fetchFailuresReport(fromDate, toDate),
    fetchExpiredCardsReport(),
  ])

  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()

  const stats = { reconciled: 0, new_charges: 0, marked_expired: 0, errors: 0 }

  // ─── חיובים שבוצעו: לוודא שיש להם רשומה ב-CRM ─────────────────────────────
  for (const rec of (charged.data ?? [])) {
    try {
      if (!rec.transaction_uid) continue
      const { data: existing } = await supabase
        .from('payments').select('id').eq('payplus_transaction_uid', rec.transaction_uid).maybeSingle()
      if (existing) { stats.reconciled++; continue }

      // חיוב שלא נקלט דרך webhook — מצרפים אותו עכשיו
      const parentId = await findParent(supabase, rec)
      if (!parentId) continue

      await supabase.from('payments').insert({
        parent_id:               parentId,
        amount:                  rec.amount ?? null,
        status:                  'שולם',
        payment_type:            'הוראת קבע',
        paid_at:                 rec.payment_date ?? new Date().toISOString(),
        payplus_transaction_uid: rec.transaction_uid,
        payplus_ref:             rec.transaction_uid,
        source:                  'payplus_webhook',
        payment_number:          rec.payment_number ?? null,
      })
      stats.new_charges++
    } catch (err) {
      console.error('[payplus-sync] charged error:', err)
      stats.errors++
    }
  }

  // ─── כשלים: יוצרים משימה דחופה לכל אחד שלא טופל ───────────────────────────
  for (const rec of (failures.data ?? [])) {
    try {
      if (!rec.transaction_uid) continue
      const parentId = await findParent(supabase, rec)
      if (!parentId) continue
      const { data: existing } = await supabase
        .from('payments').select('id').eq('payplus_transaction_uid', rec.transaction_uid).maybeSingle()
      if (existing) continue

      await supabase.from('payments').insert({
        parent_id:               parentId,
        amount:                  rec.amount ?? null,
        status:                  'נכשל',
        payment_type:            'הוראת קבע',
        payplus_transaction_uid: rec.transaction_uid,
        payplus_ref:             rec.transaction_uid,
        source:                  'payplus_webhook',
        failure_reason:          'חיוב נכשל (נקלט בסנכרון יומי)',
      })
      await supabase.from('tasks').insert({
        parent_id:   parentId,
        type:        'כשל תשלום',
        description: `כשל חיוב הוראת קבע — ${rec.customer_name ?? ''} (₪${rec.amount ?? '?'}) | נקלט בסנכרון יומי`,
        priority:    'דחוף',
        status:      'פתוח',
      })
    } catch (err) {
      console.error('[payplus-sync] failure error:', err)
      stats.errors++
    }
  }

  // ─── כרטיסים שפג תוקפם: סימון בהורה ──────────────────────────────────────
  for (const rec of (expired.data ?? [])) {
    try {
      const parentId = await findParent(supabase, rec)
      if (!parentId) continue
      await supabase.from('parents').update({ payplus_recurring_status: 'expired' }).eq('id', parentId)
      // לא יוצרים משימה כפולה אם כבר קיימת היום
      const today = new Date().toISOString().slice(0, 10)
      const { data: existingTask } = await supabase
        .from('tasks').select('id')
        .eq('parent_id', parentId).eq('type', 'כשל תשלום')
        .gte('created_at', today).maybeSingle()
      if (!existingTask) {
        await supabase.from('tasks').insert({
          parent_id:   parentId,
          type:        'כשל תשלום',
          description: `🟡 כרטיס אשראי פג תוקף — ${rec.customer_name ?? ''} | יש לעדכן פרטי כרטיס`,
          priority:    'גבוה',
          status:      'פתוח',
        })
      }
      stats.marked_expired++
    } catch (err) {
      console.error('[payplus-sync] expired error:', err)
      stats.errors++
    }
  }

  console.log(`[payplus-sync] reconciled=${stats.reconciled} new_charges=${stats.new_charges} expired=${stats.marked_expired} errors=${stats.errors}`)
  return NextResponse.json({ ok: true, stats })
}

// helper: מציאת הורה לפי טלפון/recurring_uid
async function findParent(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createServiceClient>>,
  rec: ChargedRecord
): Promise<string | null> {
  if (rec.recurring_uid) {
    const { data } = await supabase
      .from('parents').select('id').eq('payplus_recurring_uid', rec.recurring_uid).maybeSingle()
    if (data) return data.id
  }
  if (rec.customer_phone) {
    const phone = rec.customer_phone.replace(/\D/g, '').replace(/^972/, '0')
    const { data } = await supabase.from('parents').select('id').eq('phone', phone).maybeSingle()
    if (data) return data.id
  }
  return null
}
