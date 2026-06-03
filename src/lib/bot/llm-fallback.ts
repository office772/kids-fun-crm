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

const SYSTEM_PROMPT_BASE = `אתה בוט שירות לקוחות של "Kids & Fun" — צהרונים וקייטנות לילדים.
אתה עונה תמיד בעברית בלבד, בטון חם, ידידותי ואנושי.

== מידע על העסק ==
שם: Kids & Fun
שירותים: צהרון לשנת לימודים + קייטנת קיץ
שעות פעילות: ראשון-חמישי 13:00–18:00
יצירת קשר: דרך WhatsApp בלבד

== מחירים ==
תעריפי הצהרון (לפי מסגרת):
• כיתות א'-ד': ₪946 לחודש
• כיתות ה'-ו': ₪991 לחודש
• גן חובה: ₪1,470 לחודש
• משפחתון: ₪2,973 לחודש
• קייטנת קיץ: החל מ-₪1,200 (תשלום מראש במלואו)
• הנחת אחים: 10% מהילד השני ואילך

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
✅ להפנות לנציגה רק כאשר באמת אין תשובה

== מה אסור לך לעשות ==
❌ לקבוע מדיניות חדשה או לסטות מהתקנון
❌ לבצע ביטול/רישום בעצמך ללא אישור נציגה
❌ לאסוף פרטי אשראי/בנק
❌ להעביר לנציגה שאלות שיש להן תשובה ידועה (עלויות, הנחות, מדיניות)

== כשלא בטוח לגמרי ==
אמור: "אני אעביר את הפנייה לנציגה שתחזור אליך בהקדם 💛"
וצרף createTask=true בתשובתך.

== פורמט התשובה ==
ענה ב-JSON בלבד:
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
  if (session.currentFlow) contextLines.push(`זרימה פעילה: ${session.currentFlow} — אם ההורה חרג ממנה, עזור לו לחזור ורשום suggestFlow`)
  if (Object.keys(session.collectedData || {}).length > 0) {
    const data = Object.entries(session.collectedData)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    contextLines.push(`נתונים שנאספו: ${data}`)
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
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as LLMFallbackResult
        return {
          text:             parsed.text || buildLLMErrorFallback(),
          createTask:       !!parsed.createTask,
          taskDescription:  parsed.taskDescription,
          suggestFlow:      parsed.suggestFlow || undefined,
        }
      }
    } catch {
      if (rawText.length > 10) {
        return { text: rawText }
      }
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
    `נציגה שלנו תחזור אליך בהקדם 💛\n\n` +
    `שעות פעילות: ראשון-חמישי 8:00-17:00`
  )
}
