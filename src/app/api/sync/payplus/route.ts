export const dynamic = 'force-dynamic'

// ─── PayPlus → Supabase Sync ─────────────────────────────────────────────────
// קריאה בלבד מ-PayPlus API. כותב רק ל-Supabase שלנו — לא נוגע בנתוני PayPlus.
//
// ⚠️ הערה חשובה (יוני 2026):
// PayPlus חוסם קריאות שרת מכתובת ה-IP של Vercel:
//   • Transactions/GetTransactions            → 403 (IP blocked)
//   • TransactionReports/TransactionsApproval → 422 (אין הרשאה)
//   • recurring-payments/list (internal)      → 405 (דורש session דפדפן)
// לכן ה-route מנסה את ה-endpoint הרשמי, ואם הוא חסום — מחזיר הודעה ברורה
// במקום לקרוס. נתונים חדשים נכנסים ממילא אוטומטית דרך webhook בזמן אמת.
// לייבוא היסטורי משתמשים בכלי הדפדפן → POST /api/sync/payplus-recurring.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'

const PAYPLUS_BASE = process.env.PAYPLUS_SANDBOX === 'true'
  ? 'https://restapidev.payplus.co.il/api/v1.0'
  : 'https://restapi.payplus.co.il/api/v1.0'

function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s\-.()+]/g, '')
  if (p.startsWith('972')) p = '0' + p.slice(3)
  if (!p.startsWith('0')) p = '0' + p
  return p
}

export async function POST() {
  const apiKey    = process.env.PAYPLUS_API_KEY
  const secretKey = process.env.PAYPLUS_SECRET_KEY

  if (!apiKey || !secretKey) {
    return NextResponse.json({ error: 'PayPlus keys missing' }, { status: 500 })
  }

  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()

  const stats = { parents_created: 0, parents_updated: 0, payments_created: 0, payments_skipped: 0, errors: [] as string[] }

  // ── ניסיון שליפת עסקאות מ-PayPlus (best-effort, לרוב חסום מ-Vercel) ──────────
  let transactions: Record<string, unknown>[] = []
  try {
    const ppRes = await fetch(`${PAYPLUS_BASE}/Transactions/GetTransactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key':      apiKey,
        'secret-key':   secretKey,
      },
      body: JSON.stringify({ PageNumber: 1, RowsPerPage: 200 }),
    })

    if (!ppRes.ok) {
      // PayPlus חוסם את ה-IP — לא שגיאה אמיתית, מצב ידוע. הודעה ברורה במקום קריסה.
      return NextResponse.json({
        success: true,
        blocked: true,
        message:
          `ℹ️ PayPlus חוסם קריאות שרת (HTTP ${ppRes.status}). ` +
          `אין צורך בייבוא ידני — תשלומים חדשים נכנסים אוטומטית בזמן אמת דרך webhook. ` +
          `לייבוא היסטורי השתמשו בכלי הדפדפן.`,
        stats,
      })
    }

    const ppData = await ppRes.json()
    transactions = ppData?.data?.transactions ?? ppData?.data?.Transactions ?? []
  } catch (err) {
    return NextResponse.json({
      success: true,
      blocked: true,
      message: `ℹ️ לא ניתן להתחבר ל-PayPlus מהשרת. תשלומים מתעדכנים אוטומטית דרך webhook. (${String(err)})`,
      stats,
    })
  }

  if (!transactions.length) {
    return NextResponse.json({ success: true, message: 'אין עסקאות חדשות ב-PayPlus', stats })
  }

  // ── עיבוד עסקאות (במקרה הנדיר שה-API כן מחזיר נתונים) ──────────────────────
  try {
    for (const tx of transactions) {
      try {
        const txId     = String(tx.uid ?? tx.UID ?? tx.page_request_uid ?? '')
        const name     = String(tx.customer_name ?? tx.CustomerName ?? '')
        const rawPhone = String(tx.customer_phone ?? tx.CustomerPhone ?? tx.phone ?? '')
        const email    = String(tx.customer_email ?? tx.CustomerEmail ?? tx.email ?? '')
        const amount   = Number(tx.amount ?? tx.Amount ?? tx.sum ?? 0)
        const paidAt   = String(tx.created_date ?? tx.CreatedDate ?? tx.date ?? new Date().toISOString())

        if (!rawPhone && !name) { stats.errors.push(`דילוג: אין שם ולא טלפון — ${txId}`); continue }

        const phone = rawPhone ? normalizePhone(rawPhone) : null
        let parentId: string

        if (phone) {
          const { data: existing } = await supabase
            .from('parents').select('id, name, email').eq('phone', phone).maybeSingle()

          if (existing) {
            parentId = existing.id
            const patch: Record<string, string> = {}
            if (!existing.email && email) patch.email = email
            if (!existing.name && name)   patch.name  = name
            if (Object.keys(patch).length) {
              await supabase.from('parents').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', parentId)
            }
            stats.parents_updated++
          } else {
            const { data: created, error: cErr } = await supabase
              .from('parents')
              .insert({ name, phone, email: email || null, sync_source: 'payplus', external_ref: txId })
              .select('id').single()
            if (cErr || !created) { stats.errors.push(`שגיאה ביצירת הורה ${name}: ${cErr?.message}`); continue }
            parentId = created.id
            stats.parents_created++
          }
        } else {
          const { data: byName } = await supabase.from('parents').select('id').eq('name', name).maybeSingle()
          if (byName) {
            parentId = byName.id
            stats.parents_updated++
          } else {
            const phoneplaceholder = `pp_${txId || Date.now()}`
            const { data: created, error: cErr } = await supabase
              .from('parents')
              .insert({ name, phone: phoneplaceholder, email: email || null, sync_source: 'payplus', external_ref: txId })
              .select('id').single()
            if (cErr || !created) { stats.errors.push(`שגיאה ביצירת הורה ${name}: ${cErr?.message}`); continue }
            parentId = created.id
            stats.parents_created++
          }
        }

        if (txId) {
          const { data: existingPay } = await supabase
            .from('payments').select('id').eq('payplus_ref', txId).maybeSingle()
          if (existingPay) { stats.payments_skipped++; continue }
        }

        const { error: payErr } = await supabase
          .from('payments')
          .insert({
            parent_id:    parentId,
            amount:       amount || null,
            status:       'שולם',
            payment_type: 'כרטיס אשראי',
            paid_at:      new Date(paidAt).toISOString(),
            payplus_ref:  txId || null,
            source:       'payplus',
          })

        if (payErr) stats.errors.push(`שגיאה בתשלום ${txId}: ${payErr.message}`)
        else        stats.payments_created++

      } catch (txErr) {
        stats.errors.push(`שגיאה בעסקה: ${String(txErr)}`)
      }
    }

    return NextResponse.json({ success: true, total_transactions: transactions.length, stats })

  } catch (err) {
    return NextResponse.json({ error: String(err), stats }, { status: 500 })
  }
}
