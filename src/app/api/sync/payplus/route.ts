export const dynamic = 'force-dynamic'

// ─── PayPlus → Supabase Sync ─────────────────────────────────────────────────
// קריאה בלבד מ-PayPlus API
// כותב רק ל-Supabase שלנו — לא נוגע בנתוני PayPlus
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'

const PAYPLUS_BASE = process.env.PAYPLUS_BASE_URL ?? 'https://restapi.payplus.co.il'

function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s\-\.\(\)\+]/g, '')
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

  try {
    // ── שלב 1: שליפת עסקאות מ-PayPlus (קריאה בלבד) ─────────────────────────
    const ppRes = await fetch(`${PAYPLUS_BASE}/api/v1.0/Transactions/GetTransactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key':      apiKey,
        'secret-key':   secretKey,
      },
      body: JSON.stringify({ PageNumber: 1, RowsPerPage: 200 }),
    })

    if (!ppRes.ok) {
      return NextResponse.json({ error: `PayPlus HTTP ${ppRes.status}` }, { status: 500 })
    }

    const ppData = await ppRes.json()
    const transactions: Record<string, unknown>[] = ppData?.data?.transactions ?? ppData?.data?.Transactions ?? []

    if (!transactions.length) {
      return NextResponse.json({ message: 'אין עסקאות ב-PayPlus', stats })
    }

    // ── שלב 2: עבור על כל עסקה ─────────────────────────────────────────────
    for (const tx of transactions) {
      try {
        const txId    = String(tx.uid ?? tx.UID ?? tx.page_request_uid ?? '')
        const name    = String(tx.customer_name ?? tx.CustomerName ?? '')
        const rawPhone = String(tx.customer_phone ?? tx.CustomerPhone ?? tx.phone ?? '')
        const email   = String(tx.customer_email ?? tx.CustomerEmail ?? tx.email ?? '')
        const amount  = Number(tx.amount ?? tx.Amount ?? tx.sum ?? 0)
        const paidAt  = String(tx.created_date ?? tx.CreatedDate ?? tx.date ?? new Date().toISOString())

        if (!rawPhone && !name) { stats.errors.push(`דילוג: אין שם ולא טלפון — ${txId}`); continue }

        const phone = rawPhone ? normalizePhone(rawPhone) : null

        // ── מציאה/יצירה של הורה ────────────────────────────────────────────
        let parentId: string

        if (phone) {
          // חפש לפי טלפון
          const { data: existing } = await supabase
            .from('parents')
            .select('id, name, email')
            .eq('phone', phone)
            .maybeSingle()

          if (existing) {
            parentId = existing.id
            // עדכן פרטים חסרים בלבד
            const patch: Record<string, string> = {}
            if (!existing.email && email) patch.email = email
            if (!existing.name && name)   patch.name  = name
            if (Object.keys(patch).length) {
              await supabase.from('parents').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', parentId)
            }
            stats.parents_updated++
          } else {
            // צור הורה חדש
            const { data: created, error: cErr } = await supabase
              .from('parents')
              .insert({ name, phone, email: email || null, sync_source: 'payplus', external_ref: txId })
              .select('id')
              .single()

            if (cErr || !created) { stats.errors.push(`שגיאה ביצירת הורה ${name}: ${cErr?.message}`); continue }
            parentId = created.id
            stats.parents_created++
          }
        } else {
          // אין טלפון — חפש לפי שם
          const { data: byName } = await supabase
            .from('parents')
            .select('id')
            .eq('name', name)
            .maybeSingle()

          if (byName) {
            parentId = byName.id
            stats.parents_updated++
          } else {
            // phone הוא NOT NULL — צור placeholder ייחודי
            const phoneplaceholder = `pp_${txId || Date.now()}`
            const { data: created, error: cErr } = await supabase
              .from('parents')
              .insert({ name, phone: phoneplaceholder, email: email || null, sync_source: 'payplus', external_ref: txId })
              .select('id')
              .single()

            if (cErr || !created) { stats.errors.push(`שגיאה ביצירת הורה ${name}: ${cErr?.message}`); continue }
            parentId = created.id
            stats.parents_created++
          }
        }

        // ── בדוק אם תשלום קיים ─────────────────────────────────────────────
        if (txId) {
          const { data: existingPay } = await supabase
            .from('payments')
            .select('id')
            .eq('payplus_ref', txId)
            .maybeSingle()

          if (existingPay) { stats.payments_skipped++; continue }
        }

        // ── צור רשומת תשלום ────────────────────────────────────────────────
        const { error: payErr } = await supabase
          .from('payments')
          .insert({
            parent_id:   parentId,
            amount:      amount || null,
            status:      'שולם',
            paid_at:     new Date(paidAt).toISOString(),
            payplus_ref: txId || null,
            source:      'payplus',
          })

        if (payErr) {
          stats.errors.push(`שגיאה בתשלום ${txId}: ${payErr.message}`)
        } else {
          stats.payments_created++
        }

      } catch (txErr) {
        stats.errors.push(`שגיאה בעסקה: ${String(txErr)}`)
      }
    }

    return NextResponse.json({
      success: true,
      total_transactions: transactions.length,
      stats,
    })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
