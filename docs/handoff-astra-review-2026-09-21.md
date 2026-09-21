# הנדאוף לסקירת מימוש - תיקוני astra (Kids & Fun bot)

**תאריך:** 21.9.2026 · **ברנץ':** `claude/kids-fun-astra-review-0ef589` · **בסיס:** `c9b5cf1`
**מיועד ל:** סקירה יריבה של astra על *המימוש* (לא התוכנית). לא מוזג, לא נפרס.

## מטרה
astra הריץ שתי סקירות (8 + 6 = 14 ממצאים) וביקר את תוכנית התיקון. המימוש בוצע לפי התוכנית
המאושרת ולפי 4 הדיוקים האחרונים של astra. **הבקשה: לאמת שכל תיקון באמת סוגר את הממצא, לא רק את
הדוגמה; לאתגר את נקודות ההכרעה (למטה); ולוודא שלא נשבר דבר.** אישור פריסה יינתן רק אחרי הסקירה.

## איך מריצים את הבדיקות
```bash
npx tsc --noEmit                                   # טיפוסים — נקי
ANTHROPIC_API_KEY=dummy npx tsx scripts/replay-bot.ts   # 115/115 (היו 101; +14 רגרסיה)
node scripts/infra-tests.cjs                        # 16/16 (harness מבודד חדש)
```
`scripts/infra-tests.cjs` (חדש, פאזה 0): מריץ את הקוד האמיתי (handler / webhook / simulator) מול
Supabase *מדומה בזיכרון* (Proxy → execute), `global.fetch` חסום, `@vercel/functions` ממוקק.
מבוסס על שיטת ה-harness של astra (`extended-tests.cjs`). זה מה שמאפשר לבדוק את שכבת התשתית בלי
הסימולטור החי (שאינו sandbox - ממצא #9).

## ממצאים שנסגרו - תיקון + קובץ + בדיקה

### פאזה 1 - בטיחות ביטול (S1)
- **#2 אישור מסויג מבצע ביטול** → אישור/שלילה = whitelist סגור בקוד. `unambiguousMatch()` פוסל
  שאלה/הסתייגות על הטקסט *הגולמי* (`CONFIRM_QUALIFIER_RE`) *לפני* נרמול/הסרת פיסוק (כך "כן?" לא
  הופך ל"כן"), ואז התאמה מלאה לרשימה. רשימות **פר-מסלול** (ביטול/המתנה/מקום/זיהוי-ילד), לא משותפות.
  מוחל על כל `CONFIRM_STEPS`. `src/lib/bot/flows.ts` (הפונקציות ~233-262; שימושים ב-cancel/waitlist/spot/payfail).
  בדיקה: `replay-bot.ts` `cancelSafetyCases` - "כן אבל רגע"/"כן, חכה"/"כן רק שנייה"/"בסדר"/"אולי כן"/"כן?"
  → לא מבצע; "כן"/"מאשר" → מבצע. (6 נכשלו לפני התיקון, אומת.)
- **#3 כשל שמירה מדווח "בוצע"** → `performCancellation` בודק את תוצאת ה-`update` (`.select('id')` +
  בדיקת `error`/מערך ריק); בכשל `return null`, ו-PayPlus/timeline רצים *רק אחרי* update מוצלח.
  `src/lib/bot/flows.ts` (`performCancellation`, ~742). בדיקה: `infra-tests.cjs` 1.2 - כשל update →
  אין "בוצע", אין `cancelRecurringPayment`, אין timeline. **הודגם fail-before** (bypass זמני): לפני
  התיקון הראה "✅ הביטול בוצע!" + סליקה בוטלה + timeline נכתב.

### פאזה 2 - תשתית (S1/S2)
- **#9 סימולטור אינו sandbox** → דגל `session.simulated` (טיפוס ב-`types.ts`, נקבע ב-`simulate/route.ts`);
  `performCancellation` מחזיר תוצאה מדומה בלי לגעת ב-DB/PayPlus. `infra-tests.cjs` 2.1.
- **#10 איסוף בלי אימות הורה-ילד** → `applyResult` מנתב מסגרת רק לילד ששייך להורה המזוהה
  (`.eq('parent_id', ...)`, התאמה חד-משמעית); הודעת `pickup_confirm` שונתה מ"הצוות עודכן ויהיה מוכן"
  ל"העברנו את הבקשה לצוות - נאשר אישית". `manychat/route.ts` (~409), `bot-messages-db.ts` (~121). `infra-tests.cjs` 2.2.
- **#11 "הצוות עודכן" בלי מסירה + שגיאת ספק כהצלחה** → `notify.ts` עובר ל-`uchat.sendText` המשותף
  (`content` + בדיקת `status:error` בגוף); שליחה אמיתית לצוות דרך `getUserNsByPhone`; החזרה מדויקת
  (`sentCount>0`). `src/lib/notify.ts`. `infra-tests.cjs` 2.3.
- **#12 תשובה איטית דורסת מסלול חדש** → שמירה מותנית-גרסה: `loadSession` מחזיר `rev`
  (`last_message_at`); `saveSessionIfCurrent` עושה `update ... where last_message_at = rev` (פעולת DB
  אחת); בנתיב הדחוי `applyResult({rev})` - תוצאה מיושנת (0 שורות) *לא נשמרת ולא נשלחת*.
  `manychat/route.ts`. `infra-tests.cjs` 2.4.
- **#13 dedup לא אטומי** → שער INSERT אטומי דרך `id_message UNIQUE`: ה-`logConversation` הנכנס מחזיר
  `error`, ו-`23505` → duplicate skip *לפני* `processMessage`. הוסר ה-SELECT-דדופ לפי מזהה (נשאר
  חלון טקסט ל-הודעות בלי מזהה). `manychat/route.ts`. `infra-tests.cjs` 2.5.
- **#14 כשל שמירה לא עוצר התקדמות** → `saveSession` מחזיר `boolean`; בכשל, במקום השאלה הבאה מוחזרת
  תשובת retry בטוחה (`saveError:true`). `manychat/route.ts`. `infra-tests.cjs` 2.6.

### פאזה 3 - ניתוב (S2/S3)
- **#4 בקשת נציגה נבלעת** → `classifyIntent`: `if (asksHuman) return 'בקשת_נציג'` לפני חוקי
  ביטול/מסגרת/לו"ז/מחיר. `intent-classifier.ts` (~214). בדיקה: `routingCases`.
- **#8 ספרה ערבית מחליפה מסלול** → `normalizeMessage(userMessage)` בכניסה ל-`processMessageCore`
  (הסיווג + `isExplicitNumericChoice` + השלב הפעיל מסכימים). `handler.ts` (~182). בדיקה: `routingCases`.
- **#5 "גן" גנרי → ת"א** → הוסרו `גן|גני` מ-regex תל אביב ב-`areaFromMessage`. `registration-helpers.ts`
  (~14). בדיקה: `routingCases` ("בגן בגבעתיים" ≠ telaviv; "גלי עתלית" עדיין carmel).
- **#6 סירוב הו"ק נבחר כהו"ק** → זיהוי שלילה (`/לא רוצה|לא מתאים|לא צריך|בלי /`) לפני התאמת שיטה →
  re-prompt. `flows.ts` (payment_setup_method). בדיקה: `routingCases`.

### פאזה 4 (חלקי)
- **§5** - הוסרה "אפשר גם לשלם אחרת" מ-`register_has_spot` (לפני הטופס). `bot-messages-db.ts`.

## נקודות הכרעה - לאתגור מפורש של astra
1. **whitelist האישור (#2):** האם `CONFIRM_QUALIFIER_RE` + הרשימות הסגורות מכסות ניסוחים נוספים
   (סלנג, שגיאות כתיב, אמוג'י באמצע)? האם הפסילה-לפני-נרמול באמת מונעת כל עקיפה?
2. **טוקן `last_message_at` (#12):** משתמשים בו כ-optimistic-concurrency במקום עמודת `version`
   ייעודית (בלי מיגרציה). סיכון: התנגשות ב-timestamp זהה (אותה מילישנייה) או שעון. האם מספיק, או
   שצריך `version int` + מיגרציה?
3. **dedup אטומי (#13):** השער עבר ל-`logConversation` שרץ *אחרי* `loadSession`/`loadRecentMessages`
   (קריאות זולות). המפסידה עושה קריאות מיותרות לפני שנחסמת. מקובל? יש מרוץ שנשאר?
4. **אידמפוטנטיות (astra דיוק #3):** #13/#14 מונעים עיבוד/שליחה כפולים, אבל **לא** מומש מנגנון
   idempotency מלא לפעולה עסקית שהצליחה-ואז-שמירה-נכשלה (משימה/סליקה שכבר בוצעו). זה עדיין פתוח -
   לאשר שזה מקובל לשלב הזה או שחייבים עכשיו.
5. **#9 sandbox חלקי:** נחסם רק `performCancellation` (הביטול ההרסני המודגם). כתיבות אחרות מהסימולטור
   (רשימת המתנה, task) עדיין נכתבות. הגנה מלאה + auth תלויות בהחלטת "מצב בדיקה מול אמת".
6. **#6 נוסח:** השתמשנו ב-`payset_method_invalid` ("לא הבנתי, בחרו") אחרי סירוב - פונקציונלית נכון
   (לא בוחר את מה שנדחה) אבל הנוסח לא אידיאלי; Phase 4 (§10-11) ישכתב את מסלול התשלום.

## חסום בהחלטות (לא בוצע)
1.3 מדיניות ביטול (נוסח לפי PDF ברור; הפעולה הכספית חסומה) · #7 §10-11 מסלול תשלום · גבעתיים
(לינק טופס) · §4 שנת לידה · §3 קובץ רפואי · #9 sandbox מלא + Auth · פרסונה (ג'וני).

## מצב
`tsc` נקי · replay 115/115 · infra 16/16 · 10 קבצים שונו + `scripts/infra-tests.cjs` חדש · בלי פריסה.
