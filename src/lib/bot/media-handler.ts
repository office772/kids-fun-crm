// ─── טיפול בקבצים ותמונות שנשלחים לבוט ───────────────────────────────────────
// uChat שולח מדיה כ-URL בטקסט ההודעה (למשל uchat.com.au/media/whatsapp/.../file.pdf).
// לפני התיקון: ה-intent classifier ניסה לנחש כוונה מתוך ה-URL → תפריטים אקראיים
// (זה היה הכשל המרכזי בבדיקות של אייל וקורלי, 06/2026).
// עכשיו: תמונות ו-PDF נשלחים ל-Claude לניתוח אמיתי (vision / document);
// קבצים שלא ניתן לנתח (docx/xlsx/אודיו) מקבלים אישור קבלה מנומס + העברה לקורלי.

import Anthropic from '@anthropic-ai/sdk'
import type { BotSession } from '@/lib/types'
import type { BotResponse } from './flows'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8MB — מעבר לזה לא מורידים

// סיומות מוכרות לפי סוג טיפול
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)(\?|$)/i
const PDF_EXT   = /\.pdf(\?|$)/i
const OTHER_DOC_EXT = /\.(docx?|xlsx?|pptx?|csv|opus|mp3|m4a|ogg|mp4|mov|zip)(\?|$)/i

export interface MediaInfo {
  url:     string
  kind:    'image' | 'pdf' | 'other'
  caption: string   // טקסט חופשי שנשלח לצד הקובץ (אם יש)
}

// מזהה אם ההודעה היא קובץ/תמונה. מחזיר null אם זו הודעת טקסט רגילה.
export function detectMedia(messageText: string): MediaInfo | null {
  const urlMatch = messageText.match(/https?:\/\/\S+/)
  if (!urlMatch) return null
  const url = urlMatch[0]
  const caption = messageText.replace(url, '').trim()

  const isUchatMedia = /uchat\.com\.au\/media\//i.test(url)
  if (IMAGE_EXT.test(url)) return { url, kind: 'image', caption }
  if (PDF_EXT.test(url))   return { url, kind: 'pdf', caption }
  if (OTHER_DOC_EXT.test(url) || isUchatMedia) return { url, kind: 'other', caption }

  // קישור רגיל (אתר, Google Drive וכו') — לא מדיה להורדה, אבל גם לא טקסט שאפשר
  // לסווג ממנו כוונה. מטפלים בו כ"קובץ אחר" כדי שלא ייפול לתפריט אקראי.
  return { url, kind: 'other', caption }
}

const MEDIA_SYSTEM_PROMPT = `את/ה העוזר/ת הדיגיטלי/ת של "Kids & Fun" (צהרונים וקייטנות). הורה שלח/ה קובץ בוואטסאפ.
משימתך: להבין מה הקובץ, לאשר קבלה בחום ובעברית, ולהחליט אם צריך נציגה.

כללים:
• תאר/י בקצרה מה זיהית בקובץ (למשל: "קיבלתי את האישור הרפואי של דנה 🙏").
• אם זה מסמך שנוגע לרישום/תשלום/אישור רפואי — אמור/י שמעבירים לקורלי (הנציגה) לטיפול, וצרף/י createTask=true עם תיאור מדויק של מה שיש בקובץ.
• אם לא ברור למה הקובץ נשלח — שאל/י בעדינות במה לעזור.
• אל תמציא/י פרטים שלא מופיעים בקובץ. אל תיתן/י ייעוץ רפואי/משפטי.
• קצר וחם: 1-3 משפטים + אמוג'י אחד-שניים.

ענה/י ב-JSON תקני בלבד:
{"text": "ההודעה להורה", "createTask": false, "taskDescription": ""}`

// מוריד קובץ ומחזיר base64 + media type. null אם גדול מדי / נכשל.
async function downloadAsBase64(url: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    const len = parseInt(res.headers.get('content-length') ?? '0', 10)
    if (len > MAX_FILE_BYTES) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > MAX_FILE_BYTES) return null
    const mediaType = res.headers.get('content-type')?.split(';')[0] || 'application/octet-stream'
    return { base64: buf.toString('base64'), mediaType }
  } catch (err) {
    console.error('[media] download failed:', err)
    return null
  }
}

// ניסוח ברירת מחדל כשאי אפשר לנתח — אישור קבלה + העברה לקורלי
function buildFallbackAck(caption: string): BotResponse {
  return {
    text:
      `קיבלתי את הקובץ 🙏\n\n` +
      `אני מעבירה אותו לקורלי, הנציגה שלנו, שתעבור עליו ותחזור אליך בהקדם 💛\n` +
      `אם תרצו לזרז — אפשר לכתוב לי כאן במילים במה מדובר 😊`,
    isComplete: true,
    createTask: {
      type: 'שאלה כללית',
      description: `הורה שלח/ה קובץ בוואטסאפ${caption ? ` עם הכיתוב: "${caption.slice(0, 80)}"` : ''} — הבוט לא ניתח (סוג קובץ לא נתמך). לפתוח ולטפל.`,
      priority: 'גבוה',
    },
  }
}

// ─── הטיפול המרכזי ───────────────────────────────────────────────────────────
export async function handleMediaMessage(
  session: BotSession,
  media: MediaInfo
): Promise<BotResponse> {
  // קבצים שאי אפשר לנתח (וורד/אקסל/אודיו/וידאו/קישורים) — אישור קבלה + קורלי
  if (media.kind === 'other') return buildFallbackAck(media.caption)

  const file = await downloadAsBase64(media.url)
  if (!file) return buildFallbackAck(media.caption)

  // בניית content block לפי סוג
  const fileBlock =
    media.kind === 'image'
      ? {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mediaType)
              ? file.mediaType
              : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
            data: file.base64,
          },
        }
      : {
          type: 'document' as const,
          source: {
            type: 'base64' as const,
            media_type: 'application/pdf' as const,
            data: file.base64,
          },
        }

  const contextLines: string[] = []
  if (session.parentName) contextLines.push(`שם ההורה: ${session.parentName}`)
  if (media.caption)      contextLines.push(`ההורה כתב/ה לצד הקובץ: "${media.caption}"`)

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 450,
      system: MEDIA_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            fileBlock,
            {
              type: 'text',
              text: contextLines.length
                ? contextLines.join('\n')
                : 'ההורה שלח/ה את הקובץ בלי טקסט נלווה.',
            },
          ],
        },
      ],
    })

    const rawText = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { text?: string; createTask?: boolean; taskDescription?: string }
      if (parsed.text) {
        return {
          text: parsed.text,
          isComplete: true,
          ...(parsed.createTask
            ? {
                createTask: {
                  type: 'שאלה כללית',
                  description: parsed.taskDescription || `הורה שלח/ה קובץ — דורש טיפול (ראה שיחה)`,
                  priority: 'גבוה' as const,
                },
              }
            : {}),
        }
      }
    }
    // תשובה טקסטואלית נקייה בלי JSON — נשלח כמו שהיא
    if (rawText.length > 10 && !rawText.trimStart().startsWith('{')) {
      return { text: rawText, isComplete: true }
    }
    return buildFallbackAck(media.caption)
  } catch (err) {
    console.error('[media] Claude analysis failed:', err)
    return buildFallbackAck(media.caption)
  }
}
