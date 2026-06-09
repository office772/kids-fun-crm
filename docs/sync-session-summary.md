# סיכום: PayPlus + GreenInvoice → Supabase CRM Sync
## תאריך: יוני 2026

---

## מה נבנה

### 1. Webhooks (סינק בזמן אמת — מעכשיו והלאה)

| קובץ | תפקיד |
|------|--------|
| `src/app/api/webhooks/payplus/route.ts` | מקבל callback מ-PayPlus בכל תשלום חדש |
| `src/app/api/webhooks/greeninvoice/route.ts` | מקבל webhook מחשבונית ירוקה |

**עיקרון:** תשלום מגיע → חפש הורה (phone → email → name) → צור אם לא קיים → שמור תשלום

### 2. Historical Sync (ייבוא חד-פעמי)

| קובץ | תפקיד |
|------|--------|
| `src/app/api/sync/payplus-recurring/route.ts` | מקבל POST עם מערך הוראות קבע מ-PayPlus |
| `src/app/api/sync/greeninvoice/route.ts` | שולף מסמכים ישירות מ-GreenInvoice API |

### 3. Admin UI
`src/app/admin/page.tsx` — כפתורי סנכרון ידני

---

## תוצאות הייבוא (8.6.2026)

| מקור | הורים | תשלומים |
|------|-------|---------|
| PayPlus הוראות קבע | 69 | 71 |
| GreenInvoice | 76 | 200 |
| ידני | 8 | — |
| **סה"כ** | **153** | **277** |

---

## הבעיה שנפתרה: PayPlus API חסום IP

**מה שניסינו ונכשל:**
- `GET /api/v1.0/Transactions/GetTransactions` → 403 (IP whitelist)
- `POST /api/v1.0/TransactionReports/TransactionsApproval` → 422 (account permission)

**הפתרון:**
1. גילינו שה-Zapier integration של PayPlus עובד דרך **webhooks** (push), לא polling
2. שלפנו את הנתונים **ישירות מה-dashboard** דרך Chrome MCP + session קיים:
   - `GET /api/recurring-payments/list?company_uid=X&terminal_uid=Y&skip=0&take=500`
3. שלחנו ל-endpoint שלנו עם CORS

---

## תשתית Webhooks

### PayPlus
- `callback_url` מוגדר ב-`src/lib/bot/payment-helpers.ts` שורה 113
- כל קישור תשלום חדש שהבוט יוצר → callback אוטומטי

### GreenInvoice  
- URL להגדרה: `https://kids-fun-app-psi.vercel.app/api/webhooks/greeninvoice`
- מיקום: הגדרות חשבונית ירוקה → מפתחים (עדיין לא הוגדר)

---

## מה נותר (לסשן הבא)

- [ ] **תקן כפתור "סנכרן PayPlus"** — עדיין קורא ל-GetTransactions שחסום. לשנות ל-endpoint שעובד
- [ ] **הוסף שדה `sync_source`** בכרטיסיית ההורה ב-UI (מאיפה הנתון הגיע)
- [ ] **הגדר GreenInvoice webhook URL** בדשבורד חשבונית ירוקה
- [ ] **משוך נתונים נוספים**: בית ספר, שם ילד, מה נרשם אליו
- [ ] **GreenInvoice sync** — לוודא שמציג תוצאות נכון ב-admin UI

---

## קבצי reference לשימוש עתידי

- `docs/references/no-make-integration-pattern.md` — כיצד לחבר ספקים ללא Make/Zapier
- `docs/references/payplus-dashboard-import.ts` — קוד ל-Chrome MCP לשליפת נתוני PayPlus
- `docs/references/summit-webhook-pattern.ts` — דפוס ה-webhook מ-Pantarei/Summit
