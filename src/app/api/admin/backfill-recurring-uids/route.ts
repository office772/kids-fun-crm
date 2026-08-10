export const dynamic = 'force-dynamic'

// ─── מילוי חד-פעמי של recurring_uid על ההורים ────────────────────────────────
// מושך את דו"ח החיובים מ-PayPlus (טווח ימים נרחב, ברירת מחדל 90), ולכל רשומה
// עם recurring_uid — מתאים להורה (לפי טלפון) ושומר את ה-uid + status=active.
// כך חידוש הכרטיס (CreditCardRenewal) יוכל לעבוד גם להוראות קבע שהוקמו בעבר
// ישירות בדשבורד PayPlus (שה-uid שלהן לא היה אצלנו).
//
// הרצה: GET /api/admin/backfill-recurring-uids?days=90  (אימות: CRON_SECRET אם מוגדר)
// מחזיר גם sampleFields = שמות השדות ברשומה הראשונה — לאימות מבנה הדו"ח.

import { NextRequest, NextResponse } from 'next/server'
import { fetchChargedReport, isPayPlusApiConfigured, type ChargedRecord } from '@/lib/payplus-api'
import { isAuthorizedCron, unauthorized } from '@/lib/api-auth'

// בורר ערך לפי כמה שמות-שדה אפשריים (PayPlus לא תמיד עקבי)
function pick(rec: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = rec[k]
    if (v != null && String(v).trim() !== '') return String(v)
  }
  return undefined
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return unauthorized()
  if (!isPayPlusApiConfigured()) {
    return NextResponse.json({ ok: false, reason: 'PayPlus API not configured' })
  }

  const days = Math.min(Math.max(parseInt(new URL(req.url).searchParams.get('days') ?? '90', 10) || 90, 1), 365)
  const toDate   = new Date().toISOString().slice(0, 10)
  const fromDate = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)

  // עמוד-עמוד (take=500) עד שמסתיים
  const records: ChargedRecord[] = []
  for (let skip = 0; skip < 10000; skip += 500) {
    const page = await fetchChargedReport(fromDate, toDate, skip, 500)
    if (!page.success) {
      if (skip === 0) return NextResponse.json({ ok: false, reason: 'charged report failed', error: page.error })
      break
    }
    const recs = page.data ?? []
    records.push(...recs)
    if (recs.length < 500) break
  }

  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()

  const stats = { records: records.length, withUid: 0, matched: 0, stored: 0, alreadySet: 0, noMatch: 0 }
  // שמות השדות ברשומה הראשונה — לאימות מבנה (ללא ערכים/PII)
  const sampleFields = records.length ? Object.keys(records[0] as Record<string, unknown>) : []

  for (const recRaw of records) {
    const rec = recRaw as unknown as Record<string, unknown>
    const uid = pick(rec, ['recurring_uid', 'recurringUid', 'recurring_payment_uid', 'recurring_payments_uid'])
    if (!uid) continue
    stats.withUid++

    // הדו"ח לא כולל טלפון — מתאימים לפי שם הלקוח (customer_name) באופן חד-משמעי
    const name = pick(rec, ['customer_name', 'customerName'])?.trim()
    if (!name) { stats.noMatch++; continue }

    let { data: matches } = await supabase
      .from('parents').select('id, payplus_recurring_uid').ilike('name', name).limit(2)
    if (!matches?.length) {
      const res = await supabase.from('parents').select('id, payplus_recurring_uid').ilike('name', `%${name}%`).limit(2)
      matches = res.data
    }
    // רק התאמה חד-משמעית (שם יחיד) — לא מנחשים אם יש כפילות
    if (!matches || matches.length !== 1) { stats.noMatch++; continue }
    const parent = matches[0]
    stats.matched++
    if (parent.payplus_recurring_uid) { stats.alreadySet++; continue }

    const { error } = await supabase
      .from('parents')
      .update({ payplus_recurring_uid: uid, payplus_recurring_status: 'active' })
      .eq('id', parent.id)
    if (!error) stats.stored++
  }

  return NextResponse.json({ ok: true, days, sampleFields, stats })
}
