# Kids & Fun — מערכת ניהול לקוחות

בוט WhatsApp + דשבורד CRM לניהול צהרונים וקייטנות.

---

## הרצה מהירה לפיתוח

```bash
cd kids-fun-app
npm install
npm run dev
```

הדשבורד יפתח בכתובת: http://localhost:3001/dashboard

**ללא Supabase** — הדשבורד יעלה עם 0 נתונים. הסימולטור יעבוד מיד.

---

## הגדרת Supabase (חובה לנתונים אמיתיים)

### שלב 1: יצירת פרויקט
1. כנסי ל-[supabase.com](https://supabase.com) וצרי פרויקט חדש
2. שמרי את כתובת ה-URL ואת ה-API keys

### שלב 2: יצירת טבלאות
1. פתחי **SQL Editor** ב-Supabase
2. העתיקי את `supabase/schema.sql` והרצי
3. לאחר מכן, `supabase/seed.sql` לנתוני demo (5 הורים לדוגמה)

### שלב 3: הגדרת .env.local
ערכי את `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## חיבור uchat / ManyChat לבוט

### Webhook URL (אחרי פריסה ל-Vercel)
```
POST https://your-domain.vercel.app/api/webhooks/whatsapp
```

### הגדרת uchat
1. צרי HTTP Request action בתהליך
2. שלחי POST עם Body:
```json
{
  "phone": "{{contact.phone}}",
  "text": "{{message.text}}"
}
```
3. הוסיפי Header: `x-webhook-secret: YOUR_SECRET`
4. עדכני `WHATSAPP_WEBHOOK_SECRET` ב-.env.local

### תגובת הבוט
```json
{
  "reply": "הטקסט לשלוח להורה",
  "escalate": false
}
```
- `escalate: true` = יש להעביר לנציג אנושי

---

## חיבור PayPlus

```env
PAYPLUS_API_KEY=YOUR_API_KEY
PAYPLUS_SECRET_KEY=YOUR_SECRET
```

---

## מסלולי הבוט (7 מסלולים)

| מסלול | מה הבוט עושה |
|-------|-------------|
| רישום לצהרון | איסוף פרטים + קישור לטופס |
| רישום לקייטנה (לפני מועד) | קישור לאתר |
| רישום לקייטנה (אחרי מועד) | הפניה לצוות + יצירת משימה |
| ביטול | בדיקת תקנון (עד/אחרי ה-15) |
| שאלות לו"ז וחגים | מידע אוטומטי |
| איסוף מוקדם | תיאום עם צוות |
| כשל תשלום — הורה פונה | תיאום שיחה |
| כשל תשלום — פנייה יזומה | הודעה חמה + מעקב |

---

## פריסה ל-Vercel

```bash
npm i -g vercel && vercel
```

הוסיפי משתני סביבה ב: Vercel Dashboard > Settings > Environment Variables

---

## מבנה הפרויקט

```
src/
  app/
    dashboard/page.tsx       # הדשבורד הראשי + סימולטור
    api/
      webhooks/whatsapp/     # webhook מ-uchat/ManyChat
      bot/simulate/          # סימולטור לבדיקות
      parents/               # API הורים
      tasks/                 # API משימות
  components/dashboard/      # רכיבי UI
  lib/
    bot/
      handler.ts             # מנהל הבוט הראשי
      flows.ts               # לוגיקת 7 המסלולים
      intent-classifier.ts   # זיהוי כוונות
    supabase/                # חיבור Supabase
    types.ts                 # TypeScript types
supabase/
  schema.sql                 # יצירת טבלאות
  seed.sql                   # נתוני demo
```
