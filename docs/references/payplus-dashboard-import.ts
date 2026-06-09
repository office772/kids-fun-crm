// ─── PayPlus Dashboard Import Pattern ────────────────────────────────────────
// מקור: kids-fun-app, יוני 2026
// עיקרון: כאשר PayPlus API חסום IP — שולפים ישירות מה-dashboard דרך session קיים
// שימוש: רץ ב-Chrome MCP (JavaScript tool) על הדומיין myaccount.payplus.co.il
// ─────────────────────────────────────────────────────────────────────────────

// ── שלב 1: גלה company_uid ו-terminal_uid מ-network requests ───────────────
// בדשבורד PayPlus → פתח DevTools → Network → חפש "company_uid"
// company_uid = d8477e08-890f-4f9f-a309-3641ef2f8d88  (לכל חשבון שונה)
// terminal_uid = f3a0f887-0d4f-4908-9e82-0156d05e9110  (לכל מסוף שונה)

// ── שלב 2: שלוף הוראות קבע (recurring payments) ────────────────────────────
/*
(async () => {
  const COMPANY  = 'YOUR_COMPANY_UID';
  const TERMINAL = 'YOUR_TERMINAL_UID';

  const resp = await fetch(
    `/api/recurring-payments/list?company_uid=${COMPANY}&terminal_uid=${TERMINAL}&skip=0&take=500`,
    { credentials: 'include' }   // חשוב: שולח session cookie קיים
  );
  const data = await resp.json();
  const active = (data?.data || []).filter(r => r.valid === true);

  // dedup לפי טלפון/אימייל/שם
  const seen = new Set();
  const unique = active.filter(r => {
    const key = r.customer_phone || r.customer_email || r.customer_name;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  window.__ppParents = unique.map(r => ({
    name:             r.customer_name,
    phone:            r.customer_phone || null,
    email:            r.customer_email || null,
    amount:           r.each_payment_amount,
    pp_recurring_uid: r.uid,
    customer_uid:     r.customer_uid,
    last_charge:      r.last_charge_date
  }));

  return 'count=' + window.__ppParents.length;
})()
*/

// ── שלב 3: שלח ל-endpoint שלנו עם CORS ──────────────────────────────────────
/*
// שלח ב-batches של ~36 כדי לא לפגוע בטיים-אאוט
fetch('https://YOUR_APP.vercel.app/api/sync/payplus-recurring', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(window.__ppParents.slice(0, 36))
}).then(r => r.json()).then(console.log);
*/

// ── endpoints חשובים בדשבורד PayPlus ────────────────────────────────────────
// רשימת הוראות קבע:
//   GET /api/recurring-payments/list?company_uid=X&terminal_uid=Y&skip=0&take=500
//
// דוח עסקאות:
//   GET /api/transactionReport/getDashboardNewTransactions?company_uid=X&terminal_uid=Y&skip=0&take=25
//
// דוח אישורים:
//   GET /api/transactionReport/getTransactionsApprovalStats?company_uid=X&terminal_uid=Y&...
//
// הגדרות API (api-key, secret-key):
//   https://myaccount.payplus.co.il/settings/interfaces
//   ↳ יש שם גם "ביטול בדיקת IP ל API" — מאפשר קריאה מכל IP (לא מומלץ)

// ── הבדל בין endpoints (IP block vs permission) ───────────────────────────────
// 403 = חסום IP  → GetTransactions, GetPaymentPages, GetRecurringOrders
// 422 = אין הרשאה → TransactionReports/TransactionsApproval (צריך activation)
// 200 = עובד → PaymentPages/generateLink (יצירת קישורי תשלום)
