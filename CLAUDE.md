# Kids & Fun — CRM + WhatsApp Bot

## מה זה
מערכת ניהול לקוחות (CRM) + בוט WhatsApp לצהרונים וקייטנות.
נבנה עבור הלקוחה Kids & Fun ע"י עינת גן אל.

## Stack
- **Frontend + Backend**: Next.js 14 (App Router)
- **DB**: Supabase (PostgreSQL) — פרויקט `neuknudswaqtnhfraibl`
- **WhatsApp**: ManyChat/uchat → webhook
- **LLM Fallback**: Claude Haiku (Anthropic API)
- **Hosting**: Vercel (בפיתוח — localhost)

## הרצה מקומית
```bash
npm run dev
# דשבורד: http://localhost:3000/dashboard
# סימולטור בוט: דשבורד → לשונית "סימולטור"
```

## ארכיטקטורת הבוט (FP + LLM)
```
הודעה נכנסת
  ↓
[FP] מסלול פעיל? → flows.ts
[FP] כוונה מזוהה (1-6)? → flows.ts
  ↓ לא תפס
[LLM] Claude Haiku → llm-fallback.ts
```

## קבצים חשובים
| קובץ | תפקיד |
|------|--------|
| `src/lib/bot/flows.ts` | כל מסלולי הבוט (7 מסלולים) |
| `src/lib/bot/handler.ts` | ניתוב FP → LLM |
| `src/lib/bot/intent-classifier.ts` | זיהוי כוונה מהודעה |
| `src/lib/bot/llm-fallback.ts` | Claude API fallback |
| `src/app/api/webhooks/manychat/route.ts` | webhook ראשי מ-ManyChat |
| `src/app/api/bot/simulate/route.ts` | סימולטור דשבורד |
| `src/app/dashboard/page.tsx` | דשבורד CRM מלא |
| `src/lib/types.ts` | כל הטיפוסים |
| `supabase/schema.sql` | מבנה הטבלאות |
| `DEPLOYMENT.md` | מדריך מסירה ללקוחה |
| `scripts/migrate.js` | העברת נתונים בין Supabase |

## קבצים חדשים — מסלול 1
| קובץ | תפקיד |
|------|--------|
| `src/lib/bot/registration-helpers.ts` | checkCapacity, saveWaitingListEntry, buildRegisterLink, AREAS |
| `src/app/register/page.tsx` | טופס רישום דינמי ציבורי (RTL, ללא auth) |
| `src/app/register/success/page.tsx` | דף הצלחה לאחר הגשה |
| `src/app/api/register/route.ts` | שמירת רישום ל-Supabase |
| `src/app/api/capacity/route.ts` | בדיקת קיבולת לפי area_code |

## מה הושלם ✅
- [x] Schema מלא ב-Supabase (9 טבלאות)
- [x] Seed עם נתוני demo
- [x] כל 7 מסלולי הבוט (flows.ts)
- [x] FP + LLM architecture (handler.ts)
- [x] Claude Haiku fallback (llm-fallback.ts)
- [x] Webhook מחובר לSupabase (manychat/route.ts)
- [x] דשבורד CRM (dashboard/page.tsx)
- [x] סימולטור בוט בדשבורד
- [x] תכנית מסירה + סקריפט migration

## מה עוד נשאר לעשות
- [x] מסלול 1 — רישום לצהרון (בדיקת קיבולת + טופס דינמי + רשימת המתנה)
- [ ] הגדרת קיבולת בדשבורד לאדמין (branches.max_capacity)
- [ ] מסלול 2 — ביטול לפי תקנון (לשפר)
- [ ] מסלול 3 — רישום לקייטנה
- [ ] מסלול 4-7 — שאר המסלולים
- [ ] פאנל ניהול טקסטים בוט (BotContentManager — קיים חלקית)
- [ ] שעות פעילות + חגים מ-Supabase (כרגע hardcoded)
- [ ] Auth לדשבורד (כרגע פתוח לכולם)
- [ ] PayPlus / חשבונית ירוקה — webhook לכשלי תשלום
- [ ] בדיקת תשלום אמיתית מ-Supabase (כרגע מציג אפשרויות בלבד)
- [ ] חיבור ManyChat אמיתי (webhook מוכן, ממתין לחיבור)

## .env.local — מה צריך
```
NEXT_PUBLIC_SUPABASE_URL=        ✅ מוגדר
NEXT_PUBLIC_SUPABASE_ANON_KEY=   ✅ מוגדר
SUPABASE_SERVICE_ROLE_KEY=       ✅ מוגדר
ANTHROPIC_API_KEY=               ✅ מוגדר
WHATSAPP_WEBHOOK_SECRET=         ⏳ להגדיר בפרודקשן
PAYPLUS_API_KEY=                 ⏳ ממתין לחיבור
```

## הגדרות עסקיות
- שעות פעילות: ראשון-חמישי 8:00-17:00
- ביטול לפני 15: זיכוי מלא
- ביטול אחרי 15: ממשיכים חודש נוסף
- תשלום: דרך חשבונית ירוקה (webhook) — לא לאסוף פרטי כרטיס בבוט!

## הערות חשובות
- הסליקה דרך **חשבונית ירוקה** (לא PayPlus ישירות) — חיבור דרך webhook
- הבוט **אסור** לאסוף פרטי כרטיס אשראי — רק לתאם שיחה עם נציגה
- כל הממשק **RTL עברית** — פונט גדול, ידידותי למשתמשת שחוששת מטכנולוגיה
