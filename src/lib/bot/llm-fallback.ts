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
 * - אם ההורה נמצא באמצע זרימה — עזור לו לחזור לנקודה שבה היה (suggestFlow)
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
✅ לעזור להורה לחזור לתהליך שהיה באמצעות suggestFlow
✅ לשאול שאלת הבהרה כשלא ברור מה ההורה צריך
✅ להעביר לקורלי (הנציגה) כשאין תשובה או שהנושא רגיש/חריג

== מה אסור לך לעשות ==
❌ לקבוע מדיניות חדשה או לסטות מהתקנון
❌ לבצע ביטול/רישום בעצמך ללא אישור נציגה
❌ לאסוף פרטי אשראי/בנק
❌ להעביר לנציגה שאלות שיש להן תשובה ידועה (עלויות, הנחות, מדיניות)
❌ *להמציא נתונים* — שם ילד/ה, סכום, סטטוס תשלום, רישום — שלא נמסרו לך במפורש בהקשר.
   אם חסר לך מידע מזהה (כמו שם הילד/ה), *בקש אותו בנימוס* — אל תניח ואל תמציא שם.
   אם ההורה מתלונן שכבר נתן מידע ואינך רואה אותו — התנצל ובקש שיחזור עליו, אל תנחש.

== כשלא בטוח לגמרי ==
אמור: "אני מעבירה את זה לקורלי, הנציגה שלנו, והיא תחזור אליך בהקדם 💛"
וצרף createTask=true בתשובתך. (עדיף זה על תשובה שגויה או לא-רלוונטית.)

== פורמט התשובה ==
ענה ב-JSON תקני בלבד (גרשיים כפולים, true/false באותיות קטנות — לא פורמט Python!):
{
  "text": "הטקסט שישלח להורה בוואטסאפ (עברית, עם אמוג'ים ו*bold* לפי הצורך)",
  "createTask": false,
  "taskDescription": "",
  "suggestFlow": ""
}

שדה suggestFlow: אם ההורה נמצא באמצע תהליך וחרג ממנו, כתוב כאן את שם הזרימה שאליה כדאי לחזור.
לדוגמה: אם המשתמש נמצא ב-register_child_name ושאל שאלה, החזר suggestFlow: "register_child_name".
אם אין זרימה להציע — השאר ריק.`

export interface LLMFallbackResult {
  text:             string
  createTask?:      boolean
  taskDescription?: string
  suggestFlow?:     string   // ← חדש: לנווט חזרה לזרימה
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
  try {
    const { buildStaffContext } = await import('./staff-info')
    const staffCtx = await buildStaffContext(session.phone)
    if (staffCtx) { contextLines.push(staffCtx); knowsParentFromPhone = true }
  } catch { /* לא חוסם — אם נכשל, ממשיכים בלי ההקשר */ }

  if (session.currentFlow) contextLines.push(`זרימה פעילה: ${session.currentFlow} — אם ההורה חרג ממנה, עזור לו לחזור ורשום suggestFlow`)
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

  const systemWithContext = contextLines.length > 0
    ? SYSTEM_PROMPT_BASE + '\n\n== הקשר נוכחי ==\n' + contextLines.join('\n')
    : SYSTEM_PROMPT_BASE

  try {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 450,
      system:     systemWithContext,
      messages,
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

    // נסה לפענח JSON
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as LLMFallbackResult
        return {
          text:             parsed.text || buildLLMErrorFallback(),
          createTask:       !!parsed.createTask,
          taskDescription:  parsed.taskDescription,
          suggestFlow:      parsed.suggestFlow || undefined,
        }
      } catch {
        // JSON לא תקין (למשל גרשיים בודדים בסגנון Python) —
        // מחלצים את שדה text ידנית כדי שלא ידלוף dict גולמי להורה
        const textField = jsonMatch[0].match(/['"]text['"]\s*:\s*(['"])([\s\S]*?)\1\s*[,}]/)
        if (textField?.[2] && textField[2].trim().length > 2) {
          return { text: textField[2].trim() }
        }
        console.error('[LLM fallback] Unparseable JSON-like response:', rawText.slice(0, 200))
        return { text: buildLLMErrorFallback() }
      }
    }

    // אין JSON בכלל — אם זה טקסט נקי (לא נראה כמו dict), שלח אותו כמו שהוא
    if (rawText.length > 10 && !rawText.trimStart().startsWith('{')) {
      return { text: rawText }
    }

    return { text: buildLLMErrorFallback() }
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
