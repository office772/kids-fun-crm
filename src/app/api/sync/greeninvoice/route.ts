export const dynamic = 'force-dynamic'

// ─── Green Invoice (Morning) → Supabase Sync ─────────────────────────────────
// קריאה בלבד מ-Green Invoice API
// כותב רק ל-Supabase שלנו
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'

const GI_BASE = 'https://api.greeninvoice.co.il/api/v1'

function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s\-\.\(\)\+]/g, '')
  if (p.startsWith('972')) p = '0' + p.slice(3)
  if (!p.startsWith('0') && p.length === 9) p = '0' + p
  return p
}

async function getGIToken(): Promise<string> {
  const res = await fetch(`${GI_BASE}/account/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id:     process.env.GREENINVOICE_API_KEY_ID,
      secret: process.env.GREENINVOICE_SECRET,
    }),
  })
  const data = await res.json()
  if (!data.token) throw new Error(`GI auth failed: ${JSON.stringify(data)}`)
  return data.token
}

// ─── זיהוי סוג הרישום לפי שם המסמך ──────────────────────────────────────────
function detectType(name: string): 'צהרון' | 'קייטנה' {
  if (/קייטנ|camp|summer/i.test(name)) return 'קייטנה'
  return 'צהרון'
}

export async function POST() {
  if (!process.env.GREENINVOICE_API_KEY_ID || !process.env.GREENINVOICE_SECRET) {
    return NextResponse.json({ error: 'Green Invoice keys missing' }, { status: 500 })
  }

  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()

  const stats = { parents_created: 0, parents_updated: 0, payments_created: 0, payments_skipped: 0, errors: [] as string[] }

  try {
    const token = await getGIToken()

    // ── שלב 1: שליפת מסמכים/קישורים ששולמו (קריאה בלבד) ───────────────────
    // type=400 = receipt, status=paid
    const giRes = await fetch(`${GI_BASE}/documents/search`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        pageSize:   200,
        page:       1,
        type:       [400, 305, 320, 330], // קבלות וחשבוניות
        status:     [10],                 // 10 = paid/active
      }),
    })

    if (!giRes.ok) {
      // נסה endpoint חלופי
      const giRes2 = await fetch(`${GI_BASE}/income/doc/list`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ pageSize: 200, page: 1, paid: true }),
      })

      if (!giRes2.ok) {
        return NextResponse.json({ error: `GI HTTP ${giRes.status} / ${giRes2.status}` }, { status: 500 })
      }

      const data2 = await giRes2.json()
      return await processGIDocuments(data2?.items ?? data2?.documents ?? [], supabase, stats)
    }

    const giData = await giRes.json()
    const docs = giData?.items ?? giData?.documents ?? giData?.data ?? []

    return await processGIDocuments(docs, supabase, stats)

  } catch (err) {
    return NextResponse.json({ error: String(err), stats }, { status: 500 })
  }
}

async function processGIDocuments(
  docs: Record<string, unknown>[],
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createServiceClient>>,
  stats: { parents_created: number; parents_updated: number; payments_created: number; payments_skipped: number; errors: string[] }
): Promise<ReturnType<typeof NextResponse.json>> {
  if (!docs.length) {
    return NextResponse.json({ message: 'אין מסמכים ב-Green Invoice', stats })
  }

  for (const doc of docs) {
    try {
      const docId   = String(doc.id ?? doc.uid ?? '')
      const docName = String(doc.description ?? doc.title ?? doc.name ?? '')
      const amount  = Number(doc.sum ?? doc.amount ?? doc.total ?? 0)
      const paidAt  = String(doc.paymentDate ?? doc.createdAt ?? doc.date ?? new Date().toISOString())

      // חילוץ פרטי לקוח
      const customer = (doc.client ?? doc.customer ?? doc.contact ?? {}) as Record<string, unknown>
      const name     = String(customer.name ?? doc.customerName ?? '')
      const email    = String(customer.email ?? doc.customerEmail ?? customer.emailAddress ?? '')
      const rawPhone = String(customer.phone ?? doc.customerPhone ?? customer.telephone ?? '')

      if (!name && !email) { stats.errors.push(`דילוג GI: אין שם ואימייל — ${docId}`); continue }

      const phone = rawPhone ? normalizePhone(rawPhone) : null

      // ── מציאה/יצירה של הורה ──────────────────────────────────────────────
      let parentId: string

      // חפש לפי טלפון → אימייל → שם
      let existing = null
      if (phone) {
        const { data } = await supabase.from('parents').select('id,name,email').eq('phone', phone).maybeSingle()
        existing = data
      }
      if (!existing && email) {
        const { data } = await supabase.from('parents').select('id,name,email').eq('email', email).maybeSingle()
        existing = data
      }
      if (!existing && name) {
        const { data } = await supabase.from('parents').select('id,name,email').eq('name', name).maybeSingle()
        existing = data
      }

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
        // phone הוא NOT NULL — השתמש ב-placeholder אם אין טלפון אמיתי
        const phoneToUse = phone || `gi_${docId || Date.now()}`
        const { data: created, error: cErr } = await supabase
          .from('parents')
          .insert({ name, email: email || null, phone: phoneToUse, sync_source: 'greeninvoice', external_ref: docId })
          .select('id')
          .single()

        if (cErr || !created) { stats.errors.push(`שגיאה ביצירת הורה GI ${name}: ${cErr?.message}`); continue }
        parentId = created.id
        stats.parents_created++
      }

      // ── בדוק אם תשלום קיים ───────────────────────────────────────────────
      if (docId) {
        const { data: existingPay } = await supabase
          .from('payments')
          .select('id')
          .eq('greeninvoice_ref', docId)
          .maybeSingle()

        if (existingPay) { stats.payments_skipped++; continue }
      }

      // ── צור רשומת תשלום ──────────────────────────────────────────────────
      const { error: payErr } = await supabase
        .from('payments')
        .insert({
          parent_id:        parentId,
          amount:           amount || null,
          status:           'שולם',
          payment_type:     'כרטיס אשראי',    // קישורי תשלום בחשבונית ירוקה = כרטיס אשראי
          paid_at:          new Date(paidAt).toISOString(),
          greeninvoice_ref: docId || null,
          source:           'greeninvoice',
          failure_reason:   docName || null,  // שם המסמך כהקשר
        })

      if (payErr) {
        stats.errors.push(`שגיאה בתשלום GI ${docId}: ${payErr.message}`)
      } else {
        stats.payments_created++
        // צור גם רישום אם הסוג מזוהה
        const regType = detectType(docName)
        if (regType) {
          await supabase.from('registrations').insert({
            parent_id: parentId,
            type:      regType,
            status:    'מאושר',
            notes:     `יובא מחשבונית ירוקה: ${docName}`,
          }).maybeSingle()
        }
      }

    } catch (docErr) {
      stats.errors.push(`שגיאה במסמך GI: ${String(docErr)}`)
    }
  }

  return NextResponse.json({
    success: true,
    total_documents: docs.length,
    stats,
  })
}
