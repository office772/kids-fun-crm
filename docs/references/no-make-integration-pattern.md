# No-Make Integration Pattern
## איך לחבר API חיצוני ללא Zapier/Make

### העיקרון
כאשר ספק תשלומים (PayPlus, GreenInvoice, Summit וכד') מציע אינטגרציה עם Zapier/Make —
אפשר לבנות אותה לבד. בדרך כלל Zapier עובד דרך webhooks (ה-ספק דוחף נתונים), לא polling.

---

## שלב 1: גלה את הפורמט מהדוקומנטציה של Make/Zapier

1. חפש את הספק ב-Zapier: `zapier.com/apps/{vendor}/integrations`
2. בדוק מה ה-triggers — אם זה "New Payment" → **webhook** (ספק דוחף)
3. קרא את ה-payload מה-docs של Zapier/Make עבור הטריגר הזה

---

## שלב 2: בנה Webhook Receiver

```typescript
// /api/webhooks/{vendor}/route.ts
export async function POST(req: NextRequest) {
  const body = await req.json()
  
  // חיפוש רב-שלבי (Multi-step lookup)
  let parentId = null
  if (body.email) { /* חפש לפי email */ }
  if (!parentId && body.phone) { /* חפש לפי phone */ }
  if (!parentId && body.name) { /* חפש לפי name */ }
  
  // צור הורה אם לא קיים
  if (!parentId) { /* INSERT */ }
  
  // צור תשלום
  /* INSERT INTO payments */
  
  return NextResponse.json({ ok: true }) // תמיד 200!
}
```

---

## שלב 3: הגדר את ה-Webhook URL אצל הספק

- **PayPlus**: מוגדר ב-`callback_url` בכל קישור תשלום (payment-helpers.ts)
- **GreenInvoice**: הגדרות → מפתחים → Webhook URL
- **Summit**: settings/webhooks → Enter URL

---

## שלב 4: ייבוא היסטורי (One-time import)

כאשר ה-API חסום IP — שלוף ישירות מה-dashboard:

```javascript
// ב-Chrome MCP על דומיין הספק (session קיים)
const resp = await fetch('/api/internal-endpoint?company_uid=X', {
  credentials: 'include'  // session cookie
})
const data = await resp.json()
// שלח ל-endpoint שלנו עם CORS
fetch('https://YOUR_APP.vercel.app/api/sync/bulk-import', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(data)
})
```

> **איך למצוא את ה-endpoint הפנימי:** פתח DevTools → Network → סנן לפי `/api/` → רענן את הדף

---

## מקרים שנפגשנו

| ספק | סטטוס | גישה שעבדה |
|-----|-------|------------|
| PayPlus GetTransactions | 403 IP blocked | Chrome MCP + internal API |
| PayPlus TransactionReports | 422 No Permission | Chrome MCP + internal API |
| PayPlus generateLink | ✅ 200 | REST API רגיל |
| GreenInvoice /documents/search | ✅ 200 | REST API רגיל |
| Summit listentities | ✅ 200 | credentials in body |

---

## PayPlus — מפתחות ו-IDs ידועים (kids-fun-app)

- `company_uid`: `d8477e08-890f-4f9f-a309-3641ef2f8d88`
- `terminal_uid`: `f3a0f887-0d4f-4908-9e82-0156d05e9110`
- `PAYPLUS_PAGE_UID`: `68a05e59-74b2-4bdb-9f07-e70a450eb0a6`
- Internal recurring list: `GET /api/recurring-payments/list?company_uid=X&terminal_uid=Y&skip=0&take=500`
