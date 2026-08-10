export const dynamic = 'force-dynamic'

// ─── אבחון PayPlus — קריאה בלבד (אין כתיבה ל-DB) ─────────────────────────────
// מושך את 3 הדו"חות (charged / failures / expiredcards) מ-PayPlus ומחזיר:
//   - sampleFields: שמות השדות ברשומה הראשונה בכל דו"ח (לאימות מבנה)
//   - count: כמה רשומות בכל דו"ח
//   - matches: רשומות שמתאימות ל-uid או לשם שחיפשנו (שדות בטוחים בלבד)
// מטרה: לקבוע סופית אם חיוב מסוים הצליח/נכשל/כרטיס פג, בלי לשנות נתונים.
//
// הרצה: GET /api/admin/payplus-diagnose?days=40&uid=<recurring_uid>&name=<substr>
// אימות: CRON_SECRET (graceful — פתוח אם לא מוגדר).

import { NextRequest, NextResponse } from 'next/server'
import { fetchChargedReport, fetchFailuresReport, fetchExpiredCardsReport, isPayPlusApiConfigured } from '@/lib/payplus-api'
import { isAuthorizedCron, unauthorized } from '@/lib/api-auth'

type Rec = Record<string, unknown>

// שדות "בטוחים" להחזרה (בלי מספרי כרטיס מלאים/חשבון בנק)
const SAFE_KEYS = [
  'recurring_number', 'recurring_uid', 'uid', 'transaction_uid', 'customer_name',
  'amount', 'currency_code', 'date_to_charge', 'execution_date', 'payment_date',
  'charge_type', 'card_expiry', 'status', 'status_code', 'status_description',
  'error', 'error_description', 'decline_reason', 'reason', 'payment_number',
  'number_of_failures',
]

function safe(rec: Rec): Rec {
  const out: Rec = {}
  for (const k of SAFE_KEYS) if (rec[k] != null) out[k] = rec[k]
  // מספר כרטיס — רק 4 ספרות אחרונות
  const card = rec['card_number']
  if (card != null) out['card_last4'] = String(card).slice(-4)
  return out
}

function matchRec(rec: Rec, uid?: string, name?: string): boolean {
  if (uid) {
    for (const k of ['recurring_uid', 'recurringUid', 'recurring_payment_uid']) {
      if (rec[k] != null && String(rec[k]) === uid) return true
    }
  }
  if (name) {
    const n = String(rec['customer_name'] ?? rec['customerName'] ?? '')
    if (n.includes(name)) return true
  }
  return false
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return unauthorized()
  if (!isPayPlusApiConfigured()) {
    return NextResponse.json({ ok: false, reason: 'PayPlus API not configured' })
  }

  const url = new URL(req.url)
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') ?? '40', 10) || 40, 1), 365)
  const uid  = url.searchParams.get('uid')  ?? undefined
  const name = url.searchParams.get('name') ?? undefined
  const toDate   = new Date().toISOString().slice(0, 10)
  const fromDate = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)

  const [charged, failures, expired] = await Promise.all([
    fetchChargedReport(fromDate, toDate, 0, 500),
    fetchFailuresReport(fromDate, toDate),
    fetchExpiredCardsReport(),
  ])

  function summarize(label: string, res: { success: boolean; error?: string; data?: unknown[] }) {
    if (!res.success) return { label, ok: false, error: res.error }
    const recs = (res.data ?? []) as Rec[]
    const matches = (uid || name) ? recs.filter(r => matchRec(r, uid, name)).map(safe) : []
    return {
      label,
      ok: true,
      count: recs.length,
      sampleFields: recs.length ? Object.keys(recs[0]) : [],
      matches,
      all: recs.map(safe),
    }
  }

  return NextResponse.json({
    ok: true,
    window: { fromDate, toDate, days },
    query: { uid, name },
    charged:  summarize('charged', charged),
    failures: summarize('failures', failures),
    expired:  summarize('expiredcards', expired),
  })
}
