export const dynamic = 'force-dynamic'

// ─── רשת ביטחון: כשל תשלום דרך מייל PayPlus ──────────────────────────────────
// הגנה *שנייה* על מסלול 9. המקור הראשי נשאר ה-webhook של PayPlus
// (webhooks/payplus). כאן רק "רשת ביטחון": Google Apps Script שיושב בתוך
// ה-Gmail של office@kidsandfun.co.il שולח לכאן את מייל הכשל שהלקוח מקבל.
//
// עיקרון אי-הזק: לפני שיוצרים משימה/התראה — בודקים אם ה-webhook כבר תפס את
// הכשל (רשומת payment 'נכשל' להורה ב-36 השעות האחרונות). אם כן — שותקים.
// כך לעולם אין כפילות מול הזרימה הקיימת, והקוד הזה רק *מוסיף* תפיסה כשה-
// webhook פספס (למשל Callback לא הוגדר בדף סליקה מסוים).
//
// אבטחה: דורש header `x-email-secret` == EMAIL_WEBHOOK_SECRET (ב-Vercel env).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'

// PayPlus שולח HTML מקודד quoted-printable / entities. מנקים לטקסט קריא.
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

interface ParsedFailure {
  name:    string | null   // שם ההורה
  amount:  number | null   // סכום בש"ח
  reason:  string | null   // סיבת הכשל
  last4:   string | null   // 4 ספרות אחרונות
  rawText: string          // לטובת לוג/דיבוג
}

// חילוץ שדות ממייל הכשל. תומך בשני מצבים:
// 1) Apps Script כבר חילץ ל-JSON ({name, amount, reason, last4})
// 2) Apps Script שולח את גוף המייל הגולמי (html/text) ואנחנו מפרסרים פה.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFailure(body: Record<string, any>): ParsedFailure {
  // מצב 1 — כבר מפורסר
  if (body.name || body.amount || body.reason) {
    return {
      name:    body.name   ? String(body.name).trim()   : null,
      amount:  body.amount ? Number(body.amount)         : null,
      reason:  body.reason ? String(body.reason).trim()  : null,
      last4:   body.last4  ? String(body.last4).trim()   : null,
      rawText: JSON.stringify(body).slice(0, 500),
    }
  }

  // מצב 2 — גוף גולמי
  const raw  = String(body.html ?? body.text ?? body.body ?? '')
  const text = raw.includes('<') ? htmlToText(raw) : raw.replace(/\s+/g, ' ').trim()

  // שם: "היי <שם>," — הפנייה האישית בראש המייל
  const nameMatch   = text.match(/היי\s+([^,]+?)\s*,/)
  // סכום: "בסכום כולל של 946 ₪" / "946 ש"ח" / "₪946"
  const amountMatch = text.match(/(?:בסכום\D*?|₪\s*|של\s+)(\d[\d,]*)\s*(?:₪|ש"?ח|שח)?/)
  // סיבה: "נכשלה מהסיבה: <reason>" — עד נקודה/סוף משפט
  const reasonMatch = text.match(/מהסיבה:?\s*([^\.]+?)(?:\.|אמצעי|תאריך|פרטי|$)/)
  // 4 ספרות: "אמצעי תשלום: 4843" / "כרטיס ...4843"
  const last4Match  = text.match(/(?:אמצעי תשלום|כרטיס|בכרטיס)\D*?(\d{4})\b/)

  return {
    name:    nameMatch   ? nameMatch[1].trim()                       : null,
    amount:  amountMatch ? Number(amountMatch[1].replace(/,/g, ''))  : null,
    reason:  reasonMatch ? reasonMatch[1].trim()                     : null,
    last4:   last4Match  ? last4Match[1]                             : null,
    rawText: text.slice(0, 500),
  }
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

    // ── שער נושא: רק מיילי כשל ────────────────────────────────────────────────
    // ה-Apps Script שולח את *כל* מיילי PayPlus (כי הוא ASCII בלבד ולא יכול
    // לסנן עברית). הסינון האמיתי קורה כאן, איפה שעברית בטוחה ב-UTF-8.
    // קבלות ("החיוב התקבל"), אבטחה וקודי כניסה — נדחים מיד.
    const subject = String(body.subject ?? '')
    if (subject && !/נכשל/.test(subject)) {
      console.log(`[PayPlus Email] subject not a failure — ignoring: "${subject}"`)
      return NextResponse.json({ ok: true, ignored: true, reason: 'not-a-failure-subject' })
    }

    const failure = parseFailure(body)
    console.log('[PayPlus Email] parsed:', JSON.stringify(failure))

    // בלי שום פרט מזהה — לא עושים כלום (מייל לא רלוונטי / פורמט לא מוכר)
    if (!failure.name && !failure.amount && !failure.reason) {
      console.log('[PayPlus Email] no identifiable failure fields — ignoring')
      return NextResponse.json({ ok: true, ignored: true })
    }

    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()

    // ── חיפוש ההורה לפי שם (המייל לא מכיל טלפון) ─────────────────────────────
    let parentId: string | null = null
    if (failure.name) {
      const { data: byName } = await supabase
        .from('parents').select('id').eq('name', failure.name).maybeSingle()
      if (byName) parentId = byName.id
    }

    // ── עיקרון אי-הזק: האם ה-webhook כבר תפס את הכשל? ────────────────────────
    if (parentId) {
      const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()
      const { data: recentFail } = await supabase
        .from('payments')
        .select('id')
        .eq('parent_id', parentId)
        .eq('status', 'נכשל')
        .gte('created_at', since)
        .limit(1)
      if (recentFail && recentFail.length > 0) {
        console.log(`[PayPlus Email] failure already recorded for parent ${parentId} — safety net silent`)
        return NextResponse.json({ ok: true, alreadyKnown: true })
      }
    }

    // ── הגענו לכאן = ה-webhook *לא* תפס. רשת הביטחון נכנסת לפעולה. ────────────
    const reasonLabel = failure.reason || 'חיוב נכשל'
    const amountLabel = failure.amount ? `₪${failure.amount}` : 'סכום לא ידוע'
    const nameLabel   = failure.name || 'לקוח (לא זוהה)'
    const last4Label  = failure.last4 ? ` (כרטיס •${failure.last4})` : ''

    await supabase.from('tasks').insert({
      parent_id:   parentId,  // null אם לא זוהה — עדיין נפתחת משימה לבדיקה ידנית
      type:        'כשל תשלום',
      description:
        `📧 כשל תשלום זוהה ממייל PayPlus (רשת ביטחון — ה-webhook לא תפס): ` +
        `${nameLabel}${last4Label} — ${reasonLabel} — ${amountLabel}. ` +
        (parentId ? '' : 'ההורה לא זוהה אוטומטית במערכת — לבדוק ידנית.'),
      priority:    'דחוף',
      status:      'פתוח',
    })

    if (parentId) {
      await supabase.from('registration_timeline').insert({
        parent_id:   parentId,
        event_type:  'payment',
        new_value:   'נכשל',
        description: `🔴 כשל חיוב זוהה ממייל PayPlus — ${reasonLabel} (${amountLabel})`,
        performed_by: 'מערכת (מייל)',
        metadata:    { amount: failure.amount, last4: failure.last4, via: 'email' },
      })
    }

    const { notifyStaff } = await import('@/lib/notify')
    await notifyStaff({
      text: `כשל תשלום (ממייל PayPlus): ${nameLabel} — ${reasonLabel} (${amountLabel})`,
      priority: 'דחוף',
    })

    console.log(`[PayPlus Email] 🔴 safety-net failure recorded — parent ${parentId ?? 'unmatched'}, reason: ${reasonLabel}`)
    return NextResponse.json({ ok: true, recorded: true, parent_id: parentId })

  } catch (err) {
    console.error('[PayPlus Email] Error:', err)
    return NextResponse.json({ ok: true }) // תמיד 200 כדי ש-Apps Script לא ינסה שוב
  }
}
