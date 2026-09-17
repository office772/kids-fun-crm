import { BotSession } from '@/lib/types'
import {
  createPayPlusPaymentLink,
  getInvoiceLink,
  formatBankTransferMessage,
  loadParentRegistrationContext,
  getPaymentStatusByPhone,
  getPaymentStatusByChildName,
  getDefaultMonthlyFee,
  type PaymentMethod,
} from './payment-helpers'
import { resolveMonthlyFee } from './pricing'
import { getCachedSettings } from './settings-db'

export interface BotResponse {
  text: string
  escalate?: boolean
  // הקשר אופציונלי לפניות שצריכות להגיע לצוות המסגרת (איסוף מוקדם, חולה היום…)
  notifyFramework?: {
    byChildName?: string                  // לחלץ את המסגרת מתוך הילד
    area_code?:   string
    school?:      string
    type?:        'צהרון' | 'קייטנה'
  }
  createTask?: {
    type: string
    description: string
    priority: 'דחוף' | 'גבוה' | 'רגיל'
  }
  nextFlow?: string
  isComplete?: boolean
  // כשהמשתמש חרג מהמסלול (שאלה/הקשר במקום הקלט המבוקש) — לתת ל-LLM לטפל עם הקשר
  useLLM?: boolean
}

const BOT_NAME = 'Kids & Fun'

// ─── זיהוי קלט "מחוץ למסלול" ─────────────────────────────────────────────────
// כשמבקשים שם ילד/ה והמשתמש כותב שאלה/משפט/תלונה — לא לחפש את זה כשם!
// במקום זה נחזיר useLLM כדי שה-LLM (עם הקשר השיחה) יבין או יבקש הבהרה.
const META_WORDS = new Set([
  'איך','למה','מה','מתי','איפה','מי','האם','אבל','לא','כן','כתבת','אמרת','אמרתי',
  'מצאת','שמצאת','הבנת','הבנתי','רוצה','צריך','צריכה','אפשר','תסביר','התכוונת',
  'אומר','אומרת','נכון','בעצם','הרי','שאמרת','שכתבת',
])
export function looksOffScript(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (t.includes('?')) return true
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length > 4) return true                 // שם = 2-4 מילים; משפט ארוך = לא שם
  if (words.some(w => META_WORDS.has(w))) return true
  return false
}

// ─── ולידציית שם ילד/ה ───────────────────────────────────────────────────────
// נמצא באתגור (07/2026): מסלול הביטול קיבל "מנהל" כשם ילד. כל נקודת קליטת שם
// חייבת לוודא שהקלט באמת נראה כמו שם — לא פקודה, מילת שירות, מספר או קישור.
const NOT_A_NAME = new Set([
  // פקודות ומילות מערכת
  'מנהל', 'ניהול', 'אדמין', 'תפריט', 'יציאה', 'סגור', 'החזר', 'השתק', 'ביטול', 'עזרה',
  // מילות שיחה נפוצות
  'כן', 'לא', 'אולי', 'תודה', 'שלום', 'היי', 'הי', 'טוב', 'בסדר', 'אוקי', 'סבבה', 'רגע',
  // נושאי העסק (הורה שעונה על שאלה אחרת)
  'נציג', 'נציגה', 'קייטנה', 'צהרון', 'רישום', 'תשלום', 'חשבונית', 'קבלה', 'מחיר', 'שעות', 'חופש',
  // מילות שעה/זמן — "בשלוש" נשמר כשם ילד/ה בשלב האיסוף (אתגור 17.9)
  'בשלוש', 'שלוש', 'בארבע', 'ארבע', 'בחמש', 'חמש', 'בשתיים', 'שתיים', 'שתים', 'באחת', 'אחת',
  'שש', 'בשש', 'וחצי', 'מחר', 'היום', 'עכשיו', 'מוקדם',
])

// האם הקלט נראה כמו שם ילד/ה (לא בודק מול DB — רק צורנית)
export function looksLikeChildName(text: string): boolean {
  const t = text.trim()
  if (t.length < 2 || t.length > 40) return false
  if (looksOffScript(t)) return false  // שאלות, משפטים ארוכים, מילות מטא
  if (/\d|https?:|@|[?!#$%^*_=+\[\]{}<>\\\/|~]/.test(t)) return false  // ספרות/קישור/סימנים
  const words = t.split(/\s+/).filter(Boolean)
  if (words.some(w => NOT_A_NAME.has(w.replace(/[.,!]/g, '')))) return false
  return true
}

// תגובה אחידה כשהקלט לא נראה כמו שם — נשארים באותו שלב
function buildNotAName(nextFlow: string): BotResponse {
  return {
    text: `זה לא נראה לי כמו שם 🤔\nאפשר בבקשה *שם פרטי + שם משפחה* של הילד/ה? (לדוגמה: נועה כהן)`,
    nextFlow,
  }
}

// ─── תיקון אזור באמצע הרישום ─────────────────────────────────────────────────
// "רגע טעיתי באזור, זה השרון" באמצע שלב השם — לפני התיקון זה נשמר כשם הילד/ה.
const AREA_FIX_RE = /טעיתי|בעצם|שיניתי|לא,? ?(זה|האזור)/
async function tryAreaCorrection(session: BotSession, msg: string): Promise<BotResponse | null> {
  if (!AREA_FIX_RE.test(msg)) return null
  const { areaFromMessage, areaFromSchoolName, AREAS } = await import('./registration-helpers')
  const area = (await areaFromSchoolName(msg)) ?? areaFromMessage(msg)
  if (!area) return null
  session.collectedData.area_code = area
  const label = AREAS[area]?.label ?? area
  return {
    text: `עדכנתי: אזור *${label}* ✅\n\n*מה שם הילד/ה?* (שם פרטי + שם משפחה)`,
    nextFlow: 'register_child_name',
  }
}

// ─── שעה בשפה חופשית → HH:MM ─────────────────────────────────────────────────
// הורים כותבים "בשלוש", "3 וחצי", "15:30" — ולפני התיקון גם "אמא של נועם"
// נשמרה כשעת איסוף ונשלחה לצוות (אתגור 17.9).
// ⚠️ צירופים קודמים למילה בודדת ("אחת עשרה" לפני "אחת")
const HOUR_WORDS: Record<string, number> = {
  'אחת עשרה': 11, 'שתים עשרה': 12, 'שתיים עשרה': 12,
  'אחת': 13, 'שתיים': 14, 'שתים': 14, 'שלוש': 15, 'ארבע': 16, 'חמש': 17, 'שש': 18,
  'שמונה': 8, 'תשע': 9, 'עשר': 10,
}

export function parsePickupTime(input: string): string | null {
  const t = (input || '').trim().replace(/[.,!]+$/g, '')
  if (!t) return null
  const half = /וחצי|:30|\.30/.test(t)

  // 15:30 / 15.30
  const hhmm = t.match(/(^|[^\d])([0-9]{1,2})[:.]([0-9]{2})([^\d]|$)/)
  if (hhmm) {
    const h = parseInt(hhmm[2], 10), m = parseInt(hhmm[3], 10)
    if (h >= 0 && h <= 23 && m < 60) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  // מספר בודד ("3", "3 וחצי", "בשעה 15")
  const num = t.match(/(^|[^\d])([0-9]{1,2})([^\d]|$)/)
  if (num) {
    let h = parseInt(num[2], 10)
    if (h >= 1 && h <= 23) {
      if (h < 7) h += 12                       // "3" = 15:00 (צהרון מסתיים אחה"צ)
      return `${String(h).padStart(2, '0')}:${half ? '30' : '00'}`
    }
  }

  // מילים ("בשלוש", "שלוש וחצי")
  for (const [word, hour] of Object.entries(HOUR_WORDS)) {
    const re = word.includes(' ')
      ? new RegExp(word)
      : new RegExp(`(^|[^א-ת])[ולבהכמש]{0,2}${word}([^א-ת]|$)`)
    if (re.test(t)) return `${String(hour).padStart(2, '0')}:${half ? '30' : '00'}`
  }
  return null
}

// ─── "נועה כהן כיתה ב" → שם + כיתה ───────────────────────────────────────────
// הורים עונים על שתי השאלות בבת אחת. מפצלים לפי מילת הכיתה הראשונה.
const CLASS_TOKEN_RE = /^(כיתה|כתה|גן)$/
export function splitNameAndClass(text: string): { name: string; className: string } | null {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const idx = words.findIndex(w => CLASS_TOKEN_RE.test(w.replace(/[.,!]/g, '')))
  if (idx < 2) return null                       // צריך לפחות שם פרטי + משפחה לפני הכיתה
  const name      = words.slice(0, idx).join(' ')
  const className = words.slice(idx).join(' ')
  if (!className || !looksLikeChildName(name)) return null
  return { name, className }
}

// ─── בעלות: האם הילד/ה בשם הזה שייך/ת להורה שמזוהה לפי הטלפון? ──────────────
// ⚠️ כלל S1: כל שליפה של מידע לפי *שם ילד/ה* חייבת לעבור כאן. בלי זה, מספר זר
// שהקליד שם מוכר קיבל סטטוס תשלום, שם הורה וסכומים של משפחה אחרת (אתגור 17.9).
async function findOwnChildByName(
  phone: string,
  nameInput: string
): Promise<{ id: string; name: string; parent_id: string } | null> {
  const name = (nameInput || '').trim().replace(/\s+/g, ' ')
  if (!phone || phone === 'simulator' || name.length < 2) return null
  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const { phoneVariants } = await import('@/lib/phone')
    const supabase = createServiceClient()
    const { data: parent } = await supabase
      .from('parents').select('id')
      .in('phone', phoneVariants(phone)).limit(1).maybeSingle()
    if (!parent?.id) return null
    const { data: kids } = await supabase
      .from('children').select('id, name, parent_id')
      .eq('parent_id', parent.id).ilike('name', `%${name}%`).limit(2)
    return kids?.length === 1 ? kids[0] : null
  } catch (err) {
    console.error('[findOwnChildByName] error:', err)
    return null
  }
}

// ─── utils ────────────────────────────────────────────────────────────────────
// "עכשיו" לפי שעון ישראל — חובה כי Vercel רץ ב-UTC (אחרת שעה/תאריך שגויים).
export function israelNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
}

// שעות פעילות — נקראות מ-settings (start/end/days) שהלקוח עורך בדשבורד.
// ⚠️ fallback זהה *בדיוק* לקשיח הישן (ימים א-ה, 8:00-17:00) — כשאין הגדרה/cache
//    (או ב-replay בלי DB) ההתנהגות לא משתנה.
export function isBusinessHours(): boolean {
  const il = israelNow()
  const day = il.getDay() // 0=ראשון
  const hour = il.getHours()

  const s = getCachedSettings()
  const start = parseInt(s.business_hours_start || '', 10)
  const end   = parseInt(s.business_hours_end || '', 10)
  const days  = (s.business_days || '')
    .split(',').map(d => parseInt(d.trim(), 10))
    .filter(n => Number.isInteger(n) && n >= 0 && n <= 6)

  const startHour  = Number.isInteger(start) ? start : 8
  const endHour    = Number.isInteger(end) ? end : 17
  const activeDays = days.length ? days : [0, 1, 2, 3, 4]

  return activeDays.includes(day) && hour >= startHour && hour < endHour
}

// ⏰ "שעות שקט" — חלון שבו אסור לבוט לשלוח הודעה יזומה להורה (כולל תזכורות):
// לפני 08:00 או מ-21:30 ואילך (שעון ישראל). תקף רק לשליחה *יזומה מהמערכת* —
// תגובה להודעה שהורה כתב מותרת תמיד (uChat ממילא חוסם מחוץ לחלון 24ש').
export function isQuietHours(now: Date = israelNow()): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes < 8 * 60 || minutes >= 21 * 60 + 30
}

function isYes(msg: string): boolean {
  return /^(כן|אכן|בטח|כן בבקשה|רוצה|אוקי|ok|yes|מאשר|מאשרת|בסדר|טוב|ברור|בטח שכן|בהחלט)/i.test(msg.trim())
}

function isNo(msg: string): boolean {
  return /^(לא|לא רוצה|לא תודה|no|אין צורך|לא עכשיו)/i.test(msg.trim())
}

// ─── "כן"/"לא" *נקיים* — לשלבי אישור קריטיים (ביטול) ────────────────────────
// נמצא בלוגים (09/2026): "לא הבנתי עד מתי אני משלם בפועל?" נקרא כ-"לא" והבוט
// ענה "בסדר, הביטול לא בוצע". שאלה או משפט ארוך אינם תשובת כן/לא —
// הם הולכים ל-LLM (והמסלול נשמר), לא מכריעים פעולה כספית.
function isPlainAnswer(msg: string): boolean {
  const t = msg.trim()
  if (!t) return false
  if (t.includes('?')) return false                     // שאלה — לא הכרעה
  if (/הבנתי|למה|מה זאת|כלומר/.test(t)) return false     // בקשת הבהרה
  return t.split(/\s+/).filter(Boolean).length <= 3      // תשובה קצרה בלבד
}

function isBareYes(msg: string): boolean {
  return isPlainAnswer(msg) && isYes(msg)
}

function isBareNo(msg: string): boolean {
  return isPlainAnswer(msg) && isNo(msg)
}

const MENU_TEXT =
  `*1* — רישום לצהרון\n` +
  `*2* — רישום לקייטנה\n` +
  `*3* — ביטול\n` +
  `*4* — שעות ולוח זמנים\n` +
  `*5* — תשלומים\n` +
  `*6* — איסוף מוקדם`


// ─── ברכה ─────────────────────────────────────────────────────────────────────
export function buildWelcomeMessage(parentName?: string): string {
  const greeting = parentName ? `היי ${parentName.split(' ')[0]} 😊\n\n` : `שלום! 😊\n\n`
  return greeting +
    `כאן ${BOT_NAME}! איך אפשר לעזור?\n\n` +
    MENU_TEXT +
    `\n\nאו פשוט כתוב/י מה צריך 💬`
}

// ─── לא הבנתי ─────────────────────────────────────────────────────────────────
export function buildDidNotUnderstand(): string {
  return `לא הצלחתי להבין 😊\n\nאפשר לבחור מהתפריט:\n\n` + MENU_TEXT
}

// ─── הסלמה לנציג ─────────────────────────────────────────────────────────────
export function buildEscalationMessage(): string {
  if (isBusinessHours()) {
    return `העברתי את פנייתך לקורלי, הנציגה שלנו — היא תחזור אליך בהקדם 💛`
  }
  return `קיבלתי! העברתי לקורלי, הנציגה שלנו, והיא תחזור אליך בשעות הפעילות (ראשון-חמישי 8:00-17:00) 📬\n\nלילה טוב! 🌙`
}

// ─── פנייה יזומה (מהמערכת) ───────────────────────────────────────────────────
// זו ההודעה שהמערכת שולחת כשמזוהה כשל תשלום
export function buildProactivePaymentMessage(parentName: string): string {
  const firstName = parentName.split(' ')[0] || parentName
  return `היי ${firstName}, מה שלומך? 😊\n\n` +
    `הבנק ניסה לחייב אצלינו אבל הפעם לא הצלחנו לעבור.\n\n` +
    `אין מה לדאוג — פשוט צריך לסדר את זה ביחד 💛\n\n` +
    `האם החלפת כרטיס לאחרונה?\n` +
    `*1* — כן, יש לי כרטיס חדש\n` +
    `*2* — לא, תחזרו אלי קצת אחר כך\n` +
    `*3* — יש בעיה אחרת`
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 1: רישום לצהרון (async)
// שלבים: אזור → שם ילד → כיתה → בדיקת מקום (Supabase) → טופס / רשימת המתנה
// ═══════════════════════════════════════════════════════════════════════════════
export async function handleRegistrationFlow(session: BotSession, userMessage: string): Promise<BotResponse> {
  const step = session.currentFlow

  // ─── שלב התחלה: זיהוי לפי טלפון ── אם יש רישום קיים, להציג אותו ──────────
  if (!step || step === 'register_start') {
    if (session.phone && session.phone !== 'simulator') {
      try {
        const { createServiceClient } = await import('@/lib/supabase/server')
        const supabase = createServiceClient()
        const normalized = session.phone.replace(/\D/g, '').replace(/^972/, '0')
        const intl       = '972' + normalized.replace(/^0/, '')

        const { data: parent } = await supabase
          .from('parents')
          .select('id, name, children(id, name, class_name, area_code, framework)')
          .or(`phone.eq.${normalized},phone.eq.${intl},phone.eq.${session.phone}`)
          .maybeSingle()

        const tzaharonKids = (parent?.children ?? []).filter((c: { framework?: string }) =>
          c.framework === 'צהרון' || c.framework === 'שניהם'
        )

        // placeholder = ילד שיובא מ-PayPlus/חשבונית ירוקה בלי שם אמיתי ("—", "*", "?")
        const isPlaceholderName = (n?: string) => {
          if (!n) return true
          const trimmed = n.trim()
          return trimmed.length < 3 || ['—','–','-','*','?'].includes(trimmed)
        }
        const placeholderKid = tzaharonKids.find((k: { name: string }) => isPlaceholderName(k.name))
        const realKids = tzaharonKids.filter((k: { name: string }) => !isPlaceholderName(k.name))

        // אם יש ילד placeholder ואין שום ילד אמיתי — נשלים את השם מההורה
        if (placeholderKid && realKids.length === 0) {
          session.collectedData.placeholder_child_id = placeholderKid.id
          const firstName = parent?.name?.split(' ')[0] ?? ''
          return {
            text:
              `היי${firstName ? ' ' + firstName : ''}! 💛\n\n` +
              `אני רואה שיש אצלנו תשלום פעיל בשמך, אבל חסר אצלנו שם הילד/ה שלכם 🤔\n\n` +
              `*מה שם הילד/ה? (שם פרטי + שם משפחה)*\n\n` +
              `_(זה יישמר אצלנו פעם אחת בלבד, מהפעם הבאה כבר נזהה אתכם)_`,
            nextFlow: 'register_complete_placeholder',
          }
        }

        if (realKids.length > 0) {
          const kidsText = realKids
            .map((k: { name: string; class_name?: string | null }) =>
              `• *${k.name}*${k.class_name ? ` (כיתה ${k.class_name})` : ''}`).join('\n')
          const firstName = parent?.name?.split(' ')[0] ?? ''
          return {
            text:
              `היי${firstName ? ' ' + firstName : ''}! 💛\n\nראיתי שיש לכם כבר רישום אצלנו:\n${kidsText}\n\n` +
              `*במה אפשר לעזור?*\n` +
              `*1* — לרשום ילד/ה נוסף/ת מהמשפחה\n` +
              `*2* — לעדכן פרטים של ילד קיים\n` +
              `*3* — לבדוק סטטוס תשלום\n` +
              `*4* — שאלה אחרת`,
            nextFlow: 'register_existing_parent',
          }
        }
      } catch (err) {
        console.error('[register_start] phone lookup error:', err)
      }
    }

    // הורה לא מזוהה / חדש → תהליך רישום רגיל
    return {
      text:
        `שמחים שאתם רוצים להצטרף למשפחת Kids & Fun! 🎉\n\n` +
        `*לאיזה אזור מבקשים רישום לצהרון?*\n\n` +
        `*1* — דרום השרון / חוף השרון\n` +
        `*2* — חוף הכרמל\n` +
        `*3* — גני ילדים תל אביב`,
      nextFlow: 'register_area',
    }
  }

  // ─── השלמת שם ילד placeholder (הורה זוהה אבל חסר שם בילד) ─────────────
  if (step === 'register_complete_placeholder') {
    const name = userMessage.trim().replace(/\s+/g, ' ')
    const words = name.split(' ').filter(w => w.length >= 2)
    if (words.length < 2 || /\d/.test(name) || name.length > 60) {
      return {
        text:
          `אנא כתבו *שם פרטי + שם משפחה* של הילד/ה 😊\n` +
          `_(לדוגמה: נועה כהן)_`,
        nextFlow: 'register_complete_placeholder',
      }
    }

    const childId = session.collectedData.placeholder_child_id
    if (childId) {
      try {
        const { createServiceClient } = await import('@/lib/supabase/server')
        const supabase = createServiceClient()
        await supabase.from('children').update({ name }).eq('id', childId)
      } catch (err) {
        console.error('[register_complete_placeholder] update error:', err)
      }
    }

    return {
      text:
        `מעולה, תודה! ✅ עדכנתי את *${name}* אצלנו.\n\n` +
        `*במה אפשר לעזור?*\n` +
        `*1* — לרשום ילד/ה נוסף/ת מהמשפחה\n` +
        `*2* — לעדכן פרטים של ${name}\n` +
        `*3* — לבדוק סטטוס תשלום\n` +
        `*4* — שאלה אחרת`,
      nextFlow: 'register_existing_parent',
    }
  }

  // ─── הורה מזוהה — בחירה מה לעשות ───────────────────────────────────────
  if (step === 'register_existing_parent') {
    const msg = userMessage.trim()

    // "הפרטים נשמרו?" — שאלת *סטטוס*, לא בקשה לעדכן פרטים (אפשרות 2).
    // בלי זה ההורה נשלח למסלול עדכון פרטים ופתחנו פנייה מיותרת (אתגור 17.9).
    if (msg.includes('?') && /נשמר|נקלט|הפרטים/.test(msg)) {
      const { buildRegistrationStatusAnswer } = await import('./staff-info')
      const answer = await buildRegistrationStatusAnswer(session.phone, msg)
      if (answer) return { text: answer, isComplete: true }
      return { text: '', useLLM: true }
    }

    // מיפוי טקסט חופשי לאפשרויות — "אמרתי, אני רוצה לרשום ילד לצהרון" = אפשרות 1
    if (msg === '1' || /לרשום|רישום|להירשם|עוד ילד|ילד נוסף|נוסף|נוספת|אחות|אח שלו|אח שלה/i.test(msg)) {
      return {
        text: `מעולה! 🌟\n\nלאיזה אזור מבקשים לרשום?\n\n*1* — דרום השרון / חוף השרון\n*2* — חוף הכרמל\n*3* — גני ילדים תל אביב`,
        nextFlow: 'register_area',
      }
    }
    if (msg === '2' || /עדכון|לעדכן|פרטים|לשנות/i.test(msg)) {
      return {
        text: `בסדר 😊\n\n*מה תרצו לעדכן?* (לדוגמה: "להעביר את שם הילד לגלי עתלית", "אלרגיה חדשה", "שינוי בית ספר")`,
        nextFlow: 'register_update_details',
      }
    }
    if (msg === '3' || /סטטוס|תשלום|שילמתי/i.test(msg)) {
      session.currentFlow = 'payment_status_menu'
      return handlePaymentStatusFlow(session.parentName)
    }
    if (msg === '4' || /שאלה|אחר/i.test(msg)) {
      return {
        text: `בסדר גמור 😊\n\nכתבו את שאלתכם ונציגה תחזור אליכם בהקדם 💛`,
        nextFlow: 'register_existing_question',
      }
    }
    // לא אחת מהאפשרויות → ל-LLM עם ההקשר (המסלול נשמר) במקום "לא הבנתי"
    return { text: '', useLLM: true }
  }

  // עדכון פרטים → משימה לנציגה
  if (step === 'register_update_details') {
    return {
      text: `קיבלתי 💛\n\nנציגה תטפל בעדכון ותחזור אליכם לאישור!`,
      isComplete: true,
      createTask: {
        type:        'שאלה כללית',
        description: `עדכון פרטי רישום — "${userMessage.slice(0, 150)}" | טלפון פונה: ${session.phone}`,
        priority:    'גבוה',
      },
    }
  }

  if (step === 'register_existing_question') {
    return {
      text: `תודה! נציגה תחזור אליכם בהקדם 💛`,
      isComplete: true,
      createTask: {
        type:        'שאלה כללית',
        description: `שאלה מהורה קיים: "${userMessage.slice(0, 200)}" | טלפון: ${session.phone}`,
        priority:    'רגיל',
      },
    }
  }

  // ─── שלב אזור ────────────────────────────────────────────────────────────
  // ⚠️ הורים לא עונים "2" — הם כותבים "אני מגבעתיים" או שם הגן ("גלי עתלית").
  // לפני התיקון כל תשובה כזו קיבלה "לא הבנתי" שוב ושוב (3 פעמים בלוגים 09/2026).
  if (step === 'register_area') {
    const { areaFromMessage, areaFromSchoolName, servedAreasText } = await import('./registration-helpers')
    const m = userMessage.trim()

    // 1. בחירה מספרית — בדיוק כמו קודם
    let area: string | null =
      m === '1' ? 'sharon' : m === '2' ? 'carmel' : m === '3' ? 'telaviv' : null
    // 2. שם גן / בית ספר (schools table + מפה קשיחה) — לפני ה-regex הרחב של אזור
    if (!area) area = await areaFromSchoolName(m)
    // 3. שם אזור / עיר
    if (!area) area = areaFromMessage(m)

    if (!area) {
      // שאלה/משפט שאינו אזור ("למה אתם לא בהוד השרון?") → ל-LLM מיד, המסלול נשמר.
      // רשימת האזורים כתשובה לשאלה נראתה כאילו הבוט לא הקשיב (אתגור 17.9).
      if (looksOffScript(m)) return { text: '', useLLM: true }

      const misses = parseInt(session.collectedData._area_miss ?? '0', 10) + 1
      session.collectedData._area_miss = String(misses)

      // אחרי ניסיון שני — ל-LLM עם ההקשר (המסלול נשמר ב-handler)
      if (misses >= 2) return { text: '', useLLM: true }

      return {
        text:
          `לא הצלחתי לזהות את האזור 🤔\n\n` +
          `אנחנו מפעילים צהרונים ב:\n${servedAreasText()}\n\n` +
          `אפשר לבחור מספר, או פשוט לכתוב את *שם הגן / בית הספר* של הילד/ה.\n` +
          `ואם האזור שלכם לא ברשימה — כתבו לי ואעביר את הפרטים לקורלי שתחזור אליכם 💛`,
        nextFlow: 'register_area',
      }
    }
    delete session.collectedData._area_miss
    session.collectedData.area_code = area
    return {
      text: `מצוין! 💛\n\n*מה שם הילד/ה?* (שם פרטי + שם משפחה)`,
      nextFlow: 'register_child_name',
    }
  }

  // ─── שלב שם ילד ──────────────────────────────────────────────────────────
  if (step === 'register_child_name') {
    const trimmed = userMessage.trim()

    // "רגע טעיתי באזור, זה השרון" — תיקון אזור, לא שם ילד/ה
    const areaFix = await tryAreaCorrection(session, trimmed)
    if (areaFix) return areaFix

    // שם + כיתה בהודעה אחת ("נועה כהן כיתה ב" / "דני לוי גן חובה") —
    // מפצלים ועוברים ישר לשלב הכיתה במקום להיתקע על "זה לא נראה כמו שם".
    const split = splitNameAndClass(trimmed)
    if (split) {
      session.collectedData.child_name = split.name
      session.currentFlow = 'register_class'
      return await handleRegistrationFlow(session, split.className)
    }

    if (looksOffScript(trimmed)) return { text: '', useLLM: true }
    const parts = trimmed.split(/\s+/)
    if (parts.length < 2) {
      return {
        text: `אנא כתבו *שם פרטי ושם משפחה* ביחד (לדוגמה: נועה כהן) 😊`,
        nextFlow: 'register_child_name',
      }
    }
    if (!looksLikeChildName(trimmed)) return buildNotAName('register_child_name')
    session.collectedData.child_name = trimmed

    // ⚡ זיהוי משני: אולי הילד הזה כבר רשום אצלנו — *רק* בין הילדים של ההורה
    // שמזוהה לפי הטלפון. ⚠️ אסור לחפש לפי שם בלבד: כל מי שמקליד שם של ילד קיים
    // היה מקבל כיתה, מסגרת ושם ההורה של משפחה אחרת (אתגור 17.9, S1).
    try {
      const { createServiceClient } = await import('@/lib/supabase/server')
      const { phoneVariants } = await import('@/lib/phone')
      const supabase = createServiceClient()
      let kids: Array<{ id: string; name: string; class_name: string | null; area_code: string | null; framework: string | null; parent_id: string }> = []
      if (session.phone && session.phone !== 'simulator') {
        const { data: parentRow } = await supabase
          .from('parents').select('id').in('phone', phoneVariants(session.phone)).limit(1).maybeSingle()
        if (parentRow?.id) {
          const { data } = await supabase
            .from('children')
            .select('id, name, class_name, area_code, framework, parent_id')
            .eq('parent_id', parentRow.id)
            .ilike('name', trimmed)
            .limit(2)
          kids = data ?? []
        }
      }

      if (kids?.length === 1) {
        const kid = kids[0]

        // נחשיב את הילד כ"רשום פעיל" אם יש רישום פורמלי, או אם framework=צהרון
        // (חלק גדול מהילדים יובאו מאקסל בלי רשומת registrations)
        const isTzaharon = kid.framework === 'צהרון' || kid.framework === 'שניהם'

        const { data: reg } = await supabase
          .from('registrations')
          .select('status')
          .eq('child_id', kid.id).eq('type', 'צהרון')
          .in('status', ['מאושר', 'ממתין לאישור'])
          .order('created_at', { ascending: false }).limit(1).maybeSingle()

        // שם ההורה — לאישור זיהוי חוזר ("הורה רשום: ...")
        const { data: parentRec } = await supabase
          .from('parents').select('name').eq('id', kid.parent_id).maybeSingle()

        if (reg || isTzaharon) {
          const areaLabels: Record<string, string> = {
            sharon: 'דרום השרון / חוף השרון', carmel: 'חוף הכרמל', telaviv: 'תל אביב',
          }
          const areaName = kid.area_code ? (areaLabels[kid.area_code] ?? kid.area_code) : ''
          const lines = [
            kid.class_name && `כיתה: *${kid.class_name}*`,
            areaName && `אזור: *${areaName}*`,
            parentRec?.name && `הורה רשום: *${parentRec.name}*`,
            reg && `סטטוס: *${reg.status}*`,
          ].filter(Boolean).join('\n')

          return {
            text:
              `מצאתי! 💛\n\n*${kid.name}* כבר רשום/ה אצלנו:\n${lines}\n\n` +
              `*במה אפשר לעזור?*\n` +
              `*1* — לרשום ילד/ה נוסף/ת מהמשפחה\n` +
              `*2* — לעדכן פרטים של ${kid.name}\n` +
              `*3* — לבדוק סטטוס תשלום\n` +
              `*4* — שאלה אחרת`,
            nextFlow: 'register_existing_parent',
          }
        }
      }
    } catch (err) {
      console.error('[register_child_name] lookup error:', err)
    }

    // ילד חדש — המשך לשלב הכיתה
    return {
      text: `שם יפה 😊\n\n*באיזו כיתה לומד/ת ${trimmed}?*\n_(לדוגמה: א׳, ב׳, גן חובה)_`,
      nextFlow: 'register_class',
    }
  }

  // ─── שלב כיתה + בדיקת קיבולת ─────────────────────────────────────────────
  if (step === 'register_class') {
    // תיקון אזור גם כאן ("רגע, בעצם זה חוף הכרמל")
    const areaFix = await tryAreaCorrection(session, userMessage)
    if (areaFix) return areaFix

    // בלי אזור אין למה לרשום — שואלים במקום ליפול ל-'sharon' (הורה מעתלית נרשם לשרון, 17.9)
    if (!session.collectedData.area_code) {
      return {
        text: `לפני שנמשיך — *לאיזה אזור מבקשים רישום לצהרון?*\n\n*1* — דרום השרון / חוף השרון\n*2* — חוף הכרמל\n*3* — גני ילדים תל אביב`,
        nextFlow: 'register_area',
      }
    }
    session.collectedData.class_name = userMessage
    const childName = session.collectedData.child_name || 'הילד/ה'
    const areaCode  = session.collectedData.area_code

    const { checkCapacity, buildRegisterLink, AREAS } = await import('./registration-helpers')
    const capacity = await checkCapacity(areaCode)
    const areaLabel = AREAS[areaCode]?.label ?? areaCode

    if (capacity.hasSpots) {
      const formUrl = buildRegisterLink({
        areaCode,
        childName,
        className: userMessage,
        phone:     session.phone,
      })
      return {
        text:
          `בדקתי — *יש מקום* עבור ${childName} ב${areaLabel}! 🎉\n\n` +
          `📋 *למילוי הטופס הרשמי:*\n${formUrl}\n\n` +
          `בסיום מילוי הטופס יופיע קישור להסדרת התשלום 💳\n` +
          `(אפשר גם לשלם אחרת — פשוט כתבו לנו אחרי הרישום)`,
        isComplete: true,
        createTask: {
          type:        'רישום',
          description: `בקשת רישום לצהרון — ${childName} כיתה ${userMessage} | אזור: ${areaLabel} | ממתין למילוי טופס`,
          priority:    'רגיל',
        },
      }
    } else {
      return {
        text:
          `כרגע *אין מקום פנוי* לצהרון ב${areaLabel} 😔\n\n` +
          `אבל לא הכל אבוד! אפשר להוסיף את *${childName}* לרשימת ההמתנה — ` +
          `אתם מספר *${capacity.waitingListPosition}* ברשימה 💛\n\n` +
          `ברגע שיתפנה מקום ניצור קשר.\n\n*להצטרף לרשימת ההמתנה?* (כן / לא)`,
        nextFlow: 'register_waiting_confirm',
      }
    }
  }

  // ─── שלב אישור רשימת המתנה ────────────────────────────────────────────────
  if (step === 'register_waiting_confirm') {
    const childName = session.collectedData.child_name || 'הילד/ה'
    const areaCode  = session.collectedData.area_code  || 'sharon'

    if (isYes(userMessage)) {
      // שמור ב-Supabase
      try {
        const { saveWaitingListEntry, AREAS } = await import('./registration-helpers')
        const result = await saveWaitingListEntry({
          phone:      session.phone,
          parentName: session.parentName || '',
          childName,
          className:  session.collectedData.class_name || '',
          areaCode,
        })
        const areaLabel = AREAS[areaCode]?.label ?? areaCode
        return {
          text:
            `✅ *נוסף לרשימת ההמתנה!*\n\n` +
            `*${childName}* ב${areaLabel} — מיקום *${result.position}* ברשימה 🌟\n\n` +
            `ברגע שיתפנה מקום נצור קשר. תודה! 💛`,
          isComplete: true,
          createTask: {
            type:        'רשימת המתנה',
            description: `רשימת המתנה — ${childName} כיתה ${session.collectedData.class_name} | אזור: ${areaLabel} | מיקום ${result.position}`,
            priority:    'רגיל',
          },
        }
      } catch {
        return {
          text:
            `✅ *נרשמת לרשימת ההמתנה!*\n\n` +
            `ברגע שיתפנה מקום ל*${childName}* ניצור קשר 🌟`,
          isComplete: true,
        }
      }
    } else {
      return {
        text: `בסדר גמור 😊 אם תשנו דעתכם — כתבו לנו בכל עת!`,
        isComplete: true,
      }
    }
  }

  return { text: '😊 כתבו *"רישום לצהרון"* להתחיל מחדש.' }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 2: ביטול לפי תקנון
// לפני 15: מאשרים אוטומטי + זיכוי מלא
// אחרי 15: מודיעים על התקנון באופן סופי, אם ההורה מבקש חריג → הסלמה
// ═══════════════════════════════════════════════════════════════════════════════
// ביצוע ביטול בפועל ב-CRM: איתור הרישום (לפי טלפון ההורה או שם הילד) ועדכון ל"בוטל".
// מחזיר את שם הילד כפי שרשום, או null אם לא אותר חד-משמעית (ואז נציגה משלימה ידנית).
async function performCancellation(
  session: BotSession,
  childNameInput: string,
  policyNote: string
): Promise<{ childName: string; payplusCancelled: boolean } | null> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const name = childNameInput.trim().replace(/\s+/g, ' ')

    // איתור מועמדים: קודם הילדים של ההורה המזוהה לפי טלפון, אחר כך לפי שם בלבד
    let candidates: { id: string; name: string; parent_id: string }[] = []

    // ⚠️ מבטלים *רק* ילד ששייך להורה המזוהה לפי הטלפון. ה-fallback הישן (חיפוש לפי
    // שם בכל הילדים) איפשר לכל מספר לבטל רישום + הוראת קבע של משפחה אחרת (אתגור 17.9, S1).
    if (session.phone && session.phone !== 'simulator') {
      const { phoneVariants } = await import('@/lib/phone')
      const { data: parent } = await supabase
        .from('parents').select('id')
        .in('phone', phoneVariants(session.phone)).limit(1).maybeSingle()
      if (parent) {
        const { data } = await supabase
          .from('children').select('id, name, parent_id')
          .eq('parent_id', parent.id).ilike('name', `%${name}%`)
        candidates = data ?? []
      }
    }

    // דורשים התאמה חד-משמעית — לא מבטלים בניחוש!
    if (candidates.length !== 1) return null
    const child = candidates[0]

    // הרישום הפעיל לצהרון
    const { data: reg } = await supabase
      .from('registrations')
      .select('id, status, notes')
      .eq('child_id', child.id).eq('type', 'צהרון')
      .in('status', ['מאושר', 'ממתין לאישור'])
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle()

    if (!reg) return null

    await supabase.from('registrations').update({
      status: 'בוטל',
      notes:  [reg.notes, `בוטל ע"י ההורה דרך הבוט — ${policyNote}`].filter(Boolean).join(' | '),
    }).eq('id', reg.id)

    // ─── ביטול הוראת קבע ב-PayPlus אוטומטית (אם יש לו אחת פעילה) ──────────
    let payplusCancelled = false
    const { data: parent } = await supabase.from('parents')
      .select('payplus_recurring_uid, payplus_recurring_status')
      .eq('id', child.parent_id).maybeSingle()

    if (parent?.payplus_recurring_uid && parent.payplus_recurring_status === 'active') {
      try {
        const { cancelRecurringPayment, isPayPlusApiConfigured } = await import('@/lib/payplus-api')
        if (isPayPlusApiConfigured()) {
          const r = await cancelRecurringPayment(parent.payplus_recurring_uid)
          if (r.success) {
            const isSandbox = process.env.PAYPLUS_SANDBOX === 'true'
            await supabase.from('parents').update({
              payplus_recurring_status:       isSandbox ? 'cancelled_test' : 'cancelled',
              payplus_recurring_cancelled_at: new Date().toISOString(),
            }).eq('id', child.parent_id)
            payplusCancelled = true
          }
        }
      } catch (err) {
        console.error('[performCancellation] PayPlus cancel error:', err)
      }
    }

    await supabase.from('registration_timeline').insert({
      parent_id:    child.parent_id,
      event_type:   'status_change',
      new_value:    'בוטל',
      description:
        `ביטול רישום צהרון דרך הבוט — ${child.name} (${policyNote})` +
        (payplusCancelled ? ' | ✅ הוראת קבע ב-PayPlus בוטלה אוטומטית' : ''),
      performed_by: 'בוט',
    })

    return { childName: child.name, payplusCancelled }
  } catch (err) {
    console.error('[performCancellation] Error:', err)
    return null
  }
}

// ─── שלב האישור: בניית השאלה מחדש (גם אחרי תיקון שם) ───────────────────────
function buildCancelConfirm(childName: string, dayOfMonth: number): BotResponse {
  if (dayOfMonth <= 15) {
    return {
      text: `📅 היום ה-${dayOfMonth} לחודש — אתם *בתוך חלון הביטול* ✅\n\n` +
        `*${childName}* יכול/ה להמשיך עד סוף החודש הנוכחי.\n` +
        `תקבלו זיכוי מלא לחודש הבא.\n\n` +
        `*לאשר את הביטול?* (כן / לא)`,
      nextFlow: 'cancel_confirm_before15',
    }
  }
  return {
    text: `📅 היום ה-${dayOfMonth} לחודש.\n\n` +
      `לפי תקנון הצהרון, ביטול לאחר ה-15 — *ממשיכים חודש נוסף* ` +
      `ומפסיקים מהחודש שלאחריו.\n\n` +
      `הביטול שיירשם הוא עבור *${childName}*.\n\n` +
      `*לאשר?* (כן / לא)\n\n` +
      `_אם יש נסיבות מיוחדות — כתבו ואנחנו נבדוק_`,
    nextFlow: 'cancel_confirm_after15',
  }
}

// ─── "לא, זה לא הילד הזה" בשלב האישור ────────────────────────────────────────
// ⚠️ זו שלילה על *הילד/ה*, לא על הביטול. לפני התיקון היא נקראה כ-"לא" (או נפלה
// ל-LLM) והשם השגוי נשאר — ו"כן" מאוחר יותר היה מבטל את הילד הלא נכון.
const WRONG_CHILD_RE = /לא[, ]+(זה )?לא הילד|לא זה|ילד אחר|ילדה אחרת|טעיתי בשם|לא הילד הזה|לא הילדה|שם אחר/

// תיקון שם בשלב האישור: 2-3 מילים שנראות כמו שם, ואינן אישור/שלילה.
// שמרני בכוונה — בספק *לא* מחליפים את מי שמבטלים.
const NOT_A_CORRECTION_RE = /כן|לא|מאשר|מסכימ|ממשיכ|בטוח|תודה|בסדר|אוקי|סבבה|בטל|ביטול|נכון|רוצה/
function correctedChildName(msg: string): string | null {
  const t = msg.trim()
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > 3) return null
  if (isYes(t) || isNo(t) || NOT_A_CORRECTION_RE.test(t)) return null
  return looksLikeChildName(t) ? t : null
}

export async function handleCancellationFlow(session: BotSession, userMessage: string): Promise<BotResponse> {
  const step = session.currentFlow
  const dayOfMonth = israelNow().getDate()  // כלל ה-15 לפי שעון ישראל

  // ── בשלבי האישור: קודם בודקים שמדובר בילד/ה הנכון/ה ──────────────────────
  if (step === 'cancel_confirm_before15' || step === 'cancel_confirm_after15') {
    if (WRONG_CHILD_RE.test(userMessage)) {
      delete session.collectedData.child_name
      session.currentFlow = 'cancel_child'
      return {
        text: `אוקיי — *מה שם הילד/ה הנכון?* (שם פרטי + שם משפחה)`,
        nextFlow: 'cancel_child',
      }
    }
    const fixed = correctedChildName(userMessage)
    if (fixed && fixed !== session.collectedData.child_name) {
      session.collectedData.child_name = fixed
      return buildCancelConfirm(fixed, dayOfMonth)
    }
  }

  if (!step || step === 'cancel_start') {
    return {
      text: `📋 *מדיניות ביטולים — Kids & Fun*\n\n` +
        `• ביטול *עד ה-15 לחודש* — המשך עד סוף החודש + זיכוי מלא\n` +
        `• ביטול *אחרי ה-15 לחודש* — ממשיכים חודש נוסף, ניתן להפסיק מהחודש שלאחריו\n\n` +
        `כדי להמשיך — *מה שם הילד/ה* שתרצו לבטל?`,
      nextFlow: 'cancel_child'
    }
  }

  if (step === 'cancel_child') {
    if (looksOffScript(userMessage)) return { text: '', useLLM: true }
    if (!looksLikeChildName(userMessage)) return buildNotAName('cancel_child')
    session.collectedData.child_name = userMessage

    if (dayOfMonth <= 15) {
      // לפני 15 — ביטול מאושר אוטומטית
      return {
        text: `📅 היום ה-${dayOfMonth} לחודש — אתם *בתוך חלון הביטול* ✅\n\n` +
          `*${userMessage}* יכול/ה להמשיך עד סוף החודש הנוכחי.\n` +
          `תקבלו זיכוי מלא לחודש הבא.\n\n` +
          `*לאשר את הביטול?* (כן / לא)`,
        nextFlow: 'cancel_confirm_before15'
      }
    } else {
      // אחרי 15 — מידע ברור על התקנון, ללא שאלה פתוחה
      return {
        text: `📅 היום ה-${dayOfMonth} לחודש.\n\n` +
          `לפי תקנון הצהרון, ביטול לאחר ה-15 — *ממשיכים חודש נוסף* ` +
          `ומפסיקים מהחודש שלאחריו.\n\n` +
          `*לאשר?* (כן / לא)\n\n` +
          `_אם יש נסיבות מיוחדות — כתבו ואנחנו נבדוק_`,
        nextFlow: 'cancel_confirm_after15'
      }
    }
  }

  // לפני 15 — אישור
  if (step === 'cancel_confirm_before15') {
    const childName = session.collectedData.child_name || 'הילד/ה'
    if (isBareYes(userMessage)) {
      // ביצוע הביטול בפועל ב-CRM
      const result = await performCancellation(
        session, childName, `לפני ה-15 (יום ${dayOfMonth}) — המשך עד סוף החודש + זיכוי מלא`
      )

      if (result) {
        const payplusLine = result.payplusCancelled
          ? `\n💳 *הוראת הקבע ב-PayPlus בוטלה אוטומטית* — לא יבוצעו חיובים נוספים.\n`
          : `\n`
        return {
          text: `✅ *הביטול בוצע!*\n\n` +
            `הרישום של *${result.childName}* עודכן במערכת — ` +
            `ממשיך/ה עד סוף החודש הנוכחי, והזיכוי יתקבל לחודש הבא.${payplusLine}\n` +
            `אישור סופי בכתב יישלח אליך תוך 1-2 ימי עסקים 💛`,
          isComplete: true,
          createTask: {
            type: 'ביטול',
            description: `✅ ביטול בוצע בבוט — ${result.childName} (יום ${dayOfMonth}, לפני ה-15, זיכוי מלא)` +
              (result.payplusCancelled ? ' | ✅ הוראת קבע בוטלה אוטומטית' : ' | ⚠️ לבטל ידנית הוראת קבע ב-PayPlus') +
              ' | לשלוח אישור סופי',
            priority: 'גבוה'
          }
        }
      }

      // לא אותר חד-משמעית — נציגה תשלים ידנית
      return {
        text: `✅ *בקשת הביטול נקלטה!*\n\n` +
          `*${childName}* ממשיך/ה עד סוף החודש הנוכחי, והזיכוי יתקבל לחודש הבא 💛\n\n` +
          `נציגה שלנו תשלים את הביטול במערכת ותשלח אישור סופי.`,
        isComplete: true,
        createTask: {
          type: 'ביטול',
          description: `ביטול אושר ע"י ההורה — ${childName} (יום ${dayOfMonth}, לפני ה-15, זיכוי מלא) | ⚠️ לא אותר אוטומטית ב-CRM — להשלים ידנית + להפסיק הוראת קבע`,
          priority: 'גבוה'
        }
      }
    }

    if (isBareNo(userMessage)) {
      return {
        text: `בסדר, הביטול *לא בוצע* 😊\nאם תרצו לחזור לנושא — כתבו לנו בכל עת!`,
        isComplete: true
      }
    }

    // לא כן ולא לא — שאלה/הבהרה. ל-LLM, והשלב נשמר (handler מחזיר nextFlow).
    return { text: '', useLLM: true }
  }

  // אחרי 15 — אישור תקנון או בקשת חריג
  if (step === 'cancel_confirm_after15') {
    const childName = session.collectedData.child_name || 'הילד/ה'

    // הורה מציין נסיבות מיוחדות → הסלמה לנציגה
    if (/מחלה|רפואי|מעבר|חריג|נסיבות|בעיה|קשה|אי אפשר|לא יכול/i.test(userMessage)) {
      return {
        text: `מבינים לגמרי 💛\n\n` +
          `מקרים כאלה מטופלים באופן אישי.\n\n` +
          `${isBusinessHours()
            ? 'נציגה שלנו תחזור אליך בהקדם לטיפול בבקשה.'
            : 'נחזור אליך בשעות הפעילות (ראשון-חמישי 8:00-17:00) 📬'}`,
        isComplete: true,
        createTask: {
          type: 'ביטול חריג',
          description: `ביטול חריג — ${childName} (יום ${dayOfMonth}, אחרי ה-15, טוען לנסיבות מיוחדות): "${userMessage.slice(0, 80)}"`,
          priority: 'גבוה'
        }
      }
    }

    if (isBareYes(userMessage)) {
      // ביצוע הביטול בפועל ב-CRM
      const result = await performCancellation(
        session, childName, `אחרי ה-15 (יום ${dayOfMonth}) — ממשיך חודש נוסף ומסיים בסוף החודש הבא`
      )

      if (result) {
        const payplusLine = result.payplusCancelled
          ? `\n💳 *הוראת הקבע ב-PayPlus בוטלה אוטומטית* — לא יבוצעו חיובים נוספים אחרי החודש הבא.\n`
          : `\n`
        return {
          text: `✅ *הביטול בוצע!*\n\n` +
            `הרישום של *${result.childName}* עודכן במערכת — ` +
            `ממשיך/ה חודש נוסף ומסיים/ת בסוף החודש הבא.${payplusLine}\n` +
            `אישור סופי בכתב יישלח אליך תוך 1-2 ימי עסקים 💛`,
          isComplete: true,
          createTask: {
            type: 'ביטול',
            description: `✅ ביטול בוצע בבוט — ${result.childName} (יום ${dayOfMonth}, אחרי ה-15, ממשיך חודש נוסף)` +
              (result.payplusCancelled ? ' | ✅ הוראת קבע בוטלה אוטומטית' : ' | ⚠️ לבטל ידנית הוראת קבע ב-PayPlus מהחודש הבא') +
              ' | לשלוח אישור סופי',
            priority: 'גבוה'
          }
        }
      }

      return {
        text: `✅ *בקשת הביטול נקלטה*\n\n` +
          `*${childName}* ממשיך/ה חודש נוסף ומסיים/ת בסוף החודש הבא.\n\n` +
          `נציגה שלנו תשלים את הביטול במערכת ותשלח אישור סופי 💛`,
        isComplete: true,
        createTask: {
          type: 'ביטול',
          description: `ביטול לפי תקנון — ${childName} (יום ${dayOfMonth}, אחרי ה-15, ממשיך חודש נוסף) | ⚠️ לא אותר אוטומטית ב-CRM — להשלים ידנית`,
          priority: 'גבוה'
        }
      }
    }

    if (isBareNo(userMessage)) {
      return {
        text: `בסדר, הביטול *לא בוצע* 😊\n` +
          `שמחים שאתם נשארים! אם תרצו לחזור לנושא — כתבו לנו.`,
        isComplete: true
      }
    }

    // לא כן ולא לא — שאלה/הבהרה. ל-LLM, והשלב נשמר (handler מחזיר nextFlow).
    return { text: '', useLLM: true }
  }

  return { text: '😊 כתבו *"ביטול"* להתחיל מחדש.' }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 3: קייטנה לפני סגירת רישום
// 3 תרחישים: רישום חדש | בדיקת רישום קיים | בעיה בהרשמה
// ═══════════════════════════════════════════════════════════════════════════════
export function handleCampRegistrationFlow(): BotResponse {
  // הרישום לקייטנה מתבצע באתר (חנות ווקומרס) — האתר עצמו קובע אילו קייטנות
  // פתוחות לרישום. הבוט תמיד מציג את התפריט ושולח את הקישור לחנות.
  return {
    text: `🏕️ *קייטנות Kids & Fun!*\n\n` +
      `*מה תרצו?*\n` +
      `*1* — לרשום ילד/ה לקייטנה\n` +
      `*2* — לבדוק אם כבר נרשמתי\n` +
      `*3* — יש לי בעיה בהרשמה`,
    nextFlow: 'camp_menu'
  }
}

// תת-מסלולים לקייטנה לפני סגירה
export async function handleCampMenuFlow(session: BotSession, userMessage: string): Promise<BotResponse> {
  const step = session.currentFlow

  if (step === 'camp_menu') {
    const msg = userMessage.trim()

    // תרחיש 1: רישום חדש → קישור לחנות הקייטנות באתר
    if (msg === '1' || /לרשום|רישום|רוצה להירשם|רשמו/i.test(msg)) {
      let campUrl = 'https://kidsandfun.co.il/shop/'
      try {
        const { createServiceClient } = await import('@/lib/supabase/server')
        const supabase = createServiceClient()
        const { data } = await supabase
          .from('bot_assets').select('url')
          .eq('key', 'camp_register').eq('is_active', true).maybeSingle()
        if (data?.url) campUrl = data.url
      } catch { /* fallback לקישור הקבוע */ }

      return {
        text: `מצוין! 🎉\n\n` +
          `הרישום לקייטנה מתבצע ישירות דרך האתר — בוחרים את הקייטנה לפי האזור, ` +
          `ממלאים את פרטי הילד/ה ומשלמים אונליין:\n\n` +
          `📲 ${campUrl}\n\n` +
          `תהליך הרישום לוקח 5-10 דקות בלבד.\n\n` +
          `יש בעיה בהרשמה? חזרו אלינו ונסייע 😊`,
        isComplete: true
      }
    }

    // תרחיש 2: בדיקת רישום קיים
    if (msg === '2' || /לבדוק|כבר נרשם|האם נרשמ|רשום|נרשמתי|לא יודע|לא זוכר/i.test(msg)) {
      return {
        text: `בשמחה! נבדוק יחד 🔍\n\n*מה שם הילד/ה?*`,
        nextFlow: 'camp_check_name'
      }
    }

    // תרחיש 3: בעיה בהרשמה
    if (msg === '3' || /בעיה|שגיאה|לא עובד|לא הצלחתי|נתקעתי|תקלה/i.test(msg)) {
      return {
        text: `אוי, כמה מבאס 😔\n\n*מה בדיוק קרה?* תפרטו ונעזור!`,
        nextFlow: 'camp_problem_desc'
      }
    }

    // לא אחת מהאפשרויות → ל-LLM עם ההקשר (המסלול נשמר) במקום "לא הבנתי"
    return { text: '', useLLM: true }
  }

  // תרחיש 2: בדיקת שם
  if (step === 'camp_check_name') {
    if (looksOffScript(userMessage)) return { text: '', useLLM: true }
    if (!looksLikeChildName(userMessage)) return buildNotAName('camp_check_name')
    session.collectedData.child_name = userMessage
    return {
      text: `*${userMessage}* — *מספר תעודת זהות של הילד/ה?*\n(3-4 ספרות אחרונות מספיקות)`,
      nextFlow: 'camp_check_id'
    }
  }

  // תרחיש 2: בדיקת ת"ז + בדיקה אמיתית מול ה-CRM
  // רישומי הקייטנה מגיעים מהאתר דרך ה-webhook כולל ת"ז — אפשר לענות מיידית.
  if (step === 'camp_check_id') {
    session.collectedData.child_id = userMessage
    const childName = (session.collectedData.child_name || '').trim()
    const idDigits  = userMessage.replace(/\D/g, '')

    if (childName && idDigits.length >= 3) {
      try {
        const { createServiceClient } = await import('@/lib/supabase/server')
        const supabase = createServiceClient()

        // חיפוש הילד לפי שם (מדויק, ואם אין — מכיל)
        let { data: kids } = await supabase
          .from('children').select('id, name, id_number, parent_id')
          .ilike('name', childName).limit(3)
        if (!kids?.length) {
          const res = await supabase
            .from('children').select('id, name, id_number, parent_id')
            .ilike('name', `%${childName}%`).limit(3)
          kids = res.data
        }
        // fallback: אולי נכתב שם ההורה — מחפשים את הילדים שלו (הת"ז עדיין חייבת להתאים)
        if (!kids?.length) {
          const { data: parentMatch } = await supabase
            .from('parents').select('id')
            .ilike('name', `%${childName}%`).limit(2)
          if (parentMatch?.length === 1) {
            const res = await supabase
              .from('children').select('id, name, id_number, parent_id')
              .eq('parent_id', parentMatch[0].id).limit(5)
            kids = res.data
          }
        }

        // אימות זהות: סיומת ת"ז חייבת להתאים (לא חושפים מידע בלי אימות!)
        const verified = (kids ?? []).filter((k: { id: string; name: string; id_number: string | null; parent_id: string }) => {
          const stored = String(k.id_number ?? '').replace(/\D/g, '')
          return stored && (stored.endsWith(idDigits) || idDigits.endsWith(stored))
        })

        if (verified.length === 1) {
          const child = verified[0]
          const { data: reg } = await supabase
            .from('registrations')
            .select('status, notes, created_at')
            .eq('child_id', child.id)
            .eq('type', 'קייטנה')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (reg) {
            // שם הקייטנה מתוך הערות הרישום (אם קיים)
            const campMatch = reg.notes?.match(/—\s*(.+?)\s*\(הזמנה/)
            const campName  = campMatch?.[1] ?? ''
            if (reg.status === 'מאושר') {
              return {
                text:
                  `✅ *${child.name} רשום/ה לקייטנה!*\n\n` +
                  `${campName ? `🏕️ ${campName}\n` : ''}` +
                  `הרישום והתשלום התקבלו במלואם.\n\n` +
                  `מחכים לראותכם! 💛`,
                isComplete: true,
              }
            }
            return {
              text:
                `🔶 מצאתי רישום של *${child.name}* לקייטנה` +
                `${campName ? ` (${campName})` : ''} — אבל הוא עדיין *ממתין להשלמה*.\n\n` +
                `ייתכן שהתשלום לא הושלם. נציגה שלנו תבדוק ותחזור אליך 💛`,
              isComplete: true,
              createTask: {
                type: 'בדיקת רישום קייטנה',
                description: `רישום קייטנה ממתין — ${child.name} | ההורה שאל על הסטטוס, לבדוק תשלום ולחזור`,
                priority: 'גבוה',
              },
            }
          }

          // ילד מזוהה אבל בלי רישום קייטנה
          return {
            text:
              `🔍 בדקתי — לא מצאתי רישום לקייטנה עבור *${child.name}*.\n\n` +
              `אפשר להירשם עכשיו דרך האתר:\n` +
              `📲 https://kidsandfun.co.il/shop/\n\n` +
              `ואם נרשמתם ממש לאחרונה — ייתכן שהרישום עוד בדרך, נציגה תוודא ותחזור 💛`,
            isComplete: true,
            createTask: {
              type: 'בדיקת רישום קייטנה',
              description: `הורה שאל על רישום קייטנה שלא נמצא — ${child.name} (ת"ז: ${idDigits}) | לוודא`,
              priority: 'רגיל',
            },
          }
        }

        // הגענו לכאן → השם לא אומת חד-משמעית (verified !== 1). מפרידים שני מצבים:
        if (!kids?.length) {
          // אין כלל ילד/ה בשם שנמסר → תשובה ודאית מהבוט: אין רישום (לא כשל זיהוי, לא נציגה אוטומטית)
          return {
            text:
              `🔎 לפי הרישומים שבידינו, לא נמצא רישום לקייטנה על השם *${childName}*.\n\n` +
              `אם נרשמתם לאחרונה או שנפלה טעות — כתבו "נציגה" ונבדוק עבורכם 💛`,
            isComplete: true,
          }
        }
        // נמצא שם תואם אך הת"ז לא התאימה → להגנת הפרטיות לא חושפים; מבקשים לאמת שוב
        return {
          text:
            `כדי להגן על הפרטים לא הצלחתי לאמת את הזהות (מספר ת"ז לא תואם).\n\n` +
            `בדקו את מספר תעודת הזהות ונסו שוב, או כתבו "נציגה" ונשמח לעזור 💛`,
          isComplete: true,
        }
      } catch (err) {
        console.error('[camp_check] lookup error:', err)
      }
    }

    // לא אותר / לא אומת חד-משמעית → נציגה תבדוק (כמו קודם)
    return {
      text: `🔍 בודקת...\n\n` +
        `לא הצלחתי לאמת את הפרטים באופן אוטומטי — ` +
        `נציגה שלנו תחזור אליך בהקדם עם הסטטוס של *${childName || 'הילד/ה'}* 💛\n\n` +
        `${!isBusinessHours() ? '_שעות פעילות: ראשון-חמישי 8:00-17:00_' : ''}`,
      isComplete: true,
      createTask: {
        type: 'בדיקת רישום קייטנה',
        description: `הורה מבקש לבדוק סטטוס רישום קייטנה — ${childName} (ת"ז: ${userMessage}) | לא אותר אוטומטית`,
        priority: 'גבוה'
      }
    }
  }

  // תרחיש 3: תיאור הבעיה
  if (step === 'camp_problem_desc') {
    const problem = userMessage
    return {
      text: `קיבלתי ✅\n\n` +
        `${isBusinessHours()
          ? 'נציגה שלנו תחזור אליך עם פתרון בהקדם!'
          : 'נחזור אליך בשעות הפעילות (ראשון-חמישי 8:00-17:00) לעזור!'}\n\n` +
        `בינתיים — ניתן לנסות שוב דרך הקישור:\n📲 https://kidsandfun.co.il/shop/`,
      isComplete: true,
      createTask: {
        type: 'בעיה בהרשמה לקייטנה',
        description: `הורה מדווח על בעיה ברישום לקייטנה: "${problem.slice(0, 100)}"`,
        priority: 'גבוה'
      }
    }
  }

  return { text: '😊 כתבו *"קייטנה"* להתחיל מחדש.' }
}

// ─── קייטנה אחרי סגירה ────────────────────────────────────────────────────────
export function handleLateCampFlow(session: BotSession, userMessage: string): BotResponse {
  const step = session.currentFlow

  if (step === 'camp_late_name') {
    if (!looksLikeChildName(userMessage)) return buildNotAName('camp_late_name')
    session.collectedData.child_name = userMessage
    return {
      text: `*${userMessage}* — *כיתה/גיל?*`,
      nextFlow: 'camp_late_class'
    }
  }

  if (step === 'camp_late_class') {
    session.collectedData.class_name = userMessage
    const childName = session.collectedData.child_name || 'הילד/ה'
    return {
      text: `תודה! קיבלתי ✅\n\n` +
        `אני בודקת אם יש מקום זמין עבור *${childName}* ו*חוזרת אליך תוך יום עסקים*.\n\n` +
        `${isBusinessHours() ? 'ניצור קשר בהמשך היום!' : 'ניצור קשר מחר בבוקר! 🌅'}`,
      isComplete: true,
      createTask: {
        type: 'רישום מאוחר',
        description: `בקשת רישום לקייטנה אחרי סגירת מועד — ${childName} כיתה ${userMessage}`,
        priority: 'גבוה'
      }
    }
  }

  return { text: '😊 כתבו *"קייטנה"* להתחיל מחדש.' }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 4: שאלות לוח זמנים וחגים
// TODO: לקרוא נתונים מ-Supabase calendar_events במקום hardcoded
// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 4: שעות / חגים / לו"ז — מקור יחיד הוא ה-FAQ (נערך מהדשבורד).
// אין יותר ערכים קשיחים כאן: כל תוכן השעות/חגים/חופשות חי ב-faqs, וכך
// הלקוחה מעדכנת אותו מלשונית "תוכן הבוט" בלי נגיעה בקוד.
// שאלה על חג/חופשה — לא על שעות רגילות ("הצהרון פתוח בסוכות?")
const HOLIDAY_QUESTION_RE =
  /ראש השנה|כיפור|סוכות|שמחת תורה|חנוכה|פורים|פסח|שבועות|ל["׳']?ג בעומר|יום העצמאות|חג|חגים|חופש|חופשה|חופשות|שבתון|ערב חג/

export function isHolidayQuestion(message: string): boolean {
  return HOLIDAY_QUESTION_RE.test((message || '').toLowerCase())
}

// עוגני ה-FAQ לפי תת-הנושא של השאלה (מיוצא לבדיקות)
export function scheduleFaqAnchors(message: string): string[] {
  if (isHolidayQuestion(message)) {
    return ['חג', 'חגים', 'חופש', 'חופשה', 'סוכות', 'ראש השנה', 'holidays_closed', 'vacations']
  }
  return ['שעות', 'שעות פעילות']
}

export async function handleScheduleFlow(message: string): Promise<BotResponse> {
  const { findFaqAnswer, findFaqByTopic } = await import('./faq-search')
  const anchors = scheduleFaqAnchors(message)

  // שאלת חג/חופשה → קודם ה-FAQ של החגים. חיפוש ה-fuzzy החזיר כאן את שעות
  // הפעילות הרגילות ("8:00-17:00") — תשובה שגויה לשאלה "פתוח בסוכות?" (אתגור 17.9).
  let answer = isHolidayQuestion(message) ? await findFaqByTopic(anchors) : null

  // ניסוח ההורה עצמו (FAQ fuzzy)
  if (!answer) answer = await findFaqAnswer(message)

  // נפילה — עוגן לפי תת-נושא, כדי שגם "שעות"/"חגים"/"4" יחזירו את ה-FAQ הנכון
  if (!answer) answer = await findFaqByTopic(anchors)

  if (answer) return { text: answer, isComplete: true }

  // אין עדיין FAQ מתאים — תשובה רכה ללא שעות קשיחות (כדי לא לסתור את ה-FAQ)
  return {
    text:
      `אשמח לעזור! 😊\n\n` +
      `לשעות הפעילות ולוח החגים המעודכן — נציגה שלנו תשלח לך את הפרטים המדויקים בהקדם 💛`,
    isComplete: true,
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 6: איסוף מוקדם
// שלבים: שם ילד → שעה → שם האוסף/ת → אישור
// ═══════════════════════════════════════════════════════════════════════════════
export function handleEarlyPickupFlow(session: BotSession, userMessage: string): BotResponse {
  const step = session.currentFlow

  if (!step || step === 'pickup_start') {
    return {
      text: `👋 *בקשת איסוף מוקדם*\n\n*מה שם הילד/ה* שתרצו לאסוף?`,
      nextFlow: 'pickup_child'
    }
  }

  if (step === 'pickup_child') {
    // משפט/שאלה ארוכה ("הוא צריך לצאת מוקדם כי יש לו רופא, מה עושים?") → LLM,
    // המסלול נשמר. קודם זה נפסל כ"לא שם" והורה קיבל את אותה הודעה שוב ושוב.
    if (looksOffScript(userMessage)) return { text: '', useLLM: true }
    if (!looksLikeChildName(userMessage)) return buildNotAName('pickup_child')
    session.collectedData.child_name = userMessage
    return {
      text: `*${userMessage}* — *באיזו שעה* תרצו לאסוף?`,
      nextFlow: 'pickup_time'
    }
  }

  if (step === 'pickup_time') {
    // ⚠️ חייבים שעה אמיתית: "אמא של נועם" נשמר כשעת איסוף ונשלח לצוות (אתגור 17.9)
    const time = parsePickupTime(userMessage)
    if (!time) {
      const misses = parseInt(session.collectedData._pickup_time_miss ?? '0', 10) + 1
      session.collectedData._pickup_time_miss = String(misses)
      if (misses >= 2) return { text: '', useLLM: true }
      return {
        text: `רק כדי לא לטעות — *באיזו שעה* לאסוף? 🕒\n_(לדוגמה: 15:00, "בשלוש", "3 וחצי")_`,
        nextFlow: 'pickup_time',
      }
    }
    delete session.collectedData._pickup_time_miss
    session.collectedData.pickup_time = time
    return {
      text: `שעה *${time}* ✅\n\n*מי יאסוף?*\n(שם + קרבה, למשל: "אבא דני" / "סבתא שרה")`,
      nextFlow: 'pickup_collector'
    }
  }

  if (step === 'pickup_collector') {
    session.collectedData.collector_name = userMessage
    const childName = session.collectedData.child_name || '?'
    const time = session.collectedData.pickup_time || '?'

    return {
      text: `✅ *בקשת האיסוף התקבלה!*\n\n` +
        `👧 ילד/ה: *${childName}*\n` +
        `⏰ שעה: *${time}*\n` +
        `🚗 אוסף/ת: *${userMessage}*\n\n` +
        `הצוות עודכן ויהיה מוכן 😊`,
      isComplete: true,
      createTask: {
        type: 'איסוף מוקדם',
        description: `איסוף מוקדם — ${childName} בשעה ${time} ע"י ${userMessage}`,
        priority: 'גבוה'
      },
      // הקשר מסגרת — לתשתית notifyStaff (החיפוש בפועל יתבצע ב-manychat webhook
      // לפי שם הילד או טלפון ההורה)
      notifyFramework: { byChildName: childName }
    }
  }

  return { text: '😊 כתבו *"איסוף מוקדם"* להתחיל מחדש.' }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 5: בדיקת סטטוס תשלום (כניסה ראשונה)
// מציג אפשרויות ומכניס למסלול הסדרת תשלום אם צריך
// ═══════════════════════════════════════════════════════════════════════════════
export function handlePaymentStatusFlow(parentName?: string): BotResponse {
  const firstName = parentName ? parentName.split(' ')[0] : ''
  return {
    text:
      `💰 *תשלומים — Kids & Fun*\n\n` +
      `${firstName ? `היי ${firstName}! ` : ''}על מה תרצו לשאול?\n\n` +
      `*1* — סטטוס התשלום שלי\n` +
      `*2* — לשנות שיטת תשלום\n` +
      `*3* — לא עבר תשלום / בעיה\n` +
      `*4* — מה העלות החודשית?\n` +
      `*5* — 💳 להסדיר תשלום חדש`,
    nextFlow: 'payment_status_menu',
  }
}

export async function handlePaymentStatusMenuFlow(
  session: BotSession,
  userMessage: string
): Promise<BotResponse> {
  const msg = userMessage.trim()

  // ⚠️ שלב זיהוי לפי שם ילד — חייב להיבדק לפני תפריט הבחירות,
  // אחרת שם כמו "רון אחרוני" ייתפס בטעות ע"י ה-regex של האפשרויות
  if (session.currentFlow === 'payment_status_child_name') {
    return handlePaymentStatusChildName(session, userMessage)
  }

  // בחירה 1 — סטטוס: שליפה אמיתית מה-CRM לפי טלפון הפונה
  if (msg === '1' || /סטטוס|בדוק|כמה חייב|מה שילמתי|שולם/i.test(msg)) {
    const statusText = await getPaymentStatusByPhone(session.phone)
    if (statusText) {
      return { text: statusText, isComplete: true }
    }

    // הטלפון לא מזוהה → מבקשים שם ילד לזיהוי
    return {
      text:
        `🔍 *בדיקת סטטוס תשלום*\n\n` +
        `לא מצאתי את המספר שלך במערכת — בוא/י נזהה אותך:\n\n` +
        `*מה שם הילד/ה? (שם פרטי + שם משפחה)*`,
      nextFlow: 'payment_status_child_name',
    }
  }

  // בחירה 2 — שינוי שיטת תשלום → מסלול אפשרויות תשלום
  if (msg === '2' || /שיטה|לשנות|אמצעי|אחרת|אחר/i.test(msg)) {
    session.collectedData.payment_setup_reason = 'method_change'
    return {
      text:
        `*שינוי שיטת תשלום* — נשמח לעזור! 💛\n\n` +
        `*באיזו שיטה הייתם רוצים להמשיך?*\n\n` +
        `*1* — 💳 כרטיס אשראי (PayPlus)\n` +
        `*2* — 🏦 הוראת קבע (PayPlus)\n` +
        `*3* — 💵 מזומן\n` +
        `*4* — 📝 צ׳קים\n` +
        `*5* — 🏛️ העברה בנקאית`,
      nextFlow: 'payment_setup_method',
    }
  }

  // בחירה 3 — בעיה / כשל → מסלול כשל תשלום הקיים
  if (msg === '3' || /בעיה|כשל|לא עבר|נכשל|נדחה/i.test(msg)) {
    session.currentFlow = 'payment_fail_start'
    return await handlePaymentFailureParentFlow(session, userMessage)
  }

  // בחירה 4 — עלות → תפריט עלויות מפורט
  if (msg === '4' || /עלות|מחיר|כמה עולה|כמה זה|עלה|עלות חודשית/i.test(msg)) {
    return {
      text:
        `💰 *שאלות עלות — Kids & Fun*\n\n` +
        `על מה תרצו לדעת?\n\n` +
        `*1* — 📅 עלות חודשית צהרון\n` +
        `*2* — ☀️ תשלום מראש לקייטנה\n` +
        `*3* — 👨‍👩‍👧‍👦 הנחת אחים / אחיות\n` +
        `*4* — 💬 שאלה אחרת על עלות`,
      nextFlow: 'cost_info_start',
    }
  }

  // בחירה 5 — הסדרת תשלום חדש → payment_setup_start (מיידי, ללא הודעה ריקה)
  if (msg === '5' || /חדש|להסדיר|הסדר|לשלם|תשלום חדש/i.test(msg)) {
    session.currentFlow = 'payment_setup_start'
    // קורא ישירות ל-handlePaymentSetupFlow דרך ה-handler — מחזיר תפריט מיידית
    return { text: '__redirect_payment_setup__', nextFlow: 'payment_setup_start' }
  }

  // לא אחת מהאפשרויות → ל-LLM עם ההקשר (המסלול נשמר) במקום "לא הבנתי"
  return { text: '', useLLM: true }
}

// שלב זיהוי לפי שם ילד לבדיקת סטטוס (כשהטלפון לא נמצא במערכת)
async function handlePaymentStatusChildName(
  session: BotSession,
  userMessage: string
): Promise<BotResponse> {
  const nameInput = userMessage.trim().replace(/\s+/g, ' ')

  // חרג מהמסלול (שאלה/הקשר ולא שם) → LLM יבין עם ההקשר, לא נחפש את המשפט כשם
  if (looksOffScript(nameInput)) return { text: '', useLLM: true }

  const words = nameInput.split(' ').filter(w => w.length >= 2)
  if (words.length < 2 || /\d/.test(nameInput)) {
    return {
      text:
        `צריך שם מלא לצורך זיהוי 😊\n\n` +
        `*אנא כתבו שם פרטי + שם משפחה של הילד/ה*\n` +
        `_(למשל: נועה כהן)_`,
      nextFlow: 'payment_status_child_name',
    }
  }

  // ⚠️ S1 — חשיפת מידע: שם ילד/ה *לבדו* אינו זיהוי. כל מספר שהקליד שם מוכר
  // קיבל סטטוס תשלום, סכום ושם ההורה של משפחה אחרת (אתגור 17.9).
  // מעכשיו: מזהים ילד/ה רק בתוך המשפחה של הטלפון הפונה.
  const ownChild = await findOwnChildByName(session.phone, nameInput)
  if (!ownChild) {
    return {
      text:
        `המספר הזה לא מופיע אצלנו במערכת 🤔\n\n` +
        `העברתי לקורלי, הנציגה שלנו, שתבדוק ותחזור אליך 💛`,
      isComplete: true,
      createTask: {
        type:        'שאלה כללית',
        description: `בדיקת סטטוס תשלום ממספר לא מזוהה (${session.phone}) — נמסר השם "${nameInput}". ` +
                     `⚠️ לא נחשף מידע. לבדוק מי הפונה ולחזור.`,
        priority:    'גבוה',
      },
    }
  }

  const statusText = await getPaymentStatusByChildName(ownChild.name)
  if (statusText) {
    return { text: statusText, isComplete: true }
  }

  // הילד/ה של ההורה אותר/ה אך אין נתוני תשלום → נציגה תבדוק
  return {
    text:
      `🔍 לא הצלחתי לאתר את פרטי התשלום של *${ownChild.name}*.\n\n` +
      `${isBusinessHours()
        ? 'נציגה שלנו תבדוק את החשבון ותחזור אליך מיד 😊'
        : 'נחזור אליך בשעות הפעילות (ראשון-חמישי 8:00-17:00) עם הפרטים 💛'}`,
    isComplete: true,
    createTask: {
      type:        'שאלה כללית',
      description: `בדיקת סטטוס תשלום — ילד/ה: ${ownChild.name} | טלפון פונה: ${session.phone} | לא אותר אוטומטית`,
      priority:    'רגיל',
    },
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול עלויות: תפריט שאלות על עלות (ללא העברה לנציגה)
// ═══════════════════════════════════════════════════════════════════════════════
export async function handleCostInfoFlow(
  session: BotSession,
  userMessage: string
): Promise<BotResponse> {
  const msg       = userMessage.trim()
  const areaLabel = session.collectedData.area_label ?? ''
  const amount    = session.collectedData.monthly_fee ?? String(getDefaultMonthlyFee())

  // ─── 1. עלות חודשית צהרון ──────────────────────────────────────────────────
  if (msg === '1' || /חודשי|צהרון|ירחי|חודש|עלות/i.test(msg)) {
    const areaInfo = areaLabel
      ? `באזור *${areaLabel}*`
      : 'בהתאם לאזור המגורים'

    return {
      text:
        `📅 *עלות חודשית צהרון — Kids & Fun*\n\n` +
        `העלות החודשית ${areaInfo} היא *${amount}₪* (כולל מע"מ).\n\n` +
        `*כולל:*\n` +
        `✅ ליווי מקצועי ראשון-חמישי\n` +
        `✅ ארוחת צהריים וחטיפים\n` +
        `✅ פעילויות חינוכיות\n\n` +
        `התשלום מתבצע בתחילת כל חודש.\n\n` +
        `רוצים להסדיר תשלום? כתבו *"תשלום"* 💳`,
      isComplete: true,
    }
  }

  // ─── 2. קייטנה — תשלום מראש ─────────────────────────────────────────────────
  if (msg === '2' || /קייטנה|קיץ|קיטנה|גיני|קמפ/i.test(msg)) {
    return {
      text:
        `☀️ *קייטנה קיץ — Kids & Fun*\n\n` +
        `הקייטנה משולמת *מראש במלואה* בעת הרישום.\n\n` +
        `*מחיר הקייטנה:* החל מ-*1,200₪* (תלוי בתוכנית ומשך).\n\n` +
        `*כולל:*\n` +
        `✅ פעילויות יומיות מגוונות\n` +
        `✅ טיולים שבועיים\n` +
        `✅ ארוחות כלולות\n\n` +
        `_פרטים מלאים ועלות מדויקת — צרו קשר לרישום_ 💛`,
      isComplete: true,
    }
  }

  // ─── 3. הנחת אחים ──────────────────────────────────────────────────────────
  if (msg === '3' || /אחים|אחיות|הנחה|שני ילדים|שניים|יותר מ/i.test(msg)) {
    return {
      text:
        `👨‍👩‍👧‍👦 *הנחת אחים — Kids & Fun*\n\n` +
        `מ-2 ילדים ומעלה מאותה משפחה:\n\n` +
        `✅ *ילד ראשון* — מחיר מלא\n` +
        `✅ *ילד שני ואילך* — *הנחה של 10%*\n\n` +
        `ההנחה מחושבת אוטומטית בעת הרישום.\n\n` +
        `_לרישום ילד נוסף — כתבו "רישום" ונתחיל_ 🎒`,
      isComplete: true,
    }
  }

  // ─── 4. שאלה אחרת — LLM (לא נציגה!) ────────────────────────────────────────
  if (msg === '4' || /אחר|אחרת|שאלה|אחרות/i.test(msg)) {
    return {
      text:
        `💬 *שאלות נוספות על עלות*\n\n` +
        `כתבו את שאלתכם בחופשיות — אנסה לענות! 😊\n\n` +
        `_לדוגמה: "יש הנחה לחד הורי?" / "מה אם ביטלנו באמצע חודש?"_`,
      nextFlow: 'cost_info_freetext',
    }
  }

  // ─── מצב free text — ענה עם LLM ──────────────────────────────────────────
  if (session.currentFlow === 'cost_info_freetext') {
    // ממשיך ל-LLM fallback ב-handler
    return {
      text: '',  // marker — handler יפעיל LLM
      escalate: false,
    }
  }

  // ─── לא הבין ────────────────────────────────────────────────────────────────
  return {
    text:
      `לא הבנתי 😊\n\n` +
      `*1* — 📅 עלות חודשית צהרון\n` +
      `*2* — ☀️ תשלום מראש לקייטנה\n` +
      `*3* — 👨‍👩‍👧‍👦 הנחת אחים / אחיות\n` +
      `*4* — 💬 שאלה אחרת`,
    nextFlow: 'cost_info_start',
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 7א + 7ב: כשל תשלום
//
// 7א — ההורה פונה מיוזמתו ("לא עבר לי תשלום")
// 7ב — המערכת שלחה הודעה יזומה וההורה מגיב
//
// ⚠️ אסור לאסוף פרטי כרטיס אשראי דרך WhatsApp!
//     הבוט רק מתאם שיחה עם נציגה או מתזמן תזכורת CRM.
// ═══════════════════════════════════════════════════════════════════════════════
export async function handlePaymentFailureParentFlow(session: BotSession, userMessage: string): Promise<BotResponse> {
  const step = session.currentFlow

  // ─── פתיחה — טון חם ולא מלחיץ ────────────────────────────────────────────
  if (!step || step === 'payment_fail_start') {
    const firstName = session.parentName ? session.parentName.split(' ')[0] : ''
    return {
      text: `היי${firstName ? ' ' + firstName : ''}! 😊\n\n` +
        `שם לב שהיתה בעיה בתשלום — אין מה לדאוג, מטפלים ביחד 💛\n\n` +
        `*מה המצב?*\n\n` +
        `*1* — החלפתי כרטיס, יש לי פרטים חדשים\n` +
        `*2* — רוצה לעבור לאמצעי תשלום אחר\n` +
        `*3* — רוצה לשנות את תאריך החיוב\n` +
        `*4* — עוד לא מסודר, תחזרו אלי בעוד כמה ימים\n` +
        `*5* — אחר`,
      nextFlow: 'payment_fail_type'
    }
  }

  // ─── סיווג הבחירה — שומר את הבחירה ועובר לזיהוי כפול ─────────────────────
  if (step === 'payment_fail_type') {
    const msg = userMessage.trim()
    let branch: 'card'|'method'|'date'|'remind'|'other'|null = null
    if (msg === '1' || /הוחלף|כרטיס חדש|פרטים חדשים|החלפתי|אשראי חדש/i.test(msg))           branch = 'card'
    else if (msg === '2' || /אמצעי|תשלום אחר|שיטה אחרת|שיטת תשלום|לשנות שיטה|לשנות אמצעי|לעבור|דרך אחרת|דרך תשלום|מזומן|שיק|צ.?ק|העברה|בנק|הוראת קבע/i.test(msg)) branch = 'method'
    else if (msg === '3' || /תאריך|מועד|לא מתאים|להזיז|לשנות תאריך/i.test(msg))               branch = 'date'
    else if (msg === '4' || /עוד|ימים|שבוע|אחר כך|אחרי|לא עכשיו|תחזרו|מאוחר יותר/i.test(msg)) branch = 'remind'
    else                                                                                       branch = 'other'

    session.collectedData.payment_fail_branch = branch

    // ענף 5 (אחר) — לא דורש זיהוי, מועבר לנציגה
    if (branch === 'other') {
      return {
        text: `מבינים 💛\n\n*ספר/י לי מה קורה* ואנחנו נמצא פתרון ביחד:`,
        nextFlow: 'payment_fail_describe'
      }
    }

    // כל שאר הענפים — דורשים זיהוי כפול (טלפון + שם ילד)
    await loadParentRegistrationContext(session.phone, session)
    const existingChild = session.collectedData.child_name
    if (existingChild) {
      // הטלפון זוהה אוטומטית + יש שם ילד מהמערכת → לאישור לפני המשך
      return {
        text: `קודם כל וידוא קצר — ההורה של *${existingChild}*?\n\n` +
              `*כן* — ממשיכים\n*לא* — נזהה אחרת`,
        nextFlow: 'payment_fail_confirm_child',
      }
    }
    // טלפון לא מזוהה → לבקש שם ילד
    return {
      text: `לפני שנמשיך, לזיהוי:\n\n*מה שם הילד/ה? (שם פרטי + שם משפחה)*`,
      nextFlow: 'payment_fail_child_name',
    }
  }

  // ─── אישור זהות הילד (כשהזיהוי לפי טלפון הצליח) ──────────────────────────
  if (step === 'payment_fail_confirm_child') {
    if (isYes(userMessage)) {
      return await routePaymentFailBranch(session)
    }
    if (isNo(userMessage)) {
      session.collectedData.child_name = ''
      return {
        text: `אין בעיה 😊\n\n*מה שם הילד/ה? (שם פרטי + שם משפחה)*`,
        nextFlow: 'payment_fail_child_name',
      }
    }
    return {
      text: `כתבי *כן* או *לא* בבקשה 😊`,
      nextFlow: 'payment_fail_confirm_child',
    }
  }

  // ─── זיהוי לפי שם ילד (כשהטלפון לא מזוהה) ────────────────────────────────
  if (step === 'payment_fail_child_name') {
    const name = userMessage.trim().replace(/\s+/g, ' ')
    if (looksOffScript(name)) return { text: '', useLLM: true }
    if (name.split(' ').filter(w => w.length >= 2).length < 2 || /\d/.test(name)) {
      return {
        text: `אנא כתבו *שם פרטי + שם משפחה* (לדוגמה: נועה כהן) 😊`,
        nextFlow: 'payment_fail_child_name',
      }
    }
    session.collectedData.child_name = name
    return await routePaymentFailBranch(session)
  }

  // ─── ענף 1 (כרטיס): שליחת קישור PayPlus דינמי + ביטול אוטומטי של הישן ───
  if (step === 'payment_fail_card_link_sent') {
    // הוראות לאחר השליחה — כשההורה כותב שוב משהו
    return {
      text: `כשתסיימי את התשלום בקישור — הוראת הקבע הישנה תבוטל אוטומטית 💛\n\n` +
            `יש שאלה נוספת? כתבי *תשלום* / *ביטול* / *שעות* / *איסוף מוקדם*.`,
      isComplete: true,
    }
  }

  // ─── ענף 2: בחירת אמצעי תשלום אחר ────────────────────────────────────────
  if (step === 'payment_fail_method_choice') {
    return await handlePaymentFailMethodChoice(session, userMessage)
  }

  // ─── ענף 3: שינוי תאריך חיוב — דרך ה-API ─────────────────────────────────
  if (step === 'payment_fail_new_date') {
    return await handlePaymentFailNewDate(session, userMessage)
  }

  // ─── ענף 4: תזכורת אוטומטית — מתי לחזור ─────────────────────────────────
  if (step === 'payment_fail_remind_when') {
    return await handlePaymentFailRemindWhen(session, userMessage)
  }

  // ─── תיאור חופשי (ענף "אחר") — נציגה ─────────────────────────────────────
  if (step === 'payment_fail_describe') {
    return {
      text: `תודה שפירטת 💛\n\n` +
        `${isBusinessHours()
          ? 'נציגה שלנו תחזור אליך בהקדם לטפל בבקשה.'
          : 'נחזור אליך בשעות הפעילות (ראשון-חמישי 8:00-17:00) 📬'}`,
      isComplete: true,
      createTask: {
        type: 'כשל תשלום',
        description: `בעיית תשלום לא מוגדרת — "${userMessage.slice(0, 120)}"`,
        priority: 'דחוף'
      }
    }
  }

  return { text: '😊 כתבו *"בעיה בתשלום"* להתחיל מחדש.' }
}

// ─── מנתב את ההורה לזרימה הנכונה אחרי שזיהוי הילד הושלם ─────────────────────
async function routePaymentFailBranch(session: BotSession): Promise<BotResponse> {
  const branch    = session.collectedData.payment_fail_branch
  const childName = session.collectedData.child_name || 'הילד/ה'

  if (branch === 'card') {
    // ענף 1: עדכון כרטיס על הוראת הקבע ה*קיימת* (CreditCardRenewal) —
    // ⚠️ לא יוצרים הוראת קבע חדשה (זה היה גורם לכפילות של 10 תשלומים).
    // זיהוי לפי טלפון הפונה *או* שם הילד (הבוט כבר שאל שם) — לא טלפון בלבד.
    const { findRecurringForRenewal } = await import('@/lib/bot/payment-helpers')
    const found = await findRecurringForRenewal(session.phone, session.collectedData.child_name)
    const recurringUid = found?.uid

    if (recurringUid) {
      const { renewRecurringCard } = await import('@/lib/payplus-api')
      const r = await renewRecurringCard(recurringUid)
      if (r.success) {
        // אם חזר לינק — שולחים בוואטסאפ (העדפה); אחרת PayPlus שלח ללקוח מייל חידוש
        if (r.data?.paymentUrl) {
          return {
            text:
              `מצוין! 💳 הכנתי קישור מאובטח לעדכון הכרטיס *בהוראת הקבע הקיימת*:\n\n` +
              `🔗 ${r.data.paymentUrl}\n\n` +
              `אחרי שתעדכני — החיוב החודשי ימשיך כרגיל, בלי לפתוח הוראה חדשה 💛`,
            nextFlow: 'payment_fail_card_link_sent',
            createTask: {
              type: 'כשל תשלום',
              description: `חידוש כרטיס בהו"ק קיימת — ${childName} | קישור נשלח (וואטסאפ)`,
              priority: 'רגיל',
            },
          }
        }
        return {
          text:
            `מצוין! 📧 שלחנו לך *למייל* קישור מאובטח לעדכון הכרטיס בהוראת הקבע הקיימת.\n\n` +
            `בדקי את תיבת המייל (כולל ספאם) — אחרי העדכון החיוב החודשי ימשיך כרגיל, בלי לפתוח הוראה חדשה 💛`,
          isComplete: true,
          createTask: {
            type: 'כשל תשלום',
            description: `חידוש כרטיס — ${childName} | מייל חידוש נשלח ללקוח (Vault)`,
            priority: 'רגיל',
          },
        }
      }
      // קריאת ה-API נכשלה ממש (נדיר) → נציגה
      return {
        text: `אני מעבירה את הבקשה לנציגה שתעדכן את הכרטיס ותחזור אליך בהקדם 💛`,
        isComplete: true,
        createTask: {
          type: 'כשל תשלום',
          description: `עדכון כרטיס — ${childName} | renewal API נכשל: ${r.error}`,
          priority: 'דחוף',
        },
      }
    }

    // אין מזהה הוראת קבע במערכת (הוקמה דרך הדשבורד / ייבוא) → לא יוצרים חדשה!
    return {
      text:
        `הבנתי 💛 כדי לעדכן את הכרטיס בהוראת הקבע שלך — נציגה תיצור איתך קשר בהקדם ` +
        `ותסדר את זה איתך אישית.`,
      isComplete: true,
      createTask: {
        type: 'כשל תשלום',
        description: `עדכון כרטיס — ${childName} | אין payplus_recurring_uid במערכת — נציגה תעדכן ידנית ב-PayPlus`,
        priority: 'דחוף',
      },
    }
  }

  if (branch === 'method') {
    return {
      text: `*באיזה אמצעי תשלום תרצי להמשיך?*\n\n` +
            `*1* — 🏦 הוראת קבע (אשראי) — מומלץ\n` +
            `*2* — 💳 כרטיס אשראי חודשי\n` +
            `*3* — 💵 מזומן\n` +
            `*4* — 📝 צ׳קים\n` +
            `*5* — 🏛️ העברה בנקאית`,
      nextFlow: 'payment_fail_method_choice',
    }
  }

  if (branch === 'date') {
    return {
      text: `בטח! *באיזה יום בחודש* יתאים לך החיוב? (1-28)\n` +
            `_(לדוגמה: 1, 5, 10, 15...)_`,
      nextFlow: 'payment_fail_new_date',
    }
  }

  if (branch === 'remind') {
    return {
      text: `בסדר גמור 😊\n\n*מתי לחזור אליך?*\n` +
            `(לדוגמה: "עוד 3 ימים", "ב-25 לחודש", "בעוד שבוע")`,
      nextFlow: 'payment_fail_remind_when',
    }
  }

  return { text: '😊 כתבו *"בעיה בתשלום"* להתחיל מחדש.' }
}

// ─── ענף 2: אמצעי אחר ────────────────────────────────────────────────────────
async function handlePaymentFailMethodChoice(session: BotSession, msg: string): Promise<BotResponse> {
  const childName = session.collectedData.child_name || 'הילד/ה'
  const m = msg.trim()
  // אשראי/קבע → קישור PayPlus
  if (m === '1' || m === '2' || /הוראת קבע|קבע|אשראי|כרטיס/i.test(m)) {
    session.collectedData.payment_fail_branch = 'card'   // משתמשים באותה לוגיקה
    return await routePaymentFailBranch(session)
  }
  // אמצעים ידניים — הוראות אוטומטיות + תיעוד
  if (m === '3' || /מזומן/.test(m)) {
    return {
      text: `💵 *תשלום במזומן*\n\n` +
            `העבירי לרכזת המסגרת בתחילת כל חודש את הסכום החודשי.\n\n` +
            `נעדכן את המערכת שעברתם למזומן — הוראת הקבע הקיימת תבוטל.`,
      isComplete: true,
      createTask: {
        type: 'כשל תשלום',
        description: `${childName} — מעבר למזומן. לבטל הוראת קבע ב-PayPlus`,
        priority: 'גבוה',
      },
    }
  }
  if (m === '4' || /צ.?ק|שיק/.test(m)) {
    return {
      text: `📝 *תשלום בצ׳קים*\n\n` +
            `הכיני צ׳קים על שם *"קידס אנד פאן הפקות בע״מ"* — צ׳ק לכל חודש שנותר.\n` +
            `העבירי לרכזת המסגרת.\n\n` +
            `נעדכן את המערכת — הוראת הקבע הקיימת תבוטל.`,
      isComplete: true,
      createTask: {
        type: 'כשל תשלום',
        description: `${childName} — מעבר לצ׳קים. לבטל הוראת קבע ב-PayPlus`,
        priority: 'גבוה',
      },
    }
  }
  if (m === '5' || /העברה|בנק/.test(m)) {
    return {
      text:
        `🏛️ *העברה בנקאית*\n\n` +
        formatBankTransferMessage() + `\n\n` +
        `אחרי כל העברה — שלחי אישור בצ׳אט ונתעד 💛`,
      isComplete: true,
      createTask: {
        type: 'כשל תשלום',
        description: `${childName} — מעבר להעברה בנקאית. לבטל הוראת קבע ב-PayPlus`,
        priority: 'גבוה',
      },
    }
  }
  return {
    text: `לא הבנתי 😊 בחרי 1-5`,
    nextFlow: 'payment_fail_method_choice',
  }
}

// ─── ענף 3: שינוי תאריך חיוב — דרך ה-API ─────────────────────────────────────
async function handlePaymentFailNewDate(session: BotSession, msg: string): Promise<BotResponse> {
  const childName = session.collectedData.child_name || 'הילד/ה'
  const dayMatch  = msg.match(/\d+/)
  const day       = dayMatch ? parseInt(dayMatch[0], 10) : NaN
  if (isNaN(day) || day < 1 || day > 28) {
    return {
      text: `התאריך לא תקין. *בחרי יום בחודש בין 1 ל-28* 😊\n_(אחרי ה-28 לא בטוח שיהיה תאריך כזה כל חודש)_`,
      nextFlow: 'payment_fail_new_date',
    }
  }

  // מאתרים את ה-recurring_uid של ההורה
  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const normalized = session.phone.replace(/\D/g, '').replace(/^972/, '0')
    const { data: parent } = await supabase
      .from('parents').select('id, payplus_recurring_uid, payplus_recurring_status')
      .eq('phone', normalized).maybeSingle()

    if (parent?.payplus_recurring_uid && parent.payplus_recurring_status === 'active') {
      const { updateRecurringBillingDate, isPayPlusApiConfigured } = await import('@/lib/payplus-api')
      if (isPayPlusApiConfigured()) {
        const result = await updateRecurringBillingDate(parent.payplus_recurring_uid, day)
        if (result.success) {
          await supabase.from('registration_timeline').insert({
            parent_id:    parent.id,
            event_type:   'payment',
            new_value:    `תאריך חיוב עודכן ל-${day}`,
            description:  `${childName} — תאריך חיוב חודשי שונה ל-${day} (דרך הבוט)`,
            performed_by: 'בוט',
          })
          return {
            text: `✅ *בוצע!* תאריך החיוב החודשי של *${childName}* עודכן ל-${day} לכל חודש.\n\nיש שאלה נוספת? כתבי לנו 💛`,
            isComplete: true,
            createTask: {
              type: 'כשל תשלום',
              description: `שינוי תאריך חיוב — ${childName} | עודכן ל-${day} לחודש דרך הבוט (בוצע ב-PayPlus)`,
              priority: 'רגיל',
            },
          }
        }
      }
    }
  } catch (err) {
    console.error('[payment_fail_new_date] error:', err)
  }

  // לא הצלחנו אוטומטית → נציגה
  return {
    text: `✅ *רשמנו — תאריך ${day}*\n\nנציגה תוודא את העדכון ותחזור אליך באישור 💛`,
    isComplete: true,
    createTask: {
      type: 'כשל תשלום',
      description: `שינוי תאריך חיוב — ${childName} | יום מבוקש: ${day} | לא בוצע אוטומטית (אין recurring_uid או API נכשל)`,
      priority: 'גבוה',
    },
  }
}

// ─── ענף 4: תזכורת אוטומטית ─────────────────────────────────────────────────
async function handlePaymentFailRemindWhen(session: BotSession, msg: string): Promise<BotResponse> {
  const childName = session.collectedData.child_name || 'הילד/ה'
  // חישוב תאריך מטקסט חופשי
  const scheduled = parseRemindWhen(msg)
  if (!scheduled) {
    return {
      text: `לא הצלחתי להבין את התאריך 😊\n\n*כתבי שוב — למשל "עוד 3 ימים", "ב-25 לחודש", "בעוד שבוע"*`,
      nextFlow: 'payment_fail_remind_when',
    }
  }
  // שומר תזכורת ב-DB
  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const normalized = session.phone.replace(/\D/g, '').replace(/^972/, '0')
    const { data: parent } = await supabase.from('parents').select('id').eq('phone', normalized).maybeSingle()
    if (parent) {
      await supabase.from('followup_reminders').insert({
        parent_id:    parent.id,
        child_name:   childName,
        reason:       'כשל תשלום',
        context:      `הורה ביקש לחזור: "${msg.slice(0, 100)}"`,
        scheduled_for: scheduled.toISOString(),
      })
    }
  } catch (err) {
    console.error('[payment_fail_remind_when] error:', err)
  }
  const dateLabel = scheduled.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
  return {
    text: `👍 *סבבה!*\n\nנחזור אליך ב-*${dateLabel}* בנוגע ל-${childName}.\n\nאם תרצי לסדר לפני כן — כתבי *"תשלום"* 💛`,
    isComplete: true,
    // יוצר גם פנייה גלויה בדשבורד (followup_reminders לבדו לא מופיע בלשונית "פניות")
    createTask: {
      type: 'כשל תשלום',
      description: `תזכורת כשל תשלום — ${childName} | לחזור ב-${dateLabel} | "${msg.slice(0, 80)}"`,
      priority: 'רגיל',
    },
  }
}

// פרסור טקסט חופשי לתאריך תזכורת
function parseRemindWhen(text: string): Date | null {
  const now = new Date()
  const t = text.trim()
  // "ב-25 לחודש" / "ה-25"
  const dayMatch = t.match(/(\d{1,2})\s*(?:לחודש|בחודש)?/)
  const inDaysMatch  = t.match(/עוד\s*(\d+)\s*ימים?/) || t.match(/(\d+)\s*ימים?\s*קדימה?/)
  const inWeeksMatch = t.match(/עוד\s*(\d+)\s*שבועות?/) || (/בעוד שבוע|שבוע הבא/.test(t) ? [null, '1'] : null)

  if (inDaysMatch) {
    const d = new Date(now)
    d.setDate(d.getDate() + parseInt(inDaysMatch[1], 10))
    return d
  }
  if (inWeeksMatch) {
    const d = new Date(now)
    d.setDate(d.getDate() + parseInt(String(inWeeksMatch[1]), 10) * 7)
    return d
  }
  if (dayMatch) {
    const day = parseInt(dayMatch[1], 10)
    if (day >= 1 && day <= 31) {
      const d = new Date(now)
      d.setDate(day)
      if (d <= now) d.setMonth(d.getMonth() + 1)
      return d
    }
  }
  return null
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול חדש: הסדרת תשלום — אפשרויות תשלום חלופיות
//
// נכנסים מ-3 נקודות:
//   א) הורה שואל על שיטות תשלום (כוונה: אפשרויות_תשלום)
//   ב) הורה קיבל הצעת מקום מרשימת המתנה ואישר
//   ג) שינוי שיטת תשלום ממסלול 5
//
// שלבים:
//   payment_setup_start   → תפריט שיטות תשלום
//   payment_setup_method  → עיבוד בחירה
//   payment_setup_checks  → כמה צ׳קים? (רק אם בחרו צ׳קים)
//
// 💳 אשראי / הוראת קבע: קריאה ל-PayPlus → שליחת קישור
// 💵 מזומן / 📝 צ׳קים / 🏛️ העברה: יצירת task לנציגה + הוראות
// 🔗 חשבונית ירוקה: קישור מ-bot_assets → שליחה
// ═══════════════════════════════════════════════════════════════════════════════
// ─── עוזרי תמחור לזרימת הסדרת תשלום (מחיר לפי גן/בי"ס, לא לפי אזור) ──────────
// אחרי שההורה בחר אזור — שואלים *איזה גן/בי"ס* (כי המחיר נקבע לפי המסגרת),
// ואז מתמחרים לפי המודל של קורלי. לעולם לא נופלים ל-799.
async function resolvePaymentSchool(session: BotSession): Promise<BotResponse> {
  // אם כבר ידוע בית-הספר (מרישום קיים) — ישר לתמחור
  if (session.collectedData.child_school) return await paymentResolveFeeAndContinue(session)
  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const sb = createServiceClient()
    const { data: schools } = await sb
      .from('schools').select('name')
      .eq('area_code', session.collectedData.area_code ?? '')
      .eq('is_active', true).order('sort_order')
    const names: string[] = (schools ?? []).map((s: { name: string }) => s.name)

    if (names.length === 0) return paymentToStaff(session, 'לא נמצאו מסגרות לאזור')
    if (names.length === 1) {
      session.collectedData.child_school = names[0]
      return await paymentResolveFeeAndContinue(session)
    }
    session.collectedData.payment_setup_school_list = names.join('||')
    return {
      text: `מצוין! ובאיזה גן / בית ספר?\n\n` + names.map((s, i) => `*${i + 1}* — ${s}`).join('\n'),
      nextFlow: 'payment_setup_school',
    }
  } catch {
    return paymentToStaff(session, 'שגיאה בשליפת מסגרות')
  }
}

async function paymentResolveFeeAndContinue(session: BotSession): Promise<BotResponse> {
  const school    = session.collectedData.child_school ?? ''
  const className = session.collectedData.child_class ?? null
  const fee = resolveMonthlyFee({ area_code: session.collectedData.area_code, school, class_name: className })
  if (fee != null) {
    session.collectedData.monthly_fee = String(fee)
    return await finalizePaymentLink(session)
  }
  // מתן מתמחר לפי כיתה — אם חסרה, נשאל
  if (school.includes('מתן') && !className) {
    return {
      text: `ובאיזו כיתה ${session.collectedData.child_name ?? 'הילד/ה'}? (למשל: א / ב / ג)`,
      nextFlow: 'payment_setup_class',
    }
  }
  return paymentToStaff(session, `מחיר לא מוגדר למסגרת "${school}"`)
}

function paymentToStaff(session: BotSession, reason: string): BotResponse {
  const childName = session.collectedData.child_name ?? 'הילד/ה'
  return {
    text: `אשמח לעזור! 💛 נציגה שלנו תשלח לכם את קישור התשלום המדויק בהקדם.`,
    isComplete: true,
    createTask: {
      type:        'כשל תשלום',
      description: `הסדרת תשלום — ${childName} | ${reason} | טלפון: ${session.phone} | נציגה תשלח קישור ידני`,
      priority:    'גבוה',
    },
  }
}

async function finalizePaymentLink(session: BotSession): Promise<BotResponse> {
  const childName   = session.collectedData.child_name ?? 'הילד/ה'
  const regId       = session.collectedData.registration_id ?? `bot-${Date.now()}`
  const amount      = parseInt(session.collectedData.monthly_fee ?? '0', 10)
  const areaLabel   = session.collectedData.area_label ?? ''
  const areaCode    = session.collectedData.area_code ?? ''
  const school      = session.collectedData.child_school ?? areaLabel
  const firstName   = session.parentName?.split(' ')[0] ?? ''
  const isStanding  = session.collectedData.payment_method === 'standing_order'
  const description = isStanding
    ? `הוראת קבע — צהרון Kids & Fun | ${childName}`
    : `תשלום חודשי — צהרון Kids & Fun | ${childName}`

  if (!amount || amount <= 0) return paymentToStaff(session, 'סכום לא נקבע')

  // מניעת הוראת קבע כפולה (החלטה 2)
  if (isStanding) {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const sb = createServiceClient()
    const { data: existing } = await sb
      .from('parents').select('payplus_recurring_uid, payplus_recurring_status')
      .or(`phone.eq.${session.phone},phone.eq.972${session.phone.replace(/^0/, '')}`)
      .maybeSingle()
    if (existing?.payplus_recurring_uid && existing.payplus_recurring_status === 'active') {
      return {
        text:
          `יש לכם כבר הוראת קבע פעילה 💛\n\n` +
          `אם צריך *לעדכן כרטיס* — כתבו "כשל תשלום". לכל שינוי אחר — נציגה תיצור קשר.`,
        isComplete: true,
        createTask: { type: 'כשל תשלום', description: `ביקש/ה הסדרת תשלום אך כבר קיימת הו"ק פעילה — ${childName}.`, priority: 'רגיל' },
      }
    }
  }

  const result = await createPayPlusPaymentLink({
    registrationId: regId, parentName: session.parentName ?? firstName, phone: session.phone,
    childName, areaCode, areaLabel, amount, description,
    paymentType: isStanding ? 'standing_order' : 'credit',
  })
  if (result.success && result.paymentUrl) {
    return {
      text:
        `מעולה! ${isStanding ? '🏦 *הוראת קבע*' : '💳 *אשראי*'} עבור *${childName}* (${school}) — *${amount}₪/חודש*:\n\n` +
        `🔗 ${result.paymentUrl}\n\n` +
        `לאחר השלמת התשלום — יישלח אישור. יש שאלה? כתבו לנו 💛`,
      isComplete: true,
      createTask: { type: 'כשל תשלום', description: `קישור ${isStanding ? 'הו"ק' : 'אשראי'} נשלח — ${childName} | ${school} | ${amount}₪ | טלפון ${session.phone}`, priority: 'רגיל' },
    }
  }
  console.error('[PayPlus] Failed to create payment link:', result.error)
  return paymentToStaff(session, `PayPlus error: ${result.error}`)
}

export async function handlePaymentSetupFlow(
  session: BotSession,
  userMessage: string
): Promise<BotResponse> {
  const step = session.currentFlow

  // ─── פתיחה — תפריט שיטות תשלום ──────────────────────────────────────────
  if (!step || step === 'payment_setup_start') {
    // ── פרסונליזציה — טען נתוני ההורה אם עוד לא נטענו ──────────────────────
    if (!session.collectedData.child_name && session.phone) {
      await loadParentRegistrationContext(session.phone, session)
    }

    const childName  = session.collectedData.child_name  ?? ''
    const areaLabel  = session.collectedData.area_label  ?? ''
    const amount     = session.collectedData.monthly_fee ?? String(getDefaultMonthlyFee())
    const fromSpot   = session.collectedData.from_spot_offer === 'true'

    // ── intro מותאם אישית ─────────────────────────────────────────────────
    const personalInfo = childName
      ? `עבור *${childName}*${areaLabel ? ` (${areaLabel})` : ''} — *${amount}₪/חודש*\n\n`
      : ''

    const intro = fromSpot
      ? `מעולה! 🎉 נסדר עכשיו את התשלום עבור *${childName}*${areaLabel ? ` ב${areaLabel}` : ''} (${amount}₪/חודש).\n\n`
      : `*הסדרת תשלום — Kids & Fun* 💛\n\n${personalInfo}`

    return {
      text:
        intro +
        `*באיזו שיטת תשלום תרצו?\n\n*` +
        `*1* — 💳 כרטיס אשראי (PayPlus)\n` +
        `*2* — 🏦 הוראת קבע (PayPlus) — מומלץ!\n` +
        `*3* — 💵 מזומן\n` +
        `*4* — 📝 צ׳קים\n` +
        `*5* — 🏛️ העברה בנקאית\n` +
        `*6* — 🔗 קישור תשלום מיידי`,
      nextFlow: 'payment_setup_method',
    }
  }

  // ─── עיבוד בחירת שיטת תשלום ──────────────────────────────────────────────
  if (step === 'payment_setup_method') {
    const msg       = userMessage.trim()
    const childName = session.collectedData.child_name   ?? 'הילד/ה'
    const amount    = parseInt(session.collectedData.monthly_fee ?? String(getDefaultMonthlyFee()), 10)
    const firstName = session.parentName?.split(' ')[0] ?? ''

    let chosenMethod: PaymentMethod | null = null

    if (msg === '1' || /אשראי|כרטיס|credit/i.test(msg))        chosenMethod = 'credit'
    if (msg === '2' || /הוראת קבע|קבע|standing/i.test(msg))    chosenMethod = 'standing_order'
    if (msg === '3' || /מזומן|cash/i.test(msg))                 chosenMethod = 'cash'
    if (msg === '4' || /צ.?ק|שיק|check/i.test(msg))            chosenMethod = 'checks'
    if (msg === '5' || /העברה|בנק|transfer/i.test(msg))        chosenMethod = 'bank_transfer'
    if (msg === '6' || /קישור|חשבונית|invoice|link/i.test(msg)) chosenMethod = 'invoice_link'

    if (!chosenMethod) {
      return {
        text:
          `לא הבנתי 😊 אנא בחרו:\n\n` +
          `*1* — 💳 כרטיס אשראי\n` +
          `*2* — 🏦 הוראת קבע\n` +
          `*3* — 💵 מזומן\n` +
          `*4* — 📝 צ׳קים\n` +
          `*5* — 🏛️ העברה בנקאית\n` +
          `*6* — 🔗 קישור תשלום מיידי`,
        nextFlow: 'payment_setup_method',
      }
    }

    session.collectedData.payment_method = chosenMethod

    // ── אשראי / הוראת קבע → שאלות זיהוי לפני שליחת קישור ───────────────────
    // ⚠️ לא מסתמכים על מספר הטלפון של הפונה! הורה יכול לכתוב מטלפון לא מזוהה.
    // שואלים: שם הילד/ה המלא + אזור — ולפי האזור נשלח הלינק הנכון.
    if (chosenMethod === 'credit' || chosenMethod === 'standing_order') {
      return {
        text:
          `${chosenMethod === 'standing_order' ? '🏦 *הוראת קבע*' : '💳 *כרטיס אשראי*'} — בחירה מצוינת!\n\n` +
          `לפני שאשלח את הקישור, לצורך זיהוי:\n\n` +
          `*מה שם הילד/ה? (שם פרטי + שם משפחה)*`,
        nextFlow: 'payment_setup_child_name',
      }
    }

    // ── מזומן ────────────────────────────────────────────────────────────────
    if (chosenMethod === 'cash') {
      return {
        text:
          `💵 *תשלום במזומן*\n\n` +
          `ניתן לשלם בתחילת כל חודש ישירות לצוות הצהרון.\n\n` +
          `*סכום:* ${amount}₪ לחודש\n\n` +
          `נציגה שלנו תיצור קשר לתיאום.\n\n` +
          `${isBusinessHours() ? 'נחזור אליך היום! 😊' : 'נחזור אליך בשעות הפעילות 💛'}`,
        isComplete: true,
        createTask: {
          type:        'כשל תשלום',
          description: `שיטת תשלום: מזומן — ${childName} | לתיאום גביה חודשית`,
          priority:    'רגיל',
        },
      }
    }

    // ── צ׳קים — שואלים כמה ─────────────────────────────────────────────────
    if (chosenMethod === 'checks') {
      return {
        text:
          `📝 *צ׳קים — מצוין!*\n\n` +
          `*כמה צ׳קים תרצו לתת?*\n` +
          `_(למשל: 3, 6, 10 — כל צ׳ק לחודש אחד)_`,
        nextFlow: 'payment_setup_checks',
      }
    }

    // ── העברה בנקאית ─────────────────────────────────────────────────────────
    if (chosenMethod === 'bank_transfer') {
      return {
        text:
          `🏛️ *העברה בנקאית*\n\n` +
          formatBankTransferMessage() +
          `\n\n*סכום להעברה:* ${amount}₪ לחודש\n\n` +
          `לאחר כל העברה — שלחו אישור בצ׳אט ונתעד ✅`,
        isComplete: true,
        createTask: {
          type:        'שאלה כללית',
          description: `שיטת תשלום: העברה בנקאית — ${childName} | לוודא קבלת תשלום`,
          priority:    'רגיל',
        },
      }
    }

    // ── קישור תשלום — חשבונית ירוקה ─────────────────────────────────────────
    if (chosenMethod === 'invoice_link') {
      const invoiceUrl = await getInvoiceLink({
        customerName: session.parentName ?? firstName,
        amount,
        description: `תשלום חודשי Kids & Fun — ${childName}`,
      })

      if (invoiceUrl) {
        return {
          text:
            `🔗 *קישור לתשלום מיידי:*\n\n` +
            `${invoiceUrl}\n\n` +
            `ניתן לשלם בכרטיס אשראי / ביט / פייבוקס.\n` +
            `לאחר התשלום — יישלח אישור אוטומטי 💛`,
          isComplete: true,
          createTask: {
            type:        'שאלה כללית',
            description: `קישור תשלום חשבונית ירוקה נשלח — ${childName}`,
            priority:    'רגיל',
          },
        }
      }

      // קישור לא מוגדר ב-bot_assets
      return {
        text:
          `🔗 *קישור תשלום*\n\n` +
          `${isBusinessHours()
            ? 'נציגה שלנו תשלח לך קישור תשלום עכשיו! 💛'
            : 'נשלח לך קישור תשלום בשעות הפעילות (8:00-17:00) 📬'}`,
        isComplete: true,
        createTask: {
          type:        'שאלה כללית',
          description: `הורה מבקש קישור תשלום מיידי — ${childName} | לשלוח קישור חשבונית ירוקה`,
          priority:    'גבוה',
        },
      }
    }
  }

  // ─── שלב זיהוי 1: שם הילד/ה המלא ─────────────────────────────────────────
  if (step === 'payment_setup_child_name') {
    const nameInput = userMessage.trim().replace(/\s+/g, ' ')
    const words = nameInput.split(' ').filter(w => w.length >= 2)

    // דרושים לפחות שם פרטי + שם משפחה (2 מילים), ללא ספרות
    if (words.length < 2 || /\d/.test(nameInput) || nameInput.length > 60) {
      return {
        text:
          `צריך שם מלא לצורך זיהוי 😊\n\n` +
          `*אנא כתבו שם פרטי + שם משפחה של הילד/ה*\n` +
          `_(למשל: נועה כהן)_`,
        nextFlow: 'payment_setup_child_name',
      }
    }

    session.collectedData.child_name = nameInput
    session.collectedData.identity_confirmed = 'true'

    return {
      text:
        `תודה! ועכשיו —\n\n` +
        `*באיזה אזור ${nameInput} בצהרון?*\n\n` +
        `*1* — כרמל (עתלית והסביבה)\n` +
        `*2* — שרון (רשפון, מתן והסביבה)\n` +
        `*3* — תל אביב`,
      nextFlow: 'payment_setup_area',
    }
  }

  // ─── שלב זיהוי 2: אזור → שליחת הלינק הנכון ───────────────────────────────
  if (step === 'payment_setup_area') {
    const msg = userMessage.trim()
    let areaCode:  string | null = null
    let areaLabel = ''

    if (msg === '1' || /כרמל|עתלית|גלי/.test(msg))                    { areaCode = 'carmel';  areaLabel = 'כרמל' }
    if (msg === '2' || /שרון|רשפון|מתן|צור יצחק/.test(msg))           { areaCode = 'sharon';  areaLabel = 'שרון' }
    if (msg === '3' || /תל אביב|ת"א|תל-אביב|ת״א|תלאביב/.test(msg))    { areaCode = 'telaviv'; areaLabel = 'תל אביב' }

    if (!areaCode) {
      return {
        text:
          `לא הבנתי 😊 באיזה אזור?\n\n` +
          `*1* — כרמל\n` +
          `*2* — שרון\n` +
          `*3* — תל אביב`,
        nextFlow: 'payment_setup_area',
      }
    }

    session.collectedData.area_code  = areaCode
    session.collectedData.area_label = areaLabel

    // אחרי האזור — שואלים גן/בי"ס ומתמחרים לפי המסגרת (לא לפי אזור, לעולם לא 799)
    return await resolvePaymentSchool(session)
  }

  // ─── שלב זיהוי 3: בחירת גן/בי"ס (לתמחור נכון) ──────────────────────────────
  if (step === 'payment_setup_school') {
    const list = (session.collectedData.payment_setup_school_list ?? '').split('||').filter(Boolean)
    const m = userMessage.trim()
    const num = parseInt(m, 10)
    const chosen = (!isNaN(num) && num >= 1 && num <= list.length)
      ? list[num - 1]
      : (list.find(s => m.length >= 2 && s.includes(m)) ?? null)
    if (!chosen) {
      return {
        text: `לא הבנתי 😊 בחרו מספר מהרשימה:\n` + list.map((s, i) => `*${i + 1}* — ${s}`).join('\n'),
        nextFlow: 'payment_setup_school',
      }
    }
    session.collectedData.child_school = chosen
    return await paymentResolveFeeAndContinue(session)
  }

  // ─── שלב זיהוי 4: כיתה (למסגרות שמתמחרות לפי כיתה, כמו מתן) ─────────────────
  if (step === 'payment_setup_class') {
    session.collectedData.child_class = userMessage.trim()
    return await paymentResolveFeeAndContinue(session)
  }

  // (הקוד הישן של יצירת לינק לפי אזור הוחלף בעוזרים resolvePaymentSchool/finalizePaymentLink — מושבת)
  if (step === '__payment_area_legacy_disabled__') {
    const childName  = session.collectedData.child_name ?? 'הילד/ה'
    const regId      = session.collectedData.registration_id ?? `bot-${Date.now()}`
    const amount     = parseInt(session.collectedData.monthly_fee ?? String(getDefaultMonthlyFee()), 10)
    const firstName  = session.parentName?.split(' ')[0] ?? ''
    const isStanding = session.collectedData.payment_method === 'standing_order'
    const description = isStanding
      ? `הוראת קבע — צהרון Kids & Fun | ${childName}`
      : `תשלום חודשי — צהרון Kids & Fun | ${childName}`
    const areaCode  = session.collectedData.area_code ?? ''
    const areaLabel = session.collectedData.area_label ?? ''

    // ⚠️ מניעת הוראת קבע כפולה (החלטה 2): אם כבר קיימת הו"ק פעילה — לא יוצרים חדשה.
    // הו"ק חדשה נוצרת רק ברישום; לעדכון כרטיס משתמשים ב-"כשל תשלום" (renewal).
    if (isStanding) {
      const { createServiceClient } = await import('@/lib/supabase/server')
      const sb = createServiceClient()
      const { data: existing } = await sb
        .from('parents')
        .select('payplus_recurring_uid, payplus_recurring_status')
        .or(`phone.eq.${session.phone},phone.eq.972${session.phone.replace(/^0/, '')}`)
        .maybeSingle()
      if (existing?.payplus_recurring_uid && existing.payplus_recurring_status === 'active') {
        return {
          text:
            `יש לכם כבר הוראת קבע פעילה 💛\n\n` +
            `אם צריך *לעדכן כרטיס* — כתבו "כשל תשלום" ואשלח קישור לעדכון ההוראה הקיימת.\n` +
            `לכל שינוי אחר — נציגה תיצור איתכם קשר.`,
          isComplete: true,
          createTask: {
            type:        'כשל תשלום',
            description: `ביקש/ה הסדרת תשלום אך כבר קיימת הו"ק פעילה — ${childName}. לבדוק אם נדרש עדכון/שינוי.`,
            priority:    'רגיל',
          },
        }
      }
    }

    const result = await createPayPlusPaymentLink({
      registrationId: regId,
      parentName:     session.parentName ?? firstName,
      phone:          session.phone,
      childName,
      areaCode,
      areaLabel,
      amount,
      description,
      paymentType:    isStanding ? 'standing_order' : 'credit',
    })

    if (result.success && result.paymentUrl) {
      const demoNote = result.isDemo
        ? `\n\n🔵 *סביבת דמו* — זה קישור לדוגמה (מזהה: ${result.orderId})`
        : ''
      return {
        text:
          `מעולה! ${isStanding ? '🏦 *הוראת קבע*' : '💳 *אשראי*'} עבור *${childName}* (${areaLabel}):\n\n` +
          `🔗 ${result.paymentUrl}\n\n` +
          `לאחר השלמת התשלום — יישלח אישור ${isStanding ? 'והוראת הקבע תופעל אוטומטית' : ''}.` +
          demoNote + `\n\nיש שאלה? כתבו לנו 💛`,
        isComplete: true,
        createTask: {
          type:        'כשל תשלום',
          description: `קישור תשלום ${isStanding ? 'הוראת קבע' : 'אשראי'} נשלח — ילד/ה: ${childName} | אזור: ${areaLabel} | טלפון פונה: ${session.phone} | לוודא שהתשלום נקלט`,
          priority:    'רגיל',
        },
      }
    }

    // PayPlus נכשל → נציגה תטפל
    console.error('[PayPlus] Failed to create payment link:', result.error)
    return {
      text:
        `מצטערים, נתקלנו בבעיה טכנית בהפקת הקישור 😔\n\n` +
        `${isBusinessHours()
          ? 'נציגה שלנו תשלח לך קישור תשלום תוך דקות! 💛'
          : 'נשלח לך קישור תשלום בשעות הפעילות (8:00-17:00) 📬'}`,
      isComplete: true,
      createTask: {
        type:        'כשל תשלום',
        description: `PayPlus error — ${isStanding ? 'הוראת קבע' : 'אשראי'} | ${childName} (${areaLabel}) | err: ${result.error}`,
        priority:    'דחוף',
      },
    }
  }

  // ─── שלב מספר צ׳קים ──────────────────────────────────────────────────────
  if (step === 'payment_setup_checks') {
    const childName = session.collectedData.child_name ?? 'הילד/ה'
    const amount    = parseInt(session.collectedData.monthly_fee ?? String(getDefaultMonthlyFee()), 10)
    const numChecks = parseInt(userMessage.trim(), 10)

    const validNum = !isNaN(numChecks) && numChecks >= 1 && numChecks <= 12
    if (!validNum) {
      return {
        text: `נא לכתוב מספר בין 1 ל-12 😊`,
        nextFlow: 'payment_setup_checks',
      }
    }

    const totalAmount = amount * numChecks

    return {
      text:
        `📝 *תשלום ב-${numChecks} צ׳קים*\n\n` +
        `• ${numChecks} צ׳קים × ${amount}₪ = *${totalAmount}₪ סה"כ*\n` +
        `• כל צ׳ק לסדר ל*Kids & Fun*\n` +
        `• תאריכי הצ׳קים: ה-1 לכל חודש, רצוף מ-${new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' })}\n\n` +
        `נציגה שלנו תתאם איתך לקבלת הצ׳קים.\n\n` +
        `${isBusinessHours() ? 'ניצור קשר היום! 💛' : 'ניצור קשר בשעות הפעילות 💛'}`,
      isComplete: true,
      createTask: {
        type:        'שאלה כללית',
        description: `צ׳קים — ${numChecks} צ׳קים × ${amount}₪ | ${childName} | לתיאום קבלת צ׳קים`,
        priority:    'גבוה',
      },
    }
  }

  return {
    text: `😊 כתבו *"אפשרויות תשלום"* להתחיל מחדש.`,
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול יזום: הצעת מקום מרשימת המתנה
//
// מסלול זה מופעל כאשר:
//   1. הנציגה (מהדשבורד) לוחצת "הצע מקום" על רישום ברשימת המתנה
//   2. המערכת שולחת הודעת WhatsApp פרואקטיבית (ע"י uchat / API)
//   3. ההורה עונה — הבוט קולט את התגובה כאן
//
// session.currentFlow = 'waiting_spot_confirm'
// session.collectedData.child_name, area_code, area_label, registration_id,
//                        waiting_position, monthly_fee
// ═══════════════════════════════════════════════════════════════════════════════
export async function handleWaitingListSpotFlow(
  session:     BotSession,
  userMessage: string
): Promise<BotResponse> {
  const step = session.currentFlow

  // ─── שלב 1: תגובת ההורה להצעת המקום ─────────────────────────────────────
  if (step === 'waiting_spot_confirm') {
    const childName  = session.collectedData.child_name   ?? 'הילד/ה'
    const areaLabel  = session.collectedData.area_label   ?? ''

    if (isYes(userMessage)) {
      // ← מעבר למסלול הסדרת תשלום
      session.collectedData.from_spot_offer = 'true'
      session.currentFlow = 'payment_setup_start'
      return handlePaymentSetupFlow(session, userMessage)
    }

    if (isNo(userMessage)) {
      return {
        text:
          `בסדר גמור 😊\n\n` +
          `תודה על ההודעה — נמשיך לאדם הבא ברשימה.\n\n` +
          `אם תרצו לחזור לרשימת ההמתנה בעתיד — כתבו לנו 💛`,
        isComplete: true,
        createTask: {
          type:        'רשימת המתנה',
          description: `הורה דחה הצעת מקום — ${childName}${areaLabel ? ` ב${areaLabel}` : ''} | לעבור למועמד הבא`,
          priority:    'גבוה',
        },
      }
    }

    // תגובה לא ברורה
    return {
      text:
        `לא הצלחתי להבין 😊\n\n` +
        `כדי לאשר את המקום עבור *${childName}* — כתבו *"כן"*\n` +
        `כדי לוותר — כתבו *"לא"*`,
      nextFlow: 'waiting_spot_confirm',
    }
  }

  return {
    text: `😊 כתבו *"כן"* לאישור המקום, או *"לא"* לוותר.`,
    nextFlow: 'waiting_spot_confirm',
  }
}
