export const dynamic = 'force-dynamic'

// ─── רשת ביטחון: דו"ח כשלי הוראות קבע ממייל PayPlus ──────────────────────────
// הגנה *שנייה* על מסלול 9. המקור הראשי נשאר ה-webhook של PayPlus
// (webhooks/payplus). כאן רשת ביטחון: Google Apps Script ב-Gmail של
// office@kidsandfun.co.il שולח לכאן את דו"ח הכשלים היומי של PayPlus.
//
// פורמט הדו"ח (אומת מול מייל אמיתי 16/06/2026): טבלת HTML, שורה לכל כשל:
//   שם לקוח | תאריך לחיוב | חויב בתאריך | סוג | פירוט התשלום | סכום | סיבת דחייה
// הדו"ח יומי ועשוי לחזור על אותו כשל עד שיטופל — לכן ה-dedup חוסם כפילות.
//
// עיקרון אי-הזק: יוצרים משימה רק אם אין כבר (א) רשומת payment 'נכשל' להורה
// ב-36ש', או (ב) משימת 'כשל תשלום' פתוחה להורה. כך אין כפילות מול ה-webhook
// ולא מול דו"ח של אתמול.
//
// אבטחה: דורש header `x-email-secret` == EMAIL_WEBHOOK_SECRET (ב-Vercel env).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'

// HTML → טקסט קריא (ה-Apps Script שולח HTML מפוענח מ-getBody)
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

function parseAmount(s: string): number | null {
  const m = String(s).match(/\d[\d,]*/)
  return m ? Number(m[0].replace(/,/g, '')) : null
}

interface Failure {
  name:    string | null
  amount:  number | null
  reason:  string | null
  detail:  string | null   // "פירוט התשלום" — בד"כ סכום מקורי + תוקף כרטיס
  date:    string | null   // "תאריך לחיוב"
}

// מצב ראשי: טבלת הדו"ח. מחזיר שורה לכל כשל (יכול להיות יותר מאחד).
function parseFailuresFromTable(html: string): Failure[] {
  const out: Failure[] = []
  const trs = html.match(/<tr[\s\S]*?<\/tr>/gi) || []
  for (const tr of trs) {
    const tds = (tr.match(/<td[\s\S]*?<\/td>/gi) || []).map(htmlToText)
    if (tds.length < 7) continue                 // שורות layout — לא טבלת הדו"ח
    if (tds[0].includes('שם לקוח')) continue      // שורת כותרת
    const name   = tds[0] || null
    const amount = parseAmount(tds[5])
    const reason = tds[6] || null
    if (!name && !amount && !reason) continue
    out.push({ name, date: tds[1] || null, detail: tds[4] || null, amount, reason })
  }
  return out
}

// מצב גיבוי: מייל כשל בודד בנוסח שההורה מקבל ("היי <שם>, ... מהסיבה: ...")
function parseSingleFailure(text: string): Failure | null {
  const nameMatch   = text.match(/היי\s+([^,]+?)\s*,/)
  const amountMatch = text.match(/(?:בסכום\D*?|₪\s*|של\s+)(\d[\d,]*)\s*(?:₪|ש"?ח|שח)?/)
  const reasonMatch = text.match(/מהסיבה:?\s*([^.]+?)(?:\.|אמצעי|תאריך|פרטי|$)/)
  const name   = nameMatch && nameMatch[1].trim() ? nameMatch[1].trim() : null
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : null
  const reason = reasonMatch ? reasonMatch[1].trim() : null
  if (!name && !amount && !reason) return null
  return { name, amount, reason, detail: null, date: null }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFailures(body: Record<string, any>): Failure[] {
  // JSON כבר-מפורסר (אם Apps Script יחלץ בעצמו בעתיד)
  if (Array.isArray(body.failures)) {
    return body.failures.map((f: Record<string, unknown>) => ({
      name:   f.name   ? String(f.name).trim()   : null,
      amount: f.amount ? Number(f.amount)        : null,
      reason: f.reason ? String(f.reason).trim() : null,
      detail: f.detail ? String(f.detail)        : null,
      date:   f.date   ? String(f.date)          : null,
    }))
  }
  const raw  = String(body.html ?? body.text ?? body.body ?? '')
  if (raw.includes('<')) {
    const rows = parseFailuresFromTable(raw)
    if (rows.length) return rows
    // אין טבלה — ננסה נוסח בודד על הטקסט המפושט
    const single = parseSingleFailure(htmlToText(raw))
    return single ? [single] : []
  }
  const single = parseSingleFailure(raw.replace(/\s+/g, ' ').trim())
  return single ? [single] : []
}

export async function POST(req: NextRequest) {
  try {
    // ── אבטחה ───────────────────────────────────────────────────────────────
    const expected = process.env.EMAIL_WEBHOOK_SECRET
    const provided = req.headers.get('x-email-secret')
    if (expected && provided !== expected) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    // ── קריאת גוף ─────────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: Record<string, any> = {}
    const raw = await req.text()
    try {
      body = raw.trim().startsWith('{') ? JSON.parse(raw) : { body: raw }
    } catch {
      body = { body: raw }
    }

    // ── שער נושא: רק דו"חות/מיילי כשל ─────────────────────────────────────────
    // ה-Apps Script שולח את *כל* מיילי PayPlus (ASCII בלבד, לא מסנן עברית).
    // הסינון כאן, איפה שעברית בטוחה ב-UTF-8. קבלות/אבטחה/קודי-כניסה נדחים.
    const subject = String(body.subject ?? '')
    if (subject && !/נכשל/.test(subject)) {
      console.log(`[PayPlus Email] subject not a failure — ignoring: "${subject}"`)
      return NextResponse.json({ ok: true, ignored: true, reason: 'not-a-failure-subject' })
    }

    const failures = extractFailures(body)
    console.log(`[PayPlus Email] parsed ${failures.length} failure row(s):`, JSON.stringify(failures))

    if (failures.length === 0) {
      console.log('[PayPlus Email] no identifiable failures — ignoring')
      return NextResponse.json({ ok: true, ignored: true })
    }

    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const { notifyStaff } = await import('@/lib/notify')

    let recorded = 0, skipped = 0, unmatched = 0

    for (const f of failures) {
      const reasonLabel = f.reason || 'חיוב נכשל'
      const amountLabel = f.amount ? `₪${f.amount}` : 'סכום לא ידוע'
      const nameLabel   = f.name || 'לקוח (לא זוהה)'
      const detailLabel = f.detail ? ` [${f.detail}]` : ''

      // ── חיפוש ההורה לפי שם (הדו"ח לא מכיל טלפון) ───────────────────────────
      let parentId: string | null = null
      if (f.name) {
        const { data: byName } = await supabase
          .from('parents').select('id').eq('name', f.name).maybeSingle()
        if (byName) parentId = byName.id
      }

      // ── dedup: כבר ידוע? (webhook ב-36ש' / משימת כשל פתוחה) ─────────────────
      if (parentId) {
        const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()
        const [{ data: recentFail }, { data: openTask }] = await Promise.all([
          supabase.from('payments').select('id')
            .eq('parent_id', parentId).eq('status', 'נכשל').gte('created_at', since).limit(1),
          supabase.from('tasks').select('id')
            .eq('parent_id', parentId).eq('type', 'כשל תשלום').eq('status', 'פתוח').limit(1),
        ])
        if ((recentFail && recentFail.length) || (openTask && openTask.length)) {
          console.log(`[PayPlus Email] already known for parent ${parentId} — silent`)
          skipped++
          continue
        }
      } else {
        // הורה לא זוהה — מנע כפילות יומית: משימה פתוחה שכוללת את השם
        if (f.name) {
          const { data: dupTask } = await supabase.from('tasks').select('id')
            .eq('type', 'כשל תשלום').eq('status', 'פתוח')
            .ilike('description', `%${f.name}%`).limit(1)
          if (dupTask && dupTask.length) { skipped++; continue }
        }
        unmatched++
      }

      // ── יצירת משימה (רשת ביטחון — ה-webhook לא תפס) ─────────────────────────
      await supabase.from('tasks').insert({
        parent_id:   parentId,
        type:        'כשל תשלום',
        description:
          `📧 כשל תשלום מדו"ח PayPlus (רשת ביטחון): ${nameLabel}${detailLabel} — ` +
          `${reasonLabel} — ${amountLabel}. ` +
          (parentId ? '' : 'ההורה לא זוהה אוטומטית — לבדוק ידנית.'),
        priority:    'דחוף',
        status:      'פתוח',
      })

      if (parentId) {
        await supabase.from('registration_timeline').insert({
          parent_id:   parentId,
          event_type:  'payment',
          new_value:   'נכשל',
          description: `🔴 כשל חיוב מדו"ח PayPlus — ${reasonLabel} (${amountLabel})`,
          performed_by: 'מערכת (מייל)',
          metadata:    { amount: f.amount, detail: f.detail, via: 'email' },
        })
      }

      await notifyStaff({
        text: `כשל תשלום (דו"ח PayPlus): ${nameLabel} — ${reasonLabel} (${amountLabel})`,
        priority: 'דחוף',
      })
      recorded++
      console.log(`[PayPlus Email] 🔴 recorded — parent ${parentId ?? 'unmatched'}, ${nameLabel}, ${reasonLabel}`)
    }

    return NextResponse.json({ ok: true, total: failures.length, recorded, skipped, unmatched })

  } catch (err) {
    console.error('[PayPlus Email] Error:', err)
    return NextResponse.json({ ok: true }) // תמיד 200 כדי ש-Apps Script לא ינסה שוב
  }
}
