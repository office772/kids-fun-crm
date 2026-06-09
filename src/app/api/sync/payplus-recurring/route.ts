export const dynamic = 'force-dynamic'

// ─── PayPlus Recurring Import ─────────────────────────────────────────────────
// מקבל מערך הוראות קבע שנשלפו מהדשבורד ומייבא לסופאבייס
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

interface RecurringRecord {
  name:              string
  phone:             string | null
  email:             string | null
  amount:            number
  pp_recurring_uid:  string
  customer_uid:      string
  start_date?:       string
  last_charge?:      string | null
}

function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s\-\.\(\)\+]/g, '')
  if (p.startsWith('972')) p = '0' + p.slice(3)
  if (!p.startsWith('0') && p.length === 9) p = '0' + p
  return p
}

export async function POST(req: NextRequest) {
  try {
    const records: RecurringRecord[] = await req.json()

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'נדרש מערך של רשומות' }, { status: 400, headers: CORS })
    }

    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()

    const stats = {
      parents_created: 0,
      parents_updated: 0,
      payments_created: 0,
      payments_skipped: 0,
      errors: [] as string[],
    }

    for (const rec of records) {
      try {
        const phone = rec.phone ? normalizePhone(rec.phone) : null
        const name  = rec.name?.trim() || 'לא ידוע'
        const email = rec.email?.trim() || null

        // ── חיפוש הורה קיים ─────────────────────────────────────────────────
        let parentId: string | null = null

        if (phone) {
          const { data } = await supabase.from('parents').select('id,email,name').eq('phone', phone).maybeSingle()
          if (data) {
            parentId = data.id
            const patch: Record<string, string> = {}
            if (!data.email && email) patch.email = email
            if (Object.keys(patch).length) {
              await supabase.from('parents').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', parentId)
            }
            stats.parents_updated++
          }
        }

        if (!parentId && email) {
          const { data } = await supabase.from('parents').select('id').eq('email', email).maybeSingle()
          if (data) { parentId = data.id; stats.parents_updated++ }
        }

        if (!parentId && name) {
          const { data } = await supabase.from('parents').select('id').eq('name', name).maybeSingle()
          if (data) { parentId = data.id; stats.parents_updated++ }
        }

        // ── צור הורה אם לא קיים ─────────────────────────────────────────────
        if (!parentId) {
          const phoneToUse = phone || `pp_${rec.pp_recurring_uid}`
          const { data: created, error: cErr } = await supabase
            .from('parents')
            .insert({
              name,
              phone:       phoneToUse,
              email,
              sync_source: 'payplus_recurring',
              external_ref: rec.pp_recurring_uid,
            })
            .select('id')
            .single()

          if (cErr || !created) {
            stats.errors.push(`שגיאה ביצירת הורה ${name}: ${cErr?.message}`)
            continue
          }
          parentId = created.id
          stats.parents_created++
        }

        // ── בדוק אם הוראת קבע כבר קיימת ────────────────────────────────────
        if (rec.pp_recurring_uid) {
          const { data: existingPay } = await supabase
            .from('payments')
            .select('id')
            .eq('payplus_ref', rec.pp_recurring_uid)
            .maybeSingle()

          if (existingPay) { stats.payments_skipped++; continue }
        }

        // ── צור רשומת תשלום (הוראת קבע פעילה) ──────────────────────────────
        const paidAt = rec.last_charge
          ? new Date(rec.last_charge.split('/').reverse().join('-')).toISOString()
          : new Date().toISOString()

        const { error: payErr } = await supabase.from('payments').insert({
          parent_id:   parentId,
          amount:      rec.amount || null,
          status:      'שולם',
          paid_at:     paidAt,
          payplus_ref: rec.pp_recurring_uid,
          source:      'payplus_recurring',
        })

        if (payErr) {
          stats.errors.push(`שגיאה בתשלום ${name}: ${payErr.message}`)
        } else {
          stats.payments_created++
        }

      } catch (e) {
        stats.errors.push(`שגיאה: ${String(e)}`)
      }
    }

    return NextResponse.json({ success: true, total: records.length, stats }, { headers: CORS })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: CORS })
  }
}
