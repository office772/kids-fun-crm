# הנדאוף לסקירה חוזרת (סבב 4) — R3/R5 חמשת הפערים נסגרו

**תאריך:** 22.9.2026 (לילה) · **ברנץ':** `claude/kids-fun-astra-review-0ef589` · **commit:** `77e40e6`
משלים את `kids-fun-round3-review-2026-09-22.md`. **הסימולטור מחוץ להיקף** (הושבת — הבדיקות תמיד בוואטסאפ).

## איך מריצים
```bash
npx tsc --noEmit                                   # נקי
ANTHROPIC_API_KEY=dummy npx tsx scripts/replay-bot.ts   # 128/128
node scripts/infra-tests.cjs                        # 29/29
```

## חמשת הפערים — כולם על מסלול הוואטסאפ, כולם נסגרו

### A (P1) — תשובה מיושנת כבר לא מוחזרת להורה
בנתיב המהיר ובסינכרוני, `stale` עוצר גם את החזרת ה-reply (כמו בדחוי): מחזירים `{skip, stale}` ריק
ומסמנים כמטופלת. ההורה לא רואה שאלה שסותרת את המצב שהשרת יקבל בהודעה הבאה.
בדיקה infra A: שתי הודעות מקבילות → רק המנצחת מקבלת reply, המיושנת skip ריק.

### B (P1) — בעלות/גרסה כבר בטעינה, גם ללא session קיים
`loadSession` הפך ל-**upsert אטומי** (`INSERT ... ON CONFLICT (phone) DO UPDATE SET rev` + RETURNING):
יוצר שורה אם אין, או מעדכן rev אם יש, ומחזיר rev-בעלות. כך שתי הודעות ראשונות מקבילות מקבלות revים
שונים, והמאוחרת מנצחת (לא נדרסת). `persistSession` תמיד UPDATE מותנה-rev (אין יותר insert/null).
בדיקה infra B: ללא session קודם, ההודעה המאוחרת קובעת את המסלול.

### C (P1) — תפיסת עיבוד עם טוקן-בעלות + חידוש אטומי
`whatsapp_message_log.session_id` = טוקן-בעלות. חידוש אחרי timeout: **מחיקה מותנית-טוקן** (רק זוכה אחד
מוחק ותופס מחדש). `releaseClaim`/`markProcessed` מותנים בטוקן — עובד ישן שהוחלף לא משחרר/מסיים בעלות
של המחליף. בדיקה infra C: שני retry מקבילים אחרי timeout → עיבוד אחד בלבד.

### D (P2) — כשל DELETE אינו הצלחה
`clearSessionIfCurrent` מחזיר `{stale, error}`; ב-error → `applyResult` מסמן `saved=false` ועוצר לפני
פנייה/התראה/סימון-השלמה, ומחזיר saveError (retry). כשל insert/update/delete נבדקים בנפרד. גם מחיקת
ה-session בסיום ניתוח מדיה עברה ל-`clearSessionIfCurrent` (מותנה-rev). בדיקה infra D + **הודגם fail-before**.

### E (P2) — חידוש כרטיס ב-retry: **חריג מוצרי מתועד**
`renewRecurringCard` רץ בתוך processMessage; אם השמירה נכשלה *אחריו*, retry יריץ אותו שוב → ייתכן
לינק/מייל חידוש שני. **אין חיוב כפול** (רק לינק לעדכון כרטיס). הפעולות הכספיות הקריטיות (ביטול רישום,
ביטול הו"ק) *כן* אידמפוטנטיות דרך בדיקת-סטטוס. מתועד בקוד ב-`flows.ts` (מעל renewRecurringCard).
**לכן R5 אינו "exactly-once" עבור חידוש הכרטיס** — זו החלטה מודעת (astra התיר לקבל כחריג מתועד).
אם לא מקובל, נדרש מפתח-פעולה פר-message ברמת ה-flow (מיגרציה/שדה) — לא מומש כאן.

## נקודות קוד שתוקנו גם (מהערות הקריאה של astra)
- מחיקת session במדיה — עברה למותנית-rev.
- ניקוי session שפג תוקף — אין יותר DELETE-by-phone ב-loadSession; מצב פג-תוקף מאותחל בזמן ה-upsert.

## מיגרציה (חובה לפני פריסה)
`supabase/migrations/add_bot_sessions_rev.sql` — `alter table bot_sessions add column if not exists rev uuid;`
(`whatsapp_message_log.session_id` כבר קיים בסכימה). additive ובטוח. **לאחר החלה — מומלץ להריץ אינטגרציה
מול DB בדיקות עם האילוצים האמיתיים**, כפי ש-astra ביקש (בדיקות ה-mock בודקות סדרי-ביצוע, לא PostgreSQL אמיתי).

## מצב
`tsc` נקי · replay 128/128 · infra 29/29 · בלי פריסה. הסימולטור מושבת. חסום בהחלטות (מחוץ להיקף):
1.3 מדיניות ביטול כספי · #7 §10-11 · גבעתיים · §3/§4 · פרסונה.
