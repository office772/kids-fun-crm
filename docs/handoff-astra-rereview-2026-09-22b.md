# הנדאוף לסקירה חוזרת (סבב 3) — R1/R3/R5/R6 נסגרו כמו שצריך

**תאריך:** 22.9.2026 (ערב) · **ברנץ':** `claude/kids-fun-astra-review-0ef589` · **commit:** `c6ad696`
משלים את `kids-fun-r1-r6-rereview-2026-09-22.md` (שמצא 4 פערים אחרי סבב R1-R6 הראשון).

## מטרה
בסקירה החוזרת astra מצא ש-R2/R4 נסגרו, אבל R1/R3/R5/R6 היו חלקיים. הפעם תיקנתי אותם **מהשורש**,
כולל המיגרציה שנמנעתי ממנה. בקשה: לאמת שכל פער נסגר תחת חפיפה אמיתית, ולאתגר את הנקודות למטה.

## איך מריצים
```bash
npx tsc --noEmit                                   # נקי
ANTHROPIC_API_KEY=dummy npx tsx scripts/replay-bot.ts   # 128/128 (+R6 לפני/אחרי)
node scripts/infra-tests.cjs                        # 25/25 (mock מצבי חדש: rev + claim)
```

## מה תוקן (מהשורש)

### R6 — שלילה לפני *ואחרי* האמצעי, בגבול פסוקית
- **הפער:** `negatedBefore` בדק רק לפני מילת המפתח → "הוראת קבע לא מתאימה לי" נבחר כהו"ק.
- **התיקון:** `negatedNear(start, end)` בודק פסוקית לפני *ו*פסוקית אחרי (עד פסיק/"אבל"/"אלא"). כך
  שלילה אחרי האמצעי נתפסת, ו-"הוראת קבע, לא אשראי" *לא* שולל את הו"ק (השלילה בפסוקית של אשראי).
  `flows.ts` (`payment_setup_method`). בדיקות replay: "הוראת קבע לא מתאימה לי" → לא הו"ק; "הוראת קבע, לא אשראי" → הו"ק.

### R1 — בידוד גבול ה-I/O החיצוני (לא רק DB)
- **הפער:** ה-sandbox חסם רק כתיבות DB; `renewRecurringCard` (fetch ל-PayPlus) עדיין רץ מהסימולטור.
- **התיקון:** שער `isSimulated()` בגבול מתאם ה-PayPlus — `renewRecurringCard`, `cancelRecurringPayment`,
  `updateRecurringBillingDate` (`payplus-api.ts`) + `createPayPlusPaymentLink`, `getInvoiceLink`
  (`payment-helpers.ts`) — מחזירים תוצאה מדומה *לפני* ה-fetch. זה גבול-אדפטר תחום, לא per-caller.
- **בדיקה:** `infra-tests.cjs` R1b — סימולטור בענף `payment_fail_confirm_child` + `card`, מפתחות PayPlus
  מוגדרים → **0 קריאות fetch ל-PayPlus**. **הודגם fail-before** (הסרת השער → fetch ל-PayPlus).

### R3 — מנגנון גרסה אטומי בכל הנתיבים (מיגרציה)
- **הפער:** הנתיב המהיר לא העביר rev ולא בדק כלום; השער לא היה אטומי; clearSession/יצירה לא מוגנים.
- **התיקון:** עמודת `bot_sessions.rev` (uuid). `loadSession` עושה **bump אטומי** (`UPDATE...RETURNING`
  בפעולה אחת = row lock) ומחזיר rev חדש. כל כתיבה מותנית ב-rev: `persistSession` (UPDATE...WHERE rev=,
  או INSERT מותנה ל-session חדש), `clearSessionIfCurrent` (DELETE...WHERE rev=). מוחל ב**כל** הנתיבים
  (מהיר/דחוי/סינכרוני). שתי הודעות מקבילות → revים שונים → רק המאוחרת (שטענה אחרונה) כותבת; הישנה
  מיושנת, ולא מוחקת/דורסת/מסיימת/שולחת. `route.ts` + `supabase/migrations/add_bot_sessions_rev.sql`.
- **בדיקות:** R3 — תשובה ישנה שמסיימת לא מוחקת מסלול חדש ולא נשלחת; 2.4 — דומה בנתיב הדחוי. **הודגם fail-before.**

### R5 — הפרדת תפיסה מהיסטוריה + עצירת תופעות לוואי בכשל
- **הפער:** applyResult יצר task גם כש-saved=false → task כפול ב-retry; ה-releaseClaim מחק היסטוריה.
- **התיקון:** (א) `applyResult` עוצר לפני *כל* תופעת לוואי אם `stale || !saved` — הניסיון שנכשל לא יוצר
  כלום, רק זה שהשלים. (ב) **תפיסת עיבוד ב-whatsapp_message_log** (id_message + processed + created_at)
  *נפרדת* מיומן conversations; `releaseClaim` מוחק את התפיסה בלבד (לא היסטוריה); כשל→שחרור→retry נתפס
  מחדש. (ג) timeout 2 דק' לתפיסה שקרסה. (ד) כשל תפיסה שאינו 23505 → 'unclaimed', לא מעובד בלי הגנה.
- **בדיקות:** R5 — ניסיון ראשון נכשל (saveError) → retry עובד → **פנייה אחת בלבד** (tasks.length===1); 2.5 — dedup מקבילי.

## נקודות לאתגור
1. **R3 rev + bump-at-load:** `loadSession` הפך ל-UPDATE (כתיבה בכל הודעה). המרוץ נבדק ב-mock עם execute
   סינכרוני; האם השחזור שלך תחת חפיפה אמיתית (Promise.all) מאשר שהמאוחרת מנצחת בכל הנתיבים?
2. **R5 idempotency שיורי:** פעולה חיצונית *בתוך* processMessage שהצליחה ואז השמירה נכשלה — ב-retry
   תרוץ שוב. הקריטיות (ביטול רישום, ביטול/חידוש הו"ק) אידמפוטנטיות דרך בדיקת-סטטוס; renew כרטיס עלול
   לשלוח לינק/מייל שני (נדיר). האם זה מקובל, או שצריך מפתח-פעולה פר-message ברמת ה-flow?
3. **R1:** חסמתי את מתאם ה-PayPlus (5 פונקציות) + ה-DB. uChat/email אינם נקראים ממסלולי הסימולטור
   (הוא קורא processMessage, לא את ה-webhook). האם יש עוד גבול חיצוני שהסימולטור מגיע אליו?

## מיגרציה (חובה לפני פריסה)
`supabase/migrations/add_bot_sessions_rev.sql` — `alter table bot_sessions add column if not exists rev uuid;`
additive ובטוח. הקוד קורא/כותב את העמודה. להחיל דרך Supabase MCP `apply_migration` לפני פריסה.

## מצב
`tsc` נקי · replay 128/128 · infra 25/25 · בלי פריסה. חסום בהחלטות (מחוץ להיקף): 1.3 מדיניות ביטול
כספי · #7 §10-11 · גבעתיים · §3/§4 · פרסונה.
