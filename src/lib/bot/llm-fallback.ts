/**
 * LLM Fallback — Claude API
 *
 * נקרא כאשר שום FP (Fast Path) לא תפס את ההודעה,
 * או כאשר ההורה כותב טקסט חופשי באמצע זרימה.
 *
 * כללים שמוגדרים ב-system prompt:
 * - עברית בלבד
 * - אסור לאסוף פרטי כרטיס אשראי
 * - אסור לקבוע בעצמו מדיניות
 * - אסור *לבצע* או "לשמור" פעולות תפעוליות — אלה קורות רק במסלולים
 * - אם לא בטוח → מפנה לנציגה
 */

import Anthropic from '@anthropic-ai/sdk'
import type { BotSession } from '@/lib/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SYSTEM_PROMPT_BASE = `את/ה העוזר/ת הדיגיטלי/ת של "Kids & Fun" — צהרונים וקייטנות לילדים.
עונה תמיד בעברית בלבד, בטון חם, אנושי ושירותי — כמו נציגה אמיתית שאכפת לה.

== איך לדבר (חשוב מאוד) ==
• קצר, ברור וחביב. משפט-שניים, לא נאום. אמוג'י אחד-שניים לחום, לא יותר.
• תמיד לענות *לגופו של עניין* — ממש למה שההורה שאל. לא תשובה כללית שלא קשורה.
• אם לא הבנת את השאלה, או שהיא מנוסחת עמום — *אל תנחש ואל תמציא תשובה*.
  במקום זה שאל/י שאלת הבהרה קצרה: "רק שאדייק — התכוונת ל...?" או "אשמח שתפרט/י קצת".
• בסוף תשובה מהותית — הצע/י עזרה נוספת בעדינות: "עזר? אם צריך עוד משהו אני כאן 😊".

== מתי להעביר לקורלי (הנציגה) ==
אם אחרי הבהרה עדיין לא ברור, או שאין לך תשובה, או שהנושא רגיש/חריג/כספי —
אמור/י בחום: "אני מעבירה את זה לקורלי, הנציגה שלנו, והיא תחזור אליך בהקדם 💛"
וצרף/י createTask=true עם taskDescription שמסכם מה ההורה צריך. עדיף להעביר לקורלי
מאשר לענות תשובה שגויה או לא-רלוונטית.

== מידע על העסק ==
שם: Kids & Fun
שירותים: צהרון לשנת לימודים + קייטנת קיץ
נציגה אנושית: קורלי
יצירת קשר: דרך WhatsApp בלבד

== שעות, מחירים, חגים ולוחות זמנים ==
המידע הזה חי ב-FAQ של המערכת ומוזרק אליך בהקשר לפני קריאה זו — אם קיים.
⚠️ אל תמציא ואל תנקוב בשעות, מחירים, חגים או תאריכים מתוך הידע הכללי שלך.
   אם הפרט המדויק לא מופיע בהקשר שקיבלת — אמור שתעביר את הפנייה לנציגה שתאשר,
   וצרף createTask=true. עדיף "אבדוק ואחזור אלייך" על פני מספר שגוי.

== אפשרויות תשלום ==
הוראת קבע, אשראי (PayPlus), מזומן, צ'קים, העברה בנקאית, קישור תשלום מיידי.
⚠️ אסור לאסוף פרטי כרטיס אשראי דרך WhatsApp — רק לתאם שיחה עם נציגה.

== מדיניות ביטולים ==
• ביטול עד ה-15 לחודש: המשך עד סוף החודש + זיכוי מלא
• ביטול אחרי ה-15: ממשיכים חודש נוסף ומפסיקים מהחודש שלאחריו
• מקרים חריגים (מחלה, מעבר): מטופלים אישית על ידי נציגה

== מה אתה יכול לעשות ==
✅ לענות על שאלות כלליות על הצהרון/קייטנה
✅ להסביר מדיניות ועלויות (כולל הנחות, תשלום מראש)
✅ להרגיע הורים מוטרדים
✅ לאסוף מידע ראשוני לפנייה
✅ לשאול שאלת הבהרה כשלא ברור מה ההורה צריך
✅ להעביר לקורלי (הנציגה) כשאין תשובה או שהנושא רגיש/חריג

== ⛔ פעולות תפעוליות — אתה לא מבצע ולא מאשר ==
אתה *לא יכול* לבצע, לשמור, לרשום, לבטל, לאשר או "לעדכן במערכת" שום דבר.
זה כולל: איסוף מוקדם, רישום, ביטול, שינוי ימים/שעות, הנחה, זיכוי, החזר כספי, "הקפאה".
❌ אסור לומר "רשמתי", "עדכנתי", "שמרתי", "הצוות עודכן", "יטופל אוטומטית".
✅ במקום זה — הפנה למסלול: "כתבו 'איסוף מוקדם' ואקח את הפרטים" / "כתבו 'ביטול'".
✅ או אמור שתעביר לקורלי — ואז createTask=true *חובה*.
   כל תשובה שאומרת שמעבירים לקורלי/לנציגה חייבת לכלול createTask=true.
• אין אצלנו שירות "הקפאה" של צהרון — לא להציע אותו.
• החזרים כספיים/זיכויים חריגים — רק קורלי מטפלת, לא אתה.

== מה אסור לך לעשות ==
❌ לתת מספרי חירום או קווי סיוע (אין לך מידע מאומת עליהם) — אם ההורה במצוקה, הפנה/י לנציגה בלבד
❌ לקבוע מדיניות חדשה או לסטות מהתקנון
❌ לאסוף פרטי אשראי/בנק
❌ להעביר לנציגה שאלות שיש להן תשובה ידועה (עלויות, הנחות, מדיניות)
❌ לנקוב בשעות/חגים/מחירים שלא הופיעו בהקשר שקיבלת, ואל תוסיף "מה כלול במחיר"
❌ *להמציא נתונים* — שם ילד/ה, סכום, סטטוס תשלום, רישום — שלא נמסרו לך במפורש בהקשר.
   אם חסר לך מידע מזהה (כמו שם הילד/ה), *בקש אותו בנימוס* — אל תניח ואל תמציא שם.
   אם ההורה מתלונן שכבר נתן מידע ואינך רואה אותו — התנצל ובקש שיחזור עליו, אל תנחש.

== כשלא בטוח לגמרי ==
אמור: "אני מעבירה את זה לקורלי, הנציגה שלנו, והיא תחזור אליך בהקדם 💛"
וצרף createTask=true בתשובתך. (עדיף זה על תשובה שגויה או לא-רלוונטית.)

== פורמט התשובה ==
ענה ב-JSON תקני בלבד, בלי טקסט לפני או אחרי ובלי סימוני קוד
(גרשיים כפולים, true/false באותיות קטנות — לא פורמט Python!):
{
  "text": "הטקסט שישלח להורה בוואטסאפ (עברית, עם אמוג'ים ו*bold* לפי הצורך)",
  "createTask": false,
  "taskDescription": "",
  "userWantsHuman": false
}

שדה userWantsHuman: true *רק* כשההורה מבקש במפורש לדבר עם בן אדם / נציגה / קורלי
("תעבירי אותי לנציגה", "אני רוצה לדבר עם מישהו אמיתי"). לא כשהוא רק מתוסכל.
עיצוב טקסט בוואטסאפ: *מודגש* בכוכבית אחת — לא ** ולא Markdown.`

export interface LLMFallbackResult {
  text:             string
  createTask?:      boolean
  taskDescription?: string
  userWantsHuman?:  boolean   // בקשה מפורשת לנציג/ה → הסלמה מלאה
}

// ─── ניקוי טקסט לוואטסאפ ─────────────────────────────────────────────────────
// וואטסאפ לא מכיר Markdown: **מודגש** מגיע להורה עם הכוכביות. ממירים ל-*מודגש*.
export function sanitizeForWhatsApp(text: string): string {
  return (text || '')
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s*/gm, '')
    .trim()
}

// ─── פענוח תשובת ה-LLM ───────────────────────────────────────────────────────
// ⚠️ כלל ברזל: *לעולם* לא לשלוח להורה JSON גולמי / ```json / dict בסגנון Python.
// מקרים שנתפסו באתגור: JSON עטוף בגדרות קוד, JSON שנחתך באמצע (max_tokens),
// וגרשיים בודדים. כל אלה חוזרים כטקסט נקי או כ-null (ואז הודעת הנפילה הגנרית).
export function parseLLMResponse(raw: string): LLMFallbackResult | null {
  const text = (raw || '').trim()
  if (!text) return null

  // 1. גדרות קוד — ```json { ... } ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i)
  const body   = (fenced?.[1] ?? text).trim()

  // 2. JSON תקין
  const braced = body.match(/\{[\s\S]*\}/)
  if (braced) {
    try {
      const parsed = JSON.parse(braced[0]) as LLMFallbackResult
      if (parsed && typeof parsed.text === 'string' && parsed.text.trim()) {
        return {
          text:            sanitizeForWhatsApp(parsed.text),
          createTask:      !!parsed.createTask,
          taskDescription: parsed.taskDescription,
          userWantsHuman:  !!parsed.userWantsHuman,
        }
      }
    } catch { /* ממשיכים לחילוץ ידני */ }
  }

  // 3. חילוץ ידני של שדה text — גם מ-JSON חתוך/פגום (גרשיים בודדים, בלי סוגר)
  const looksLikeJson = /["']text["']\s*:/.test(body)
  if (looksLikeJson) {
    const closed = body.match(/["']text["']\s*:\s*(["'])([\s\S]*?)\1\s*(,|\}|$)/)
    const open   = body.match(/["']text["']\s*:\s*(["'])([\s\S]*)$/)
    const value  = (closed?.[2] ?? open?.[2] ?? '').replace(/\\n/g, '\n').replace(/\\"/g, '"').trim()
    if (value.length > 2) {
      const createTask = /["']createTask["']\s*:\s*true/i.test(body)
      const wantsHuman = /["']userWantsHuman["']\s*:\s*true/i.test(body)
      return { text: sanitizeForWhatsApp(value), createTask, userWantsHuman: wantsHuman }
    }
    return null   // JSON פגום בלי טקסט שמיש → הודעת נפילה גנרית
  }

  // 4. טקסט חופשי נקי (בלי סימני JSON/קוד) — נשלח כמו שהוא
  if (!body.startsWith('{') && !body.includes('```') && body.length > 10) {
    return { text: sanitizeForWhatsApp(body) }
  }
  return null
}

export async function callLLMFallback(
  session: BotSession,
  userMessage: string
): Promise<LLMFallbackResult> {
  // בנה היסטוריית שיחה — עד 10 הודעות אחרונות
  const recentMessages = (session.messages || [])
    .slice(-10)
    .map(m => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.text,
    }))

  // הוסף את ההודעה הנוכחית
  const messages: Anthropic.MessageParam[] = [
    ...recentMessages,
    { role: 'user', content: userMessage },
  ]

  // הקשר session מפורט
  const contextLines: string[] = []
  if (session.parentName)  contextLines.push(`הורה: ${session.parentName}`)

  // מסגרת + צוות ההורה — כדי שהבוט "ידע" לענות על שאלות לגבי הגן/הצוות שלו.
  // אם זוהתה מסגרת לפי הטלפון — אנחנו כן מכירים את הילד/ים, ולכן לא נפעיל
  // את אזהרת "אין לך שם ילד" (שאחרת תגרום לבוט לבקש שם למרות שהוא יודע).
  let knowsParentFromPhone = false

  // ילדים + סטטוס רישום + תשלום אחרון — בלי זה הבוט ענה "אין לי גישה לנתוני
  // הרישום" והסלים לקורלי, דקות אחרי שהוא עצמו הציג את הרישום (לוגים 09/2026).
  try {
    const { buildParentContext } = await import('./staff-info')
    const parentCtx = await buildParentContext(session.phone)
    if (parentCtx) {
      contextLines.push(parentCtx.text)
      if (parentCtx.hasChildren) knowsParentFromPhone = true
    }
  } catch { /* לא חוסם — אם נכשל, ממשיכים בלי ההקשר */ }

  try {
    const { buildStaffContext } = await import('./staff-info')
    const staffCtx = await buildStaffContext(session.phone)
    if (staffCtx) { contextLines.push(staffCtx); knowsParentFromPhone = true }
  } catch { /* לא חוסם — אם נכשל, ממשיכים בלי ההקשר */ }

  // מחירים — מקור האמת הוא pricing.ts (ה-FAQ מכיל placeholder). כשהמסגרת ידועה — מחיר מדויק.
  try {
    const { resolveMonthlyFee } = await import('./pricing')
    const cd = session.collectedData || {}
    const fee = resolveMonthlyFee({ area_code: cd.area_code, school: cd.school, class_name: cd.class_name })
    contextLines.push(fee
      ? `מחיר הצהרון החודשי למסגרת של ההורה: ${fee} ₪ (אפשר לנקוב בו; אל תוסיף מה כלול במחיר — לא ידוע לך).`
      : `מחירי צהרון חודשיים לפי מסגרת (אפשר לנקוב כשההורה אומר איזה גן/בי"ס): גלי עתלית 1150 ₪ · מתן כיתות א-ב 916 ₪, כיתה ג 1015 ₪ · חצב ואלמוג 1470 ₪ · גני תל אביב 946 ₪ או 991 ₪ לפי הגן. אם המסגרת לא ידועה — שאל/י באיזה גן/בי"ס הילד/ה, אל תעביר לנציגה.`)
  } catch { /* לא חוסם */ }

  // שעות + חגים — מתוך ה-FAQ שהלקוחה עורכת בדשבורד. בלי זה ה-LLM המציא שעות
  // או הסלים לקורלי על שאלה שיש לה תשובה שמורה.
  try {
    const { findFaqByTopic } = await import('./faq-search')
    const [hours, holidays] = await Promise.all([
      findFaqByTopic(['שעות', 'שעות פעילות']),
      findFaqByTopic(['חג', 'חגים', 'חופש', 'חופשה']),
    ])
    if (hours)    contextLines.push(`שעות הפעילות (מקור רשמי — אפשר לצטט): ${hours}`)
    if (holidays) contextLines.push(`חגים וחופשות (מקור רשמי — אפשר לצטט): ${holidays}`)
  } catch { /* לא חוסם */ }

  if (session.currentFlow) contextLines.push(`זרימה פעילה: ${session.currentFlow} — ההורה באמצע תהליך; ענה על שאלתו והזכר לו בעדינות איפה עצרנו. אל תתחיל תהליך אחר.`)
  if (Object.keys(session.collectedData || {}).length > 0) {
    const data = Object.entries(session.collectedData)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    contextLines.push(`נתונים שנאספו: ${data}`)
  }
  // הגנה מהזיה: אם אין שם ילד/ה — לומר ל-LLM מפורשות שאין, ושיבקש (לא ימציא).
  // מדלגים אם כבר זיהינו את ההורה+ילדים לפי הטלפון (אז אנחנו באמת מכירים אותם).
  if (!session.collectedData?.child_name && !knowsParentFromPhone) {
    contextLines.push(
      `⚠️ אין לך את שם הילד/ה של ההורה הזה ואין לך רשומה שלו. ` +
      `אל תאמר "מצאתי אותך/יש לי את הנתונים" ואל תמציא שם — בקש בנימוס את שם הילד/ה המלא.`
    )
  }

  // קול הבוט (פרסונה/טון שהלקוח הגדיר בדשבורד). ריק → '' → הפרומפט לא משתנה.
  let voiceBlock = ''
  try {
    const { getBotVoice, buildVoicePromptBlock } = await import('./bot-voice')
    voiceBlock = buildVoicePromptBlock(await getBotVoice())
  } catch { /* לא חוסם — אם נכשל, ממשיכים עם הפרומפט הרגיל */ }
  const systemBase = SYSTEM_PROMPT_BASE + voiceBlock

  const systemWithContext = contextLines.length > 0
    ? systemBase + '\n\n== הקשר נוכחי ==\n' + contextLines.join('\n')
    : systemBase

  try {
    // המודל ניתן להחלפה ב-env (BOT_LLM_MODEL) — ברירת מחדל Haiku 4.5.
    // מודלים חדשים (Sonnet 5 / Opus 5) חושבים לפני התשובה: מאמץ נמוך + תקציב גדול יותר,
    // כדי לא לחרוג מה-timeout של uChat ולא להיחתך באמצע.
    // max_tokens 900 ל-Haiku: ב-450 תשובות בעברית נחתכו באמצע ה-JSON
    // וההורה קיבל חצי סוגר מסולסל (אתגור 17.9).
    const model  = process.env.BOT_LLM_MODEL || 'claude-haiku-4-5'
    const tuning = model.includes('haiku') ? {} : { max_tokens: 1500, output_config: { effort: 'low' } }
    const response = await anthropic.messages.create({
      model,
      max_tokens: 900,
      ...(tuning as Record<string, unknown>),
      system:     systemWithContext,
      messages,
    })

    // בלוק הטקסט הראשון — לא content[0]: במודלים עם thinking הבלוק הראשון הוא 'thinking'
    // (זה גרם ל-Sonnet/Opus להחזיר תמיד את ה-fallback הגנרי).
    const textBlock = response.content.find(b => b.type === 'text')
    const rawText = textBlock && textBlock.type === 'text' ? textBlock.text : ''

    const parsed = parseLLMResponse(rawText)
    if (!parsed) {
      console.error(
        `[LLM fallback] Unusable response (stop_reason=${response.stop_reason}):`,
        rawText.slice(0, 200)
      )
      return { text: buildLLMErrorFallback() }
    }
    return parsed
  } catch (err) {
    console.error('[LLM fallback] Claude API error:', err)
    return { text: buildLLMErrorFallback() }
  }
}

function buildLLMErrorFallback(): string {
  return (
    `אשמח לעזור! 😊\n\n` +
    `כדי שנוכל לטפל בפנייה בצורה הטובה ביותר — ` +
    `נציגה שלנו תחזור אליך בהקדם 💛`
  )
}
