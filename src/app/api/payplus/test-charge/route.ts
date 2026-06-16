// ─── בדיקת חיוב — קישור 1₪ נקי ללחיצה ──────────────────────────────────────
// ברירת מחדל: סנדבוקס (טסט) עם המפתחות הקיימים ב-.env.local.
// העמוד מציג את פרטי כרטיס הבדיקה הנכונים גדול וברור — כדי לא להקליד הפוך שוב.
//
// שימוש (פותחים בדפדפן):
//   http://localhost:3002/api/payplus/test-charge             → 1₪ סנדבוקס (טסט)
//   http://localhost:3002/api/payplus/test-charge?recurring=1 → הוראת קבע סנדבוקס
//   http://localhost:3002/api/payplus/test-charge?prod=1      → חיוב אמיתי על מסוף אמיתי (כסף אמיתי!)
//   &amount=2                                                 → סכום אחר (סנדבוקס מוגבל ל-5₪)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'

const PAYPLUS_PROD_BASE    = 'https://restapi.payplus.co.il/api/v1.0'
const PAYPLUS_SANDBOX_BASE = 'https://restapidev.payplus.co.il/api/v1.0'

// כרטיס בדיקה רשמי של PayPlus sandbox (מתוך ה-memory — הסדר הנכון!)
const TEST_CARD = { number: '5326 1402 8077 9844', exp: '09/26', cvv: '000', id: '000000018' }

function htmlPage(title: string, bodyHtml: string): NextResponse {
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; background:#f6f7fb;
         margin:0; padding:40px 20px; color:#1a1a2e; direction:rtl; }
  .card { max-width:560px; margin:0 auto; background:#fff; border-radius:16px;
          padding:32px; box-shadow:0 4px 24px rgba(0,0,0,.08); }
  h1 { font-size:22px; margin:0 0 8px; }
  p { line-height:1.6; }
  .btn { display:inline-block; background:#2563eb; color:#fff; text-decoration:none;
         padding:14px 28px; border-radius:10px; font-size:18px; font-weight:700; margin:16px 0; }
  .ok { color:#16a34a; } .err { color:#dc2626; }
  pre { background:#0f172a; color:#e2e8f0; padding:16px; border-radius:10px;
        overflow:auto; font-size:12px; direction:ltr; text-align:left; }
  .note { background:#fef9c3; border:1px solid #fde047; padding:12px 16px; border-radius:10px; font-size:14px; }
  .testcard { background:#ecfdf5; border:1px solid #6ee7b7; padding:16px 20px; border-radius:12px; margin:16px 0; }
  .testcard table { width:100%; border-collapse:collapse; }
  .testcard td { padding:6px 4px; font-size:16px; }
  .testcard td:first-child { color:#047857; font-weight:600; width:90px; }
  .testcard .num { font-size:22px; font-weight:800; letter-spacing:2px; direction:ltr; }
</style></head>
<body><div class="card">${bodyHtml}</div></body></html>`
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

function testCardHtml(): string {
  return `<div class="testcard">
    <div style="font-weight:700;margin-bottom:8px;color:#047857">💳 כרטיס בדיקה (להזין בדיוק כך — בלי להפוך!)</div>
    <table>
      <tr><td>מספר</td><td class="num">${TEST_CARD.number}</td></tr>
      <tr><td>תוקף</td><td>${TEST_CARD.exp}</td></tr>
      <tr><td>CVV</td><td>${TEST_CARD.cvv}</td></tr>
      <tr><td>ת״ז</td><td>${TEST_CARD.id}</td></tr>
    </table>
  </div>`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const isProd      = searchParams.get('prod') === '1'
  const isRecurring = searchParams.get('recurring') === '1'

  // ─── בחירת סביבה ─────────────────────────────────────────────────────────
  const base = isProd ? PAYPLUS_PROD_BASE : PAYPLUS_SANDBOX_BASE
  const apiKey    = isProd ? process.env.PAYPLUS_PROD_API_KEY    : process.env.PAYPLUS_API_KEY
  const secretKey = isProd ? process.env.PAYPLUS_PROD_SECRET_KEY : process.env.PAYPLUS_SECRET_KEY
  const pageUid   = isProd
    ? (isRecurring ? (process.env.PAYPLUS_PROD_RECURRING_PAGE_UID || process.env.PAYPLUS_PROD_PAGE_UID) : process.env.PAYPLUS_PROD_PAGE_UID)
    : process.env.PAYPLUS_PAGE_UID

  // סכום — ברירת מחדל 1₪. בסנדבוקס מוגבל ל-5₪ (דרישת PayPlus).
  const rawAmount = Number(searchParams.get('amount') ?? '1')
  let amount = Math.min(Math.max(Number.isFinite(rawAmount) ? rawAmount : 1, 1), 10)
  if (!isProd) amount = Math.min(amount, 5)

  if (!apiKey || !secretKey || apiKey.startsWith('PASTE') || secretKey.startsWith('PASTE')) {
    const which = isProd ? 'PAYPLUS_PROD_API_KEY / PAYPLUS_PROD_SECRET_KEY' : 'PAYPLUS_API_KEY / PAYPLUS_SECRET_KEY'
    return htmlPage('חסר מפתח', `<h1 class="err">⚠️ חסרים מפתחות</h1>
      <p>צריך להגדיר ב-<code>.env.local</code> את: <code>${which}</code></p>`)
  }
  if (!pageUid) return htmlPage('חסר page_uid', `<h1 class="err">חסר page_uid לסביבה זו</h1>`)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002'
  const envLabel = isProd ? 'מסוף אמיתי (פרודקשן)' : 'סנדבוקס (טסט)'

  const body: Record<string, unknown> = {
    payment_page_uid:  pageUid,
    amount,
    currency_code:     'ILS',
    charge_method:     isRecurring ? 3 : 1,
    sendEmailApproval: true,
    sendEmailFailure:  true,
    refURL_success: `${appUrl}/payment-success?test=1`,
    refURL_failure: `${appUrl}/payment-fail?test=1`,
    refURL_cancel:  `${appUrl}/payment-fail?test=1&cancelled=1`,
    customer: { customer_name: 'בדיקת מסוף', phone: '972500000000', email: 'test@kidsandfun.co.il' },
    items: [{ name: `בדיקה ${amount}₪`, quantity: 1, price: amount, vat_type: 1 }],
    order: { external_uid: 'terminal-test', description: 'בדיקת תקינות סליקה' },
    paying_vat: true,
    lang: 'he',
  }

  if (isRecurring) {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    body.recurring_settings = { recurring_type: 2, recurring_range: 1, number_of_charges: 1, start_date: tomorrow.getDate() }
  }

  try {
    const res = await fetch(`${base}/PaymentPages/generateLink`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey, 'secret-key': secretKey },
      body: JSON.stringify(body),
    })

    const text = await res.text()
    let data: any = null
    try { data = JSON.parse(text) } catch { /* leave as text */ }

    const link = data?.data?.payment_page_link
    const code = data?.results?.code
    const safeRaw = JSON.stringify(data ?? text, null, 2)

    if (code === 0 && link) {
      return htmlPage('הקישור נוצר', `
        <h1 class="ok">✅ הקישור נוצר — ${envLabel}</h1>
        <p>סוג: <b>${isRecurring ? 'הוראת קבע' : 'חיוב חד-פעמי'}</b> · סכום: <b>${amount}₪</b></p>
        ${!isProd ? testCardHtml() : ''}
        <a class="btn" href="${link}" target="_blank">💳 לדף התשלום ${amount}₪ →</a>
        ${isProd ? '<div class="note">⚠️ זה חיוב אמיתי. אפשר לזכות אחר כך בדשבורד PayPlus → עסקאות.</div>' : ''}
        <details style="margin-top:16px"><summary>תגובת PayPlus הגולמית</summary>
        <pre>${escapeHtml(safeRaw)}</pre></details>`)
    }

    return htmlPage('שגיאה', `
      <h1 class="err">❌ PayPlus החזיר שגיאה — ${envLabel}</h1>
      <p>HTTP ${res.status} · code ${code ?? '—'}</p>
      <p>${escapeHtml(data?.results?.description ?? '')}</p>
      ${!isProd ? testCardHtml() : ''}
      <pre>${escapeHtml(safeRaw)}</pre>`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאת רשת'
    return htmlPage('שגיאת רשת', `<h1 class="err">❌ ${escapeHtml(msg)}</h1>`)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))
}
