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
import { botText } from './bot-messages-db'
import { normalizeMessage } from './intent-classifier'

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
    text: botText('not_a_name'),
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
    text: botText('area_confirmed', { 'אזור': label }),
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

// ─── אישור/שלילה חד-משמעיים לשלבי אישור קריטיים (astra, S1) ──────────────────
// פעולה בלתי-הפיכה/כספית (ביטול + ביטול הו"ק, ויתור על מקום) מתבצעת *רק* בהתאמה
// מלאה לרשימה סגורה. סדר קריטי: קודם פוסלים שאלה/הסתייגות על הטקסט *הגולמי*
// (לפני הסרת פיסוק) — אחרת "כן?" היה הופך ל-"כן" ומאשר — ורק אז משווים לגרסה
// מנורמלת. ההחלטה בקוד בלבד, לא בפרשנות LLM. "כן אבל רגע"/"אולי כן"/"בסדר" אינם
// אישור; הם נופלים ל-LLM (והמסלול נשמר), לא מכריעים פעולה.
// נמצא בלוגים (09/2026): "לא הבנתי עד מתי אני משלם בפועל?" נקרא כ-"לא"/"כן".
// astra R2: פוסלים גם *מספר/תאריך* (למשל "כן 15/10") וסימני שאלה לא-לטיניים (؟)
// לפני ההשוואה — אלה תוכן משמעותי, לא רעש. ספרות ערביות/פרסיות נתפסות על הגולמי.
const CONFIRM_QUALIFIER_RE = /[?؟？]|\d|[٠-٩۰-۹]|אבל|רגע|חכ[הי]|שנייה|שניה|תכף|עוד מעט|לא עכשיו|אולי|המתן|רק\s/

// astra R2: מסירים *רק* פיסוק וסמלים (כולל אמוג'י) — לא ספרות ולא אותיות. כך
// "כן 15/10" לא מצטמצם ל-"כן" (הספרות נשארות → לא מתאים לרשימה), ו-"כן, בבקשה"
// כן מתאים ל-"כן בבקשה". (לפני התיקון \p{P}/מספרים נמחקו והופכים תוכן ל-"כן".)
function confirmCore(msg: string): string {
  // שומרים אותיות (עברית/לטינית), ספרות ורווח; כל השאר (פיסוק/אמוג'י) → רווח.
  return normalizeMessage(msg).toLowerCase().replace(/[^א-תa-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// אישור/שלילה = אין הסתייגות/שאלה/מספר (על הגולמי), וההודעה כולה מתאימה לרשימה.
function unambiguousMatch(msg: string, whitelist: readonly string[]): boolean {
  if (CONFIRM_QUALIFIER_RE.test(msg)) return false
  return whitelist.includes(confirmCore(msg))
}

// astra R2: בצומת אישור ביטול — הודעה שאינה אישור/שלילה חד-משמעיים: שאלה אמיתית
// → LLM עונה (המסלול נשמר); הסתייגות/עמימות ("כן אבל רגע"/"כן 15/10") → שאלת
// האישור *מחדש* באופן דטרמיניסטי, בלי לתת ל-LLM להכריע פעולה.
function isRealQuestion(msg: string): boolean {
  const t = msg.trim()
  return /[?؟]/.test(t) || /^(האם|מה|מתי|איך|כמה|איפה|למה|אילו|מי|יש|אפשר)([^א-תA-Za-z0-9]|$)/.test(t)
}

// רשימות פר-הקשר — *לא* משותפות ("לבטל" אינו אישור להצטרפות לרשימת המתנה).
const CONFIRM_CANCEL   = ['כן', 'כן בבקשה', 'כן לבטל', 'לבטל', 'בטלו', 'כן בטלו', 'מאשר', 'מאשרת', 'אישור'] as const
const DECLINE_CANCEL   = ['לא', 'לא תודה', 'לא רוצה', 'לא לבטל', 'להשאיר', 'להישאר', 'עזבו'] as const
const CONFIRM_WAITLIST = ['כן', 'כן בבקשה', 'כן להוסיף', 'להוסיף', 'מאשר', 'מאשרת', 'אישור'] as const
const DECLINE_WAITLIST = ['לא', 'לא תודה', 'לא רוצה', 'לא צריך'] as const
const CONFIRM_SPOT     = ['כן', 'כן בבקשה', 'כן רוצה', 'כן אני רוצה', 'רוצה', 'מאשר', 'מאשרת', 'אישור'] as const
const DECLINE_SPOT     = ['לא', 'לא תודה', 'לא רוצה', 'לא צריך', 'לוותר', 'ויתרתי'] as const
const CONFIRM_CHILD_ID = ['כן', 'נכון', 'כן נכון', 'כן זה', 'זה הוא', 'זו היא', 'מאשר', 'מאשרת', 'אישור'] as const
const DECLINE_CHILD_ID = ['לא', 'לא נכון', 'לא זה', 'טעות'] as const
// §10-11: אישור להסדרת הוראת קבע (האופציה הראשית). סירוב/בקשת חלופות → תפריט השיטות.
//   astra חלק ב' (5): **אישור לפי ביטויים שלמים בלבד** (התאמה מלאה של ההודעה). מילה
//   בודדת מתוך אוצר-אישור אינה בהכרח משפט הסכמה — "אני"/"הוראת" לבדן אינן אישור. לכן
//   *אין* מילים-שברי-ביטוי ברשימה; רק ביטויים שלמים + הצירופים הנפוצים.
const CONFIRM_STANDING = [
  // אישורים שלמים בפני עצמם
  'כן', 'מאשר', 'מאשרת', 'אישור', 'מסכים', 'מסכימה', 'אשמח',
  'בשמחה', 'בטח', 'בהחלט', 'לגמרי', 'מעולה', 'מצוין', 'מושלם', 'סבבה', 'אוקיי', 'אוקי',
  'יאללה', 'קדימה', 'בסדר', 'בסדר גמור', 'נשמע טוב', 'להסדיר', 'הוראת קבע',
  // צירופים ("כן ..." / "אני רוצה ...") — ביטויים שלמים, לא מילים בודדות
  'כן בבקשה', 'כן להסדיר', 'כן הוראת קבע', 'הוראת קבע בבקשה', 'כן אשמח',
  'אני רוצה', 'כן רוצה', 'כן אני רוצה', 'אני רוצה הוראת קבע', 'רוצה הוראת קבע', 'כן רוצה הוראת קבע',
  'בוא נעשה', 'בוא נעשה הוראת קבע', 'נעשה הוראת קבע',
  'כן בטח', 'כן מעולה', 'כן בהחלט', 'כן לגמרי', 'כן סבבה', 'כן בשמחה', 'בשמחה רבה',
  // astra חלק ב' (10, סריקה יזומה — קורפוס 160 ניסוחים): ביטויי הסכמה שמכילים מילת שלילה
  //   ("אין בעיה", "בלי ספק") — נתפסו כסירוב. ביטויים שלמים ברשימה הסגורה; ההתאמה המלאה
  //   קודמת להיוריסטיקת השלילה (ראו offerVerdict).
  'אין בעיה', 'לא בעיה', 'אין לי בעיה', 'אין לי בעיה עם זה', 'אין שום בעיה', 'בלי בעיה',
  'בלי ספק', 'אין ספק', 'אין ספק שכן', 'אין לי התנגדות', 'לא רע', 'לא רע בכלל',
  // סלנג/דיבור יומיומי (ביטויים שלמים)
  'בכיף', 'בכיף גדול', 'ברור', 'ברור שכן', 'כמובן', 'כמובן שכן', 'בטח שכן', 'אחלה', 'סגור', 'סגור עליי', 'סגור עלי',
  'נשמע מעולה', 'נשמע לי טוב', 'נראה לי טוב', 'נראה טוב', 'נראה מעולה', 'מקובל', 'מקובל עליי', 'מקובל עלי',
  'בוא נתחיל', 'בואו נתחיל', 'נתחיל', 'נעשה את זה', 'בוא נעשה את זה', 'בואו נעשה', 'בואו נעשה הוראת קבע',
  // אנגלית (הורים דוברי אנגלית) — באותיות קטנות; confirmCore מנרמל רישיות
  'ok', 'okay', 'yes', 'yes please', 'sure', 'yep', 'yeah', 'ok sure', 'sounds good', 'fine',
] as const
// מילות-מילוי שמותר להן להופיע *לצד* ביטוי אישור שלם ("סבבה אחי", "כן תודה") — לעולם לא
//   מאשרות לבד. רשימה סגורה וקצרה; כל מילה אחרת בהודעה מפילה את ההתאמה → הבהרה.
const ACCEPT_FILLERS = ['אחי', 'אחותי', 'נו', 'אז', 'תודה', 'בבקשה', 'ממש', 'מאוד', 'רבה', 'גדול', 'זה', 'בוא', 'בואו', 'טוב', 'יאללה', 'please', 'thanks'] as const
const DECLINE_STANDING = ['לא', 'לא תודה', 'לא רוצה', 'לא צריך', 'אפשרות אחרת', 'אחרת', 'משהו אחר', 'חלופה', 'חלופות', 'אפשרויות', 'תפריט',
  'no', 'no thanks', 'no thank you', 'nope'] as const

// astra חלק ב' (10): הודעה שמורכבת *כולה* מביטויי אישור שלמים (+מילוי) — "בסדר גמור מאשרת",
//   "כן מעולה בואו נתחיל", "סבבה אחי". התאמה חמדנית (הביטוי הארוך ביותר קודם), נדרש לפחות
//   ביטוי אישור אחד; מילה שאינה ברשימות → אין התאמה (ברירת מחדל בטוחה = הבהרה). זה עדיין
//   אוצר סגור — לא מילים-בודדות, לא regex — רק צירוף של ביטויים שכל אחד מהם אישור בפני עצמו.
function isAcceptPhraseSequence(msg: string): boolean {
  if (CONFIRM_QUALIFIER_RE.test(msg)) return false
  const words = confirmCore(msg).split(' ').filter(Boolean)
  if (words.length === 0) return false
  const phrases = [...CONFIRM_STANDING].map(p => p.split(' ')).sort((a, b) => b.length - a.length)
  let i = 0, accepts = 0
  while (i < words.length) {
    const hit = phrases.find(ph => ph.every((w, k) => words[i + k] === w))
    if (hit) { i += hit.length; accepts++; continue }
    if ((ACCEPT_FILLERS as readonly string[]).includes(words[i])) { i++; continue }
    return false
  }
  return accepts > 0
}
const OTHER_METHOD_RE = /אשראי|כרטיס|מזומן|צ.?ק|שיק|העברה|בנק|קישור|חשבונית/
// astra חלק ב' (2): בקשות *הסבר/מידע* — קדימות על אישור, גם בלי סימן שאלה
//   ("מה זה הוראת קבע", "כן אשמח לדעת יותר", "תסביר"). → LLM, נשארים בהצעה.
const EXPLAIN_RE = /מה\s*(זה|זו|הם|היא)|מה\s*המשמעות|מה\s*(זה\s*)?כולל|תסביר|להסביר|הסבר|פרטים|עוד מידע|לדעת (עוד|יותר)|אשמח לדעת|רוצה לדעת|רוצה להבין|להבין (עוד|יותר|טוב)|איך זה עובד|איך [^,.?]{0,25}עובד|מה היתרון/
// סירוב/הימנעות (כולל אזכור "הוראת קבע" בהקשר שלילי כמו "מעדיף להימנע מהוראת קבע").
const REFUSE_RE = /להימנע|מעדיף (לא|להימנע)|עדיף (לא|להימנע)|לא מעוני|לא רוצ|לא בא לי|לא צריך|בלי הוראת|אפשרות אחרת|משהו אחר|(^|\s)אחר(ת)?(\s|$)|חלופ|תפריט|אפשרויות/
// דחייה/היסוס — "לא עכשיו"/"רוצה לחשוב"/"נראה" אינם סירוב לחלופות אלא בקשת זמן → הבהרה
//   (קדימות לפני הסירוב, כדי ש"לא עכשיו" לא יפורש כסירוב שמוביל לתפריט).
const DEFER_RE = /לחשוב|אחשוב|בהמשך|אחר כך|אחכ|עוד מעט|לא עכשיו|לא היום|מחר|נראה|תלוי|(^|\s)רגע(\s|$)|שנייה|שניה|(^|\s)חכ[הי]|תכף/
// §10-11: זיהוי מטרת-הביטול — רישום (צהרון/קייטנה) מול אמצעי-תשלום (הו"ק). שתיהן יחד → בירור.
const CANCEL_REG_TARGET = /רישום|הרשמה|צהרון|קייטנה/
// astra חלק ב' (10): פועל הביטול בכל נטיותיו (תת-מחרוזת — "נבטל"/"תבטלו"/"מבטלת"/"ביטלנו"),
//   לא רק "לבטל|ביטול". אותו פער תוקן במסווג הכוונות (CANCEL_VERB_FORMS).
const CANCEL_VERB_RE = /ביטול|ביטל|בטל|להפסיק|לעזוב/
// astra חלק ב' (10): שלילה נספרת רק אם היא *באותה פסוקית* של המטרה. "לא, לבטל את הרישום"
//   (הפסיק סוגר את ה-"לא" כתשובה להצעה) ≠ "לא לבטל את הרישום" / "לא רוצה לבטל". קודם השלילה
//   נבדקה על כל ההודעה אחרי מחיקת הפיסוק — והבקשה החיובית נפלה ללולאת הבהרה.
//   נבדק על הטקסט *הגולמי* (עם פיסוק), בגבולות פסוקית: פסיק/נקודה/סימן קריאה/"אבל"/"אלא"/"אך".
const CLAUSE_BOUNDARY_RE = /[,.;:!?]|(^|\s)(אבל|אלא|אך)(\s|$)/
const NEG_WORD_RE = /(^|[^א-ת])(לא|בלי|אינני|אין)([^א-ת]|$)/
function clauseAround(raw: string, start: number, end: number): { before: string; after: string } {
  return {
    before: raw.slice(0, start).split(CLAUSE_BOUNDARY_RE).pop() || '',
    after:  raw.slice(end).split(CLAUSE_BOUNDARY_RE)[0] || '',
  }
}
function negatedInClause(raw: string, start: number, end: number): boolean {
  const { before, after } = clauseAround(raw, start, end)
  return NEG_WORD_RE.test(before) || NEG_WORD_RE.test(after)
}
// astra חלק ב' (10): "שניהם"/"הכל" בבירור "מה לבטל" — ביטול הרישום מבטל ממילא גם את הו"ק
//   (ראו handleCancellationFlow), ויש בו שלב אישור משלו → מנתבים לביטול רישום.
//   astra סבב 10 (P2): "גם את" לבדו אינו "שניהם" ("גם את התשלום" = תשלום בלבד) - רק ביטוי משותף
//   מפורש, או שתי מטרות מזוהות וחיוביות. השלילה נבדקת גם על ביטוי ה"שניהם" עצמו ("לא שניהם" → בירור).
const CANCEL_BOTH_RE = /שניהם|שתיהן|(^|\s)הכל(\s|$)|גם וגם|שתי האפשרויות|שני הדברים/
// astra סבבים 11-13 (P2 ×3): כל היקש של "שניהם" ממילים מפוזרות (שתי מילות-מטרה / "וגם" חופשי /
//   רגקס עם wildcard) נכשל - "את התשלום לצהרון וגם את התשלום לקייטנה" מציין שני תשלומים, לא רישום.
//   **אין היקש ואין regex.** רק משפטים שלמים בהתאמה מלאה להודעה המנורמלת (confirmCore). כל שילוב
//   אחר של רישום+תשלום → בירור שוב (לא באג: הבהרה היא ברירת המחדל לקלט לא מוכרע).
const CANCEL_BOTH_SENTENCES = [
  'גם את הרישום וגם את הוראת הקבע', 'גם את הרישום וגם הוראת הקבע', 'גם את הרישום וגם את התשלום',
  'גם את הוראת הקבע וגם את הרישום', 'גם הוראת הקבע וגם את הרישום', 'גם את התשלום וגם את הרישום',
  'את הרישום וגם את הוראת הקבע', 'את הרישום וגם את התשלום', 'הרישום וגם הוראת הקבע', 'הרישום וגם התשלום',
  'את הרישום ואת הוראת הקבע', 'את הרישום ואת התשלום', 'הרישום והתשלום', 'הרישום והוראת הקבע',
] as const
const WANT_ALTERNATIVE_RE = /אפשרות אחרת|משהו אחר|חלופ|אפשרויות|תפריט|(^|\s)אחר(ת)?(\s|$)/
// סבב 12 (סריקה יזומה): היסוס בתשובה לבירור ("לא בטוח, אולי את הרישום") אינו בחירה - אותו שומר
//   כמו CONFIRM_QUALIFIER_RE/DEFER_RE בשלב ההצעה, בלי "רק" ("רק את הרישום" היא בחירה ברורה).
const HESITATION_RE = /אולי|אבל|(^|\s)רגע(\s|$)|לא בטוח|לחשוב|אחשוב|תלוי|כנראה|אני חושב|אני חושבת|נראה לי ש/
const CANCEL_PAY_TARGET = /הוראת\s*ה?קבע|(^|\s)הו\s*ק(\s|$)|התשלום|אמצעי/
// §10-11: מסווג תגובה להצעת הו"ק. **סדר קדימות: שאלה/בקשת-הסבר → דחייה → סירוב → אישור → עמום.**
//   האישור הוא **התאמה מלאה לביטוי שלם** (לא מילים-בודדות מאוצר). כל קלט לא-מסווג נופל
//   ל-unclear (הבהרה) — הצד הבטוח (לא לאשר תשלום בטעות).
function offerVerdict(msg: string): 'accept' | 'refuse' | 'question' | 'unclear' {
  const core      = confirmCore(msg)
  const negated   = /(^|\s)(לא|בלי|אינני|אין)(\s|$)/.test(core)
  const otherMeth = OTHER_METHOD_RE.test(core)

  // 0. astra חלק ב' (10): הודעה שכולה ביטויי-אישור שלמים מהרשימה הסגורה ("אין בעיה", "נראה לי טוב",
  //    "סבבה אחי") — מוכרעת *לפני* ההיוריסטיקות (שלילה/דחייה/סירוב הן regex על תת-מחרוזות, ו-"אין"
  //    ב-"אין בעיה" / "נראה" ב-"נראה לי טוב" הפילו אישורים ברורים לסירוב/הבהרה). זה לא משנה את סדר
  //    הקדימות לקלט חופשי: ההתאמה כאן היא לרשימה סגורה בלבד, שאינה מכילה שאלה/סירוב/דחייה, וסימן
  //    שאלה/"אבל"/"רגע"/"אולי"/ספרה עדיין פוסלים (CONFIRM_QUALIFIER_RE).
  if (isAcceptPhraseSequence(msg)) return 'accept'
  // 1. קדימות לשאלות ובקשות הסבר → LLM (נשאר בהצעה). לפני כל אישור חופשי.
  if (isRealQuestion(msg) || EXPLAIN_RE.test(core)) return 'question'
  // 2. דחייה/היסוס ("לא עכשיו"/"רוצה לחשוב"/"נראה") → הבהרה, נשאר בהצעה (לפני סירוב).
  if (DEFER_RE.test(core)) return 'unclear'
  // 3. סירוב / הימנעות / שיטה אחרת → תפריט חלופות.
  if (negated || otherMeth || REFUSE_RE.test(core) || unambiguousMatch(msg, DECLINE_STANDING)) return 'refuse'
  // 4. אישור: התאמה מלאה לביטוי אישור שלם בלבד (unambiguousMatch חוסם גם qualifier).
  if (unambiguousMatch(msg, CONFIRM_STANDING)) return 'accept'
  return 'unclear'                                                        // עמום / המשך לא מוכר → הבהרה
}

// תפריט הבוט — נקרא מ-bot_messages (מפתח 'menu') עם fallback לקשיח. פונקציה כדי
// שייקרא פר-בקשה מה-cache (const היה נטען פעם אחת בזמן טעינת המודול).
function menuText(): string { return botText('menu') }

// ─── ברכה ─────────────────────────────────────────────────────────────────────
export function buildWelcomeMessage(parentName?: string): string {
  const greeting = parentName ? `היי ${parentName.split(' ')[0]} 😊\n\n` : `שלום! 😊\n\n`
  return botText('welcome', { 'ברכה': greeting, 'שם_בוט': BOT_NAME, 'תפריט': menuText() })
}

// ─── לא הבנתי ─────────────────────────────────────────────────────────────────
export function buildDidNotUnderstand(): string {
  return botText('did_not_understand', { 'תפריט': menuText() })
}

// ─── הסלמה לנציג ─────────────────────────────────────────────────────────────
export function buildEscalationMessage(): string {
  return isBusinessHours()
    ? botText('escalation_business_hours')
    : botText('escalation_after_hours')
}

// ─── פנייה יזומה (מהמערכת) ───────────────────────────────────────────────────
// זו ההודעה שהמערכת שולחת כשמזוהה כשל תשלום
export function buildProactivePaymentMessage(parentName: string): string {
  const firstName = parentName.split(' ')[0] || parentName
  return botText('proactive_payment', { 'שם': firstName })
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
            text: botText('register_placeholder_ask_name', { 'ברכה': firstName ? ' ' + firstName : '' }),
            nextFlow: 'register_complete_placeholder',
          }
        }

        if (realKids.length > 0) {
          const kidsText = realKids
            .map((k: { name: string; class_name?: string | null }) =>
              `• *${k.name}*${k.class_name ? ` (כיתה ${k.class_name})` : ''}`).join('\n')
          const firstName = parent?.name?.split(' ')[0] ?? ''
          return {
            text: botText('register_existing_menu', { 'ברכה': firstName ? ' ' + firstName : '', 'ילדים': kidsText }),
            nextFlow: 'register_existing_parent',
          }
        }
      } catch (err) {
        console.error('[register_start] phone lookup error:', err)
      }
    }

    // הורה לא מזוהה / חדש → תהליך רישום רגיל
    return {
      text: botText('register_new_parent_area'),
      nextFlow: 'register_area',
    }
  }

  // ─── השלמת שם ילד placeholder (הורה זוהה אבל חסר שם בילד) ─────────────
  if (step === 'register_complete_placeholder') {
    const name = userMessage.trim().replace(/\s+/g, ' ')
    const words = name.split(' ').filter(w => w.length >= 2)
    if (words.length < 2 || /\d/.test(name) || name.length > 60) {
      return {
        text: botText('register_placeholder_invalid'),
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
      text: botText('register_placeholder_done', { 'ילד': name }),
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
        text: botText('register_existing_new_child_area'),
        nextFlow: 'register_area',
      }
    }
    if (msg === '2' || /עדכון|לעדכן|פרטים|לשנות/i.test(msg)) {
      return {
        text: botText('register_update_prompt'),
        nextFlow: 'register_update_details',
      }
    }
    if (msg === '3' || /סטטוס|תשלום|שילמתי/i.test(msg)) {
      session.currentFlow = 'payment_status_menu'
      return handlePaymentStatusFlow(session.parentName)
    }
    if (msg === '4' || /שאלה|אחר/i.test(msg)) {
      return {
        text: botText('register_existing_question_prompt'),
        nextFlow: 'register_existing_question',
      }
    }
    // לא אחת מהאפשרויות → ל-LLM עם ההקשר (המסלול נשמר) במקום "לא הבנתי"
    return { text: '', useLLM: true }
  }

  // עדכון פרטים → משימה לנציגה
  if (step === 'register_update_details') {
    return {
      text: botText('register_update_ack'),
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
      text: botText('register_existing_question_ack'),
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
        text: botText('register_area_not_recognized', { 'אזורים': servedAreasText() }),
        nextFlow: 'register_area',
      }
    }
    delete session.collectedData._area_miss
    session.collectedData.area_code = area
    return {
      text: botText('register_ask_child_name'),
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
        text: botText('register_name_need_full'),
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
            text: botText('register_found_existing_child', { 'ילד': kid.name, 'פרטים': lines }),
            nextFlow: 'register_existing_parent',
          }
        }
      }
    } catch (err) {
      console.error('[register_child_name] lookup error:', err)
    }

    // ילד חדש — המשך לשלב הכיתה
    return {
      text: botText('register_child_new_ask_class', { 'ילד': trimmed }),
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
        text: botText('register_class_need_area'),
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
        text: botText('register_has_spot', { 'ילד': childName, 'אזור': areaLabel, 'קישור': formUrl }),
        isComplete: true,
        createTask: {
          type:        'רישום',
          description: `בקשת רישום לצהרון — ${childName} כיתה ${userMessage} | אזור: ${areaLabel} | ממתין למילוי טופס`,
          priority:    'רגיל',
        },
      }
    } else {
      return {
        text: botText('register_no_spot', {
          'אזור': areaLabel,
          'ילד': childName,
          'מיקום': String(capacity.waitingListPosition),
        }),
        nextFlow: 'register_waiting_confirm',
      }
    }
  }

  // ─── שלב אישור רשימת המתנה ────────────────────────────────────────────────
  if (step === 'register_waiting_confirm') {
    const childName = session.collectedData.child_name || 'הילד/ה'
    const areaCode  = session.collectedData.area_code  || 'sharon'

    if (unambiguousMatch(userMessage, CONFIRM_WAITLIST)) {
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
          text: botText('register_waitlist_added', {
            'ילד': childName,
            'אזור': areaLabel,
            'מיקום': String(result.position),
          }),
          isComplete: true,
          createTask: {
            type:        'רשימת המתנה',
            description: `רשימת המתנה — ${childName} כיתה ${session.collectedData.class_name} | אזור: ${areaLabel} | מיקום ${result.position}`,
            priority:    'רגיל',
          },
        }
      } catch {
        return {
          text: botText('register_waitlist_added_fallback', { 'ילד': childName }),
          isComplete: true,
        }
      }
    }
    if (unambiguousMatch(userMessage, DECLINE_WAITLIST)) {
      return {
        text: botText('register_waitlist_declined'),
        isComplete: true,
      }
    }
    // עמימות ("כן אבל רגע"/שאלה) → שאלת אישור מפורשת, המסלול נשמר (astra)
    return {
      text: `להוסיף את *${childName}* לרשימת ההמתנה? (כן / לא)`,
      nextFlow: 'register_waiting_confirm',
    }
  }

  return { text: botText('register_restart') }
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
    // astra #9: הסימולטור אינו sandbox — אסור לו לבטל רישום או הו"ק אמיתיים.
    // מחזירים תוצאה *מדומה* כדי שהשיחה תזרום, בלי לגעת ב-DB או ב-PayPlus.
    if (session.simulated) {
      return { childName: childNameInput.trim().replace(/\s+/g, ' ') || 'הילד/ה', payplusCancelled: false }
    }
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

    // ⚠️ Supabase מחזיר error *בגוף* (לא זורק) — בלי בדיקת התוצאה כשל כתיבה היה
    //    מדווח "הביטול בוצע" *וגם* מבטל הו"ק ב-PayPlus (astra #3, S1). בכשל →
    //    return null, וההורה מקבל "נקלט, נציגה תשלים ידנית" בלי סליקה ובלי timeline.
    // ⚠️ astra סבב 4 (S1): ה-UPDATE הוא **compare-and-set** — מותנה בסטטוס שעדיין פעיל.
    //    שתי הודעות "כן" חופפות: רק ה-UPDATE הראשון תופס (מ'מאושר'→'בוטל', מחזיר שורה);
    //    השני רואה 0 שורות ⇒ return null ⇒ *לא* מבצע ביטול הו"ק ב-PayPlus שוב. כך הפעולה
    //    העסקית עצמה אטומית, לא רק שמירת מצב השיחה. הגנת ה-rev לבדה לא הספיקה כי
    //    performCancellation רץ בתוך processMessage, לפני בדיקת הבעלות.
    const { data: updated, error: updErr } = await supabase.from('registrations').update({
      status: 'בוטל',
      notes:  [reg.notes, `בוטל ע"י ההורה דרך הבוט — ${policyNote}`].filter(Boolean).join(' | '),
    }).eq('id', reg.id).in('status', ['מאושר', 'ממתין לאישור']).select('id')

    if (updErr) {
      console.error('[performCancellation] registration update failed:', updErr.message)
      return null
    }
    if (!updated?.length) {
      // 0 שורות = מישהו כבר ביטל (הודעה חופפת) → לא מבצעים שוב, לא נוגעים ב-PayPlus.
      console.log('[performCancellation] registration already cancelled (concurrent) — no-op')
      return null
    }

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
      text: botText('cancel_confirm_before15', { 'יום': String(dayOfMonth), 'ילד': childName }),
      nextFlow: 'cancel_confirm_before15',
    }
  }
  return {
    text: botText('cancel_confirm_after15', { 'יום': String(dayOfMonth), 'ילד': childName }),
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
        text: botText('cancel_wrong_child'),
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
      text: botText('cancel_policy_intro'),
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
        text: botText('cancel_confirm_before15', { 'יום': String(dayOfMonth), 'ילד': userMessage }),
        nextFlow: 'cancel_confirm_before15'
      }
    } else {
      // אחרי 15 — מידע ברור על התקנון, ללא שאלה פתוחה
      return {
        text: botText('cancel_confirm_after15', { 'יום': String(dayOfMonth), 'ילד': userMessage }),
        nextFlow: 'cancel_confirm_after15'
      }
    }
  }

  // לפני 15 — אישור
  if (step === 'cancel_confirm_before15') {
    const childName = session.collectedData.child_name || 'הילד/ה'
    if (unambiguousMatch(userMessage, CONFIRM_CANCEL)) {
      // ביצוע הביטול בפועל ב-CRM
      const result = await performCancellation(
        session, childName, `לפני ה-15 (יום ${dayOfMonth}) — המשך עד סוף החודש + זיכוי מלא`
      )

      if (result) {
        const payplusLine = result.payplusCancelled
          ? `\n💳 *הוראת הקבע ב-PayPlus בוטלה אוטומטית* - לא יבוצעו חיובים נוספים.\n`
          : `\n`
        return {
          text: botText('cancel_done_before15', { 'ילד': result.childName, 'תשלום': payplusLine }),
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
        text: botText('cancel_received_before15', { 'ילד': childName }),
        isComplete: true,
        createTask: {
          type: 'ביטול',
          description: `ביטול אושר ע"י ההורה — ${childName} (יום ${dayOfMonth}, לפני ה-15, זיכוי מלא) | ⚠️ לא אותר אוטומטית ב-CRM — להשלים ידנית + להפסיק הוראת קבע`,
          priority: 'גבוה'
        }
      }
    }

    if (unambiguousMatch(userMessage, DECLINE_CANCEL)) {
      return {
        text: botText('cancel_declined_before15'),
        isComplete: true
      }
    }

    // astra R2: לא אישור ולא שלילה חד-משמעיים. שאלה אמיתית → LLM עונה (המסלול נשמר);
    // הסתייגות/עמימות ("כן אבל רגע"/"כן 15/10") → שאלת האישור *מחדש* דטרמיניסטית.
    if (isRealQuestion(userMessage)) return { text: '', useLLM: true }
    return buildCancelConfirm(childName, dayOfMonth)
  }

  // אחרי 15 — אישור תקנון או בקשת חריג
  if (step === 'cancel_confirm_after15') {
    const childName = session.collectedData.child_name || 'הילד/ה'

    // הורה מציין נסיבות מיוחדות → הסלמה לנציגה
    // "קשה" עם גבול-מילה ידני — אחרת "בב*קשה*" ("בבקשה") נתפס כנסיבות מיוחדות (astra R2)
    if (/מחלה|רפואי|מעבר|חריג|נסיבות|בעיה|(^|[^א-ת])קשה|אי אפשר|לא יכול/i.test(userMessage)) {
      return {
        text: botText('cancel_exception', {
          'המשך': isBusinessHours()
            ? 'נציגה שלנו תחזור אליך בהקדם לטיפול בבקשה.'
            : 'נחזור אליך בשעות הפעילות (ראשון-חמישי 8:00-17:00) 📬',
        }),
        isComplete: true,
        createTask: {
          type: 'ביטול חריג',
          description: `ביטול חריג — ${childName} (יום ${dayOfMonth}, אחרי ה-15, טוען לנסיבות מיוחדות): "${userMessage.slice(0, 80)}"`,
          priority: 'גבוה'
        }
      }
    }

    if (unambiguousMatch(userMessage, CONFIRM_CANCEL)) {
      // ביצוע הביטול בפועל ב-CRM
      const result = await performCancellation(
        session, childName, `אחרי ה-15 (יום ${dayOfMonth}) — ממשיך חודש נוסף ומסיים בסוף החודש הבא`
      )

      if (result) {
        const payplusLine = result.payplusCancelled
          ? `\n💳 *הוראת הקבע ב-PayPlus בוטלה אוטומטית* - לא יבוצעו חיובים נוספים אחרי החודש הבא.\n`
          : `\n`
        return {
          text: botText('cancel_done_after15', { 'ילד': result.childName, 'תשלום': payplusLine }),
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
        text: botText('cancel_received_after15', { 'ילד': childName }),
        isComplete: true,
        createTask: {
          type: 'ביטול',
          description: `ביטול לפי תקנון — ${childName} (יום ${dayOfMonth}, אחרי ה-15, ממשיך חודש נוסף) | ⚠️ לא אותר אוטומטית ב-CRM — להשלים ידנית`,
          priority: 'גבוה'
        }
      }
    }

    if (unambiguousMatch(userMessage, DECLINE_CANCEL)) {
      return {
        text: botText('cancel_declined_after15'),
        isComplete: true
      }
    }

    // astra R2: לא אישור ולא שלילה חד-משמעיים. שאלה אמיתית → LLM עונה (המסלול נשמר);
    // הסתייגות/עמימות ("כן אבל רגע"/"כן 15/10") → שאלת האישור *מחדש* דטרמיניסטית.
    if (isRealQuestion(userMessage)) return { text: '', useLLM: true }
    return buildCancelConfirm(childName, dayOfMonth)
  }

  return { text: botText('cancel_restart') }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 3: קייטנה לפני סגירת רישום
// 3 תרחישים: רישום חדש | בדיקת רישום קיים | בעיה בהרשמה
// ═══════════════════════════════════════════════════════════════════════════════
export function handleCampRegistrationFlow(): BotResponse {
  // הרישום לקייטנה מתבצע באתר (חנות ווקומרס) — האתר עצמו קובע אילו קייטנות
  // פתוחות לרישום. הבוט תמיד מציג את התפריט ושולח את הקישור לחנות.
  return {
    text: botText('camp_menu'),
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
        text: botText('camp_register_link', { 'קישור': campUrl }),
        isComplete: true
      }
    }

    // תרחיש 2: בדיקת רישום קיים
    if (msg === '2' || /לבדוק|כבר נרשם|האם נרשמ|רשום|נרשמתי|לא יודע|לא זוכר/i.test(msg)) {
      return {
        text: botText('camp_check_prompt'),
        nextFlow: 'camp_check_name'
      }
    }

    // תרחיש 3: בעיה בהרשמה
    if (msg === '3' || /בעיה|שגיאה|לא עובד|לא הצלחתי|נתקעתי|תקלה/i.test(msg)) {
      return {
        text: botText('camp_problem_prompt'),
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
      text: botText('camp_check_ask_id', { 'ילד': userMessage }),
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
                text: botText('camp_found_approved', {
                  'ילד': child.name,
                  'קייטנה': campName ? `🏕️ ${campName}\n` : '',
                }),
                isComplete: true,
              }
            }
            return {
              text: botText('camp_found_pending', {
                'ילד': child.name,
                'קייטנה': campName ? ` (${campName})` : '',
              }),
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
            text: botText('camp_not_found_child', { 'ילד': child.name }),
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
            text: botText('camp_no_registration', { 'ילד': childName }),
            isComplete: true,
          }
        }
        // נמצא שם תואם אך הת"ז לא התאימה → להגנת הפרטיות לא חושפים; מבקשים לאמת שוב
        return {
          text: botText('camp_id_mismatch'),
          isComplete: true,
        }
      } catch (err) {
        console.error('[camp_check] lookup error:', err)
      }
    }

    // לא אותר / לא אומת חד-משמעית → נציגה תבדוק (כמו קודם)
    return {
      text: botText('camp_check_manual', {
        'ילד': childName || 'הילד/ה',
        'המשך': !isBusinessHours() ? '_שעות פעילות: ראשון-חמישי 8:00-17:00_' : '',
      }),
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
      text: botText('camp_problem_ack', {
        'המשך': isBusinessHours()
          ? 'נציגה שלנו תחזור אליך עם פתרון בהקדם!'
          : 'נחזור אליך בשעות הפעילות (ראשון-חמישי 8:00-17:00) לעזור!',
      }),
      isComplete: true,
      createTask: {
        type: 'בעיה בהרשמה לקייטנה',
        description: `הורה מדווח על בעיה ברישום לקייטנה: "${problem.slice(0, 100)}"`,
        priority: 'גבוה'
      }
    }
  }

  return { text: botText('camp_restart') }
}

// ─── קייטנה אחרי סגירה ────────────────────────────────────────────────────────
export function handleLateCampFlow(session: BotSession, userMessage: string): BotResponse {
  const step = session.currentFlow

  if (step === 'camp_late_name') {
    if (!looksLikeChildName(userMessage)) return buildNotAName('camp_late_name')
    session.collectedData.child_name = userMessage
    return {
      text: botText('camp_late_ask_class', { 'ילד': userMessage }),
      nextFlow: 'camp_late_class'
    }
  }

  if (step === 'camp_late_class') {
    session.collectedData.class_name = userMessage
    const childName = session.collectedData.child_name || 'הילד/ה'
    return {
      text: botText('camp_late_confirm', {
        'ילד': childName,
        'המשך': isBusinessHours() ? 'ניצור קשר בהמשך היום!' : 'ניצור קשר מחר בבוקר! 🌅',
      }),
      isComplete: true,
      createTask: {
        type: 'רישום מאוחר',
        description: `בקשת רישום לקייטנה אחרי סגירת מועד — ${childName} כיתה ${userMessage}`,
        priority: 'גבוה'
      }
    }
  }

  return { text: botText('camp_restart') }
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
    text: botText('schedule_no_faq'),
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
      text: botText('pickup_start'),
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
      text: botText('pickup_ask_time', { 'ילד': userMessage }),
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
        text: botText('pickup_time_retry'),
        nextFlow: 'pickup_time',
      }
    }
    delete session.collectedData._pickup_time_miss
    session.collectedData.pickup_time = time
    return {
      text: botText('pickup_ask_collector', { 'שעה': time }),
      nextFlow: 'pickup_collector'
    }
  }

  if (step === 'pickup_collector') {
    session.collectedData.collector_name = userMessage
    const childName = session.collectedData.child_name || '?'
    const time = session.collectedData.pickup_time || '?'

    return {
      text: botText('pickup_confirm', { 'ילד': childName, 'שעה': time, 'אוסף': userMessage }),
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

  return { text: botText('pickup_restart') }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 5: בדיקת סטטוס תשלום (כניסה ראשונה)
// מציג אפשרויות ומכניס למסלול הסדרת תשלום אם צריך
// ═══════════════════════════════════════════════════════════════════════════════
export function handlePaymentStatusFlow(parentName?: string): BotResponse {
  const firstName = parentName ? parentName.split(' ')[0] : ''
  return {
    text: botText('payment_menu', { 'ברכה': firstName ? `היי ${firstName}! ` : '' }),
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
      text: botText('payment_status_ask_child'),
      nextFlow: 'payment_status_child_name',
    }
  }

  // בחירה 2 — שינוי שיטת תשלום → מסלול אפשרויות תשלום
  if (msg === '2' || /שיטה|לשנות|אמצעי|אחרת|אחר/i.test(msg)) {
    session.collectedData.payment_setup_reason = 'method_change'
    return {
      text: botText('payment_method_change_menu'),
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
      text: botText('cost_info_menu'),
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
      text: botText('payment_status_name_invalid'),
      nextFlow: 'payment_status_child_name',
    }
  }

  // ⚠️ S1 — חשיפת מידע: שם ילד/ה *לבדו* אינו זיהוי. כל מספר שהקליד שם מוכר
  // קיבל סטטוס תשלום, סכום ושם ההורה של משפחה אחרת (אתגור 17.9).
  // מעכשיו: מזהים ילד/ה רק בתוך המשפחה של הטלפון הפונה.
  const ownChild = await findOwnChildByName(session.phone, nameInput)
  if (!ownChild) {
    return {
      text: botText('payment_status_unidentified'),
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
    text: botText('payment_status_no_data', {
      'ילד': ownChild.name,
      'המשך': isBusinessHours()
        ? 'נציגה שלנו תבדוק את החשבון ותחזור אליך מיד 😊'
        : 'נחזור אליך בשעות הפעילות (ראשון-חמישי 8:00-17:00) עם הפרטים 💛',
    }),
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
      text: botText('cost_monthly', { 'אזור': areaInfo, 'סכום': amount }),
      isComplete: true,
    }
  }

  // ─── 2. קייטנה — תשלום מראש ─────────────────────────────────────────────────
  if (msg === '2' || /קייטנה|קיץ|קיטנה|גיני|קמפ/i.test(msg)) {
    return {
      text: botText('cost_camp'),
      isComplete: true,
    }
  }

  // ─── 3. הנחת אחים ──────────────────────────────────────────────────────────
  if (msg === '3' || /אחים|אחיות|הנחה|שני ילדים|שניים|יותר מ/i.test(msg)) {
    return {
      text: botText('cost_siblings'),
      isComplete: true,
    }
  }

  // ─── 4. שאלה אחרת — LLM (לא נציגה!) ────────────────────────────────────────
  if (msg === '4' || /אחר|אחרת|שאלה|אחרות/i.test(msg)) {
    return {
      text: botText('cost_other_prompt'),
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
    text: botText('cost_not_understood'),
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
      text: botText('payfail_start', { 'ברכה': firstName ? ' ' + firstName : '' }),
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
        text: botText('payfail_other_describe'),
        nextFlow: 'payment_fail_describe'
      }
    }

    // כל שאר הענפים — דורשים זיהוי כפול (טלפון + שם ילד)
    await loadParentRegistrationContext(session.phone, session)
    const existingChild = session.collectedData.child_name
    if (existingChild) {
      // הטלפון זוהה אוטומטית + יש שם ילד מהמערכת → לאישור לפני המשך
      return {
        text: botText('payfail_confirm_child', { 'ילד': existingChild }),
        nextFlow: 'payment_fail_confirm_child',
      }
    }
    // טלפון לא מזוהה → לבקש שם ילד
    return {
      text: botText('payfail_ask_child'),
      nextFlow: 'payment_fail_child_name',
    }
  }

  // ─── אישור זהות הילד (כשהזיהוי לפי טלפון הצליח) ──────────────────────────
  if (step === 'payment_fail_confirm_child') {
    if (unambiguousMatch(userMessage, CONFIRM_CHILD_ID)) {
      return await routePaymentFailBranch(session)
    }
    if (unambiguousMatch(userMessage, DECLINE_CHILD_ID)) {
      session.collectedData.child_name = ''
      return {
        text: botText('payfail_reidentify'),
        nextFlow: 'payment_fail_child_name',
      }
    }
    return {
      text: botText('payfail_confirm_yesno'),
      nextFlow: 'payment_fail_confirm_child',
    }
  }

  // ─── זיהוי לפי שם ילד (כשהטלפון לא מזוהה) ────────────────────────────────
  if (step === 'payment_fail_child_name') {
    const name = userMessage.trim().replace(/\s+/g, ' ')
    if (looksOffScript(name)) return { text: '', useLLM: true }
    if (name.split(' ').filter(w => w.length >= 2).length < 2 || /\d/.test(name)) {
      return {
        text: botText('payfail_name_invalid'),
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
      text: botText('payfail_card_link_sent'),
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
      text: botText('payfail_describe_ack', {
        'המשך': isBusinessHours()
          ? 'נציגה שלנו תחזור אליך בהקדם לטפל בבקשה.'
          : 'נחזור אליך בשעות הפעילות (ראשון-חמישי 8:00-17:00) 📬',
      }),
      isComplete: true,
      createTask: {
        type: 'כשל תשלום',
        description: `בעיית תשלום לא מוגדרת — "${userMessage.slice(0, 120)}"`,
        priority: 'דחוף'
      }
    }
  }

  return { text: botText('payfail_restart') }
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
      // ⚠️ astra E (חריג מוצרי מתועד): חידוש הכרטיס הוא at-least-once. אם שמירת ה-session
      //    נכשלה *אחרי* קריאה מוצלחת זו, ניסיון חוזר על אותה הודעה יריץ אותה שוב → ייתכן
      //    לינק/מייל חידוש שני. אין חיוב כפול (זה רק מייצר לינק לעדכון כרטיס). הפעולות
      //    הכספיות הקריטיות (ביטול רישום, ביטול הו"ק) *כן* אידמפוטנטיות דרך בדיקת סטטוס.
      const { renewRecurringCard } = await import('@/lib/payplus-api')
      const r = await renewRecurringCard(recurringUid)
      if (r.success) {
        // אם חזר לינק — שולחים בוואטסאפ (העדפה); אחרת PayPlus שלח ללקוח מייל חידוש
        if (r.data?.paymentUrl) {
          return {
            text: botText('payfail_card_link_whatsapp', { 'קישור': r.data.paymentUrl }),
            nextFlow: 'payment_fail_card_link_sent',
            createTask: {
              type: 'כשל תשלום',
              description: `חידוש כרטיס בהו"ק קיימת — ${childName} | קישור נשלח (וואטסאפ)`,
              priority: 'רגיל',
            },
          }
        }
        return {
          text: botText('payfail_card_link_email'),
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
        text: botText('payfail_card_to_staff'),
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
      text: botText('payfail_card_no_recurring'),
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
      text: botText('payfail_method_menu'),
      nextFlow: 'payment_fail_method_choice',
    }
  }

  if (branch === 'date') {
    return {
      text: botText('payfail_ask_date'),
      nextFlow: 'payment_fail_new_date',
    }
  }

  if (branch === 'remind') {
    return {
      text: botText('payfail_ask_remind'),
      nextFlow: 'payment_fail_remind_when',
    }
  }

  return { text: botText('payfail_restart') }
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
      text: botText('payfail_cash'),
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
      text: botText('payfail_check'),
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
      text: botText('payfail_bank', { 'פרטי_בנק': formatBankTransferMessage() }),
      isComplete: true,
      createTask: {
        type: 'כשל תשלום',
        description: `${childName} — מעבר להעברה בנקאית. לבטל הוראת קבע ב-PayPlus`,
        priority: 'גבוה',
      },
    }
  }
  return {
    text: botText('payfail_method_invalid'),
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
      text: botText('payfail_date_invalid'),
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
            text: botText('payfail_date_done', { 'ילד': childName, 'יום': String(day) }),
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
    text: botText('payfail_date_received', { 'יום': String(day) }),
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
      text: botText('payfail_remind_invalid'),
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
    text: botText('payfail_remind_done', { 'תאריך': dateLabel, 'ילד': childName }),
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
      text: botText('payset_school_menu', { 'מסגרות': names.map((s, i) => `*${i + 1}* - ${s}`).join('\n') }),
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
      text: botText('payset_class_matan', { 'ילד': session.collectedData.child_name ?? 'הילד/ה' }),
      nextFlow: 'payment_setup_class',
    }
  }
  return paymentToStaff(session, `מחיר לא מוגדר למסגרת "${school}"`)
}

function paymentToStaff(session: BotSession, reason: string): BotResponse {
  const childName = session.collectedData.child_name ?? 'הילד/ה'
  return {
    text: botText('payset_to_staff'),
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
    ? `הוראת קבע - צהרון Kids & Fun | ${childName}`
    : `תשלום חודשי - צהרון Kids & Fun | ${childName}`

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
        text: botText('payset_already_standing'),
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
      text: botText('payset_link', {
        'סוג': isStanding ? '🏦 *הוראת קבע*' : '💳 *אשראי*',
        'ילד': childName,
        'מסגרת': school,
        'סכום': String(amount),
        'קישור': result.paymentUrl,
      }),
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
    // astra חלק ב': מציגים סכום *רק* כשיש מחיר מאומת (monthly_fee נקבע). הורה לא מזוהה
    //   / מסגרת ללא מחיר ודאי → מציעים הו"ק בלי סכום (לא מבטיחים ברירת מחדל כמחיר החיוב).
    const verifiedFee = session.collectedData.monthly_fee
    const fromSpot    = session.collectedData.from_spot_offer === 'true'

    // ── intro מותאם אישית — הסכום מוצג רק כשהוא מאומת ──────────────────────
    const personalInfo = childName
      ? `עבור *${childName}*${areaLabel ? ` (${areaLabel})` : ''}${verifiedFee ? ` - *${verifiedFee}₪/חודש*` : ''}\n\n`
      : ''

    const intro = fromSpot
      ? `מעולה! 🎉 נסדר עכשיו את התשלום עבור *${childName}*${areaLabel ? ` ב${areaLabel}` : ''}.\n\n`
      : `*הסדרת תשלום - Kids & Fun* 💛\n\n${personalInfo}`

    // §10-11: מציעים הוראת קבע *ישירות* כאופציה הראשית (לא תפריט 6 שיטות מראש).
    return verifiedFee
      ? { text: botText('payset_offer_standing',          { 'פתיחה': intro, 'סכום': verifiedFee }), nextFlow: 'payment_setup_offer' }
      : { text: botText('payset_offer_standing_no_price', { 'פתיחה': intro }),                      nextFlow: 'payment_setup_offer' }
  }

  // ─── §10-11: תגובת ההורה להצעת הוראת קבע ─────────────────────────────────
  if (step === 'payment_setup_offer') {
    const msg  = userMessage.trim()
    const core = confirmCore(msg)
    // astra חלק ב' (6): אזכור "ביטול" מסווג בזהירות — עוברים לביטול *רישום* רק בבקשה
    //   *חיובית וברורה*. שאלה ("אפשר לבטל...?") → LLM; שלילה ("לא רוצה לבטל") או ביטול
    //   *אמצעי התשלום* ("לבטל את הוראת הקבע") → בירור. לא כל אזכור ביטול = בקשת ביטול רישום.
    const raw = normalizeMessage(msg)
    const cm  = CANCEL_VERB_RE.exec(raw)
    if (cm) {
      // שאלה/בקשת הסבר ("לא רוצה לבטל כלום, רק תגידו איך הוראת קבע עובדת") → LLM
      if (isRealQuestion(msg) || EXPLAIN_RE.test(core)) return { text: '', useLLM: true }
      // שלילה *באותה פסוקית* של פועל הביטול ("לא רוצה לבטל") → החזרה להצעה.
      //   "לא, לבטל את הרישום" — ה-"לא" בפסוקית נפרדת (תשובה להצעה) → ממשיכים לניתוב.
      if (negatedInClause(raw, cm.index, cm.index + cm[0].length)) {
        return { text: botText('payset_offer_reask'), nextFlow: 'payment_setup_offer' }
      }
      // astra חלק ב' (10): המטרה נקראת מהפסוקית של פועל הביטול — "לא רוצה הוראת קבע, תבטלו לי את
      //   הרישום" = ביטול רישום (ה-"הוראת קבע" בפסוקית הסירוב, לא במושא הביטול).
      const { before, after } = clauseAround(raw, cm.index, cm.index + cm[0].length)
      const verbClause = confirmCore(`${before} ${cm[0]} ${after}`)
      const regTarget = CANCEL_REG_TARGET.test(verbClause)                               // ביטול *רישום*
      const payTarget = CANCEL_PAY_TARGET.test(verbClause)                               // ביטול *אמצעי תשלום*
      // astra חלק ב' (8): מנתבים לפי המטרה. רישום *בלבד* → ביטול; אמצעי-תשלום *בלבד* →
      //   חלופות; שתי המטרות יחד ("לבטל את הו"ק לצהרון") *או* עמימות ("רוצה לבטל") → בירור
      //   בשלב ייעודי, כדי שהתשובה הבאה תיקרא כמענה לבירור (לא כפתיחת רישום/כוונה חדשה).
      if (regTarget && !payTarget) {
        session.currentFlow = 'cancel_start'
        return handleCancellationFlow(session, msg)
      }
      if (payTarget && !regTarget) {
        return { text: botText('payset_intro_menu', { 'פתיחה': '' }), nextFlow: 'payment_setup_method' }
      }
      return { text: botText('payset_cancel_clarify'), nextFlow: 'payment_setup_cancel_choice' }
    }
    const verdict = offerVerdict(msg)
    // אישור (ביטוי שלם) → ממשיכים ישירות בהוראת קבע (זיהוי שם → לינק, כמו במסלול הקיים).
    if (verdict === 'accept') {
      session.collectedData.payment_method = 'standing_order'
      return {
        text: botText('payset_credit_ask_name', { 'סוג': '🏦 *הוראת קבע*' }),
        nextFlow: 'payment_setup_child_name',
      }
    }
    // שאלה אמיתית → LLM עונה, המסלול נשמר.
    if (verdict === 'question') return { text: '', useLLM: true }
    // סירוב / בקשת חלופה / נקיבת שיטה אחרת → תפריט החלופות (רק *אחרי* סירוב; הו"ק נשארת אופציה 2).
    if (verdict === 'refuse') {
      return { text: botText('payset_intro_menu', { 'פתיחה': '' }), nextFlow: 'payment_setup_method' }
    }
    // עמום ("כן אבל רגע"/"אולי") → הבהרה קצרה, נשארים בהצעה (לא קופצים לחלופות בלי סירוב).
    return { text: botText('payset_offer_reask'), nextFlow: 'payment_setup_offer' }
  }

  // ─── §10-11 (astra ב 8): מענה לבירור "מה תרצו לבטל?" ─────────────────────
  //   התשובה נקראת *כאן* (לא כפתיחת רישום/כוונה חדשה — השלב מחזיק את הכוונות הרלוונטיות).
  if (step === 'payment_setup_cancel_choice') {
    const msg  = userMessage.trim()
    const core = confirmCore(msg)
    // astra חלק ב' (9): אותן הגנות כמו בהצעה, *לפני* בחירת המטרה —
    //   שאלה ("מה יקרה לרישום?") → LLM; שלילה ("לא את הרישום") → בירור שוב.
    if (isRealQuestion(msg) || EXPLAIN_RE.test(core)) return { text: '', useLLM: true }
    // astra חלק ב' (10): שלילה נספרת רק כשהיא באותה פסוקית של מטרת-הרישום ("לא את הרישום" → בירור);
    //   "לא, את הרישום" (פסיק) → ניתוב רגיל. בקשה מפורשת לחלופה ("משהו אחר, לא הוראת קבע") → חלופות.
    // astra סבב 10 (P2): כל ביטוי-מטרה (רישום / תשלום / "שניהם") נקרא עם השלילה שבפסוקית שלו.
    //   שלילה של מטרה או של "שניהם" ("לא שניהם", "לא את התשלום") אינה בחירה בשום דבר → בירור.
    const raw  = normalizeMessage(msg)
    const target = (re: RegExp): 'yes' | 'negated' | 'none' => {
      const m = re.exec(raw)
      if (!m) return 'none'
      return negatedInClause(raw, m.index, m.index + m[0].length) ? 'negated' : 'yes'
    }
    const reg  = target(CANCEL_REG_TARGET)
    const pay  = target(/הוראת\s*ה?קבע|(^|\s)הו["'׳״]?\s*ק(\s|$)|תשלום|אמצעי/)
    const both = target(CANCEL_BOTH_RE)
    const wantsAlt = WANT_ALTERNATIVE_RE.test(core) && both === 'none'                  // "שתי האפשרויות"/"לא שתי האפשרויות" אינן בקשת חלופה
    // בקשת חלופה מפורשת (ביטוי שלם: "אפשרות אחרת"/"משהו אחר") בלי בחירה חיובית ברישום → חלופות,
    //   גם כשיש שלילה של הו"ק ("משהו אחר, לא הוראת קבע") - השלילה מחזקת את הבקשה, לא סותרת אותה.
    if (wantsAlt && reg !== 'yes') {
      return { text: botText('payset_intro_menu', { 'פתיחה': '' }), nextFlow: 'payment_setup_method' }
    }
    if (both === 'negated' || reg === 'negated' || pay === 'negated' || HESITATION_RE.test(core)) {  // שלילה/היסוס → בירור שוב
      return { text: botText('payset_cancel_clarify'), nextFlow: 'payment_setup_cancel_choice' }
    }
    // "שניהם"/"הכל" מפורש, או משפט שלם מהרשימה הסגורה (התאמה מלאה) → ביטול רישום
    //   (מבטל ממילא גם את הו"ק ב-PayPlus; יש שלב אישור נפרד לפני ביצוע).
    const bothSentence = (CANCEL_BOTH_SENTENCES as readonly string[]).includes(core)
    if (both === 'yes' || bothSentence) {
      session.currentFlow = 'cancel_start'
      return handleCancellationFlow(session, msg)
    }
    const wantsReg = reg === 'yes'
    const wantsPay = pay === 'yes' || wantsAlt
    if (wantsReg && !wantsPay) {                                                        // "את הרישום"/"צהרון" → ביטול רישום
      session.currentFlow = 'cancel_start'
      return handleCancellationFlow(session, msg)
    }
    if (wantsPay && !wantsReg) {                                                        // "אפשרות אחרת"/"תשלום" → חלופות
      return { text: botText('payset_intro_menu', { 'פתיחה': '' }), nextFlow: 'payment_setup_method' }
    }
    return { text: botText('payset_cancel_clarify'), nextFlow: 'payment_setup_cancel_choice' }  // עדיין לא ברור → בירור שוב
  }

  // ─── עיבוד בחירת שיטת תשלום ──────────────────────────────────────────────
  if (step === 'payment_setup_method') {
    const msg       = userMessage.trim()
    const childName = session.collectedData.child_name   ?? 'הילד/ה'
    const amount    = parseInt(session.collectedData.monthly_fee ?? String(getDefaultMonthlyFee()), 10)
    const firstName = session.parentName?.split(' ')[0] ?? ''

    // astra R6: בוחרים שיטה רק אם מילת המפתח מופיעה *ולא* בהקשר שלילה. כך
    // "לא הוראת קבע" / "אני לא מעוניין בהוראת קבע" אינם בוחרים הו"ק, ובקשה משולבת
    // "לא הוראת קבע, כן אשראי" בוחרת אשראי. ספרה מפורשת (1-6) גוברת על ניתוח טקסט.
    const digitPick: Record<string, PaymentMethod> = {
      '1': 'credit', '2': 'standing_order', '3': 'cash', '4': 'checks', '5': 'bank_transfer', '6': 'invoice_link',
    }
    const methodKeywords: Array<[PaymentMethod, RegExp]> = [
      ['credit',         /אשראי|כרטיס|credit/i],
      ['standing_order', /הוראת קבע|קבע|standing/i],
      ['cash',           /מזומן|cash/i],
      ['checks',         /צ.?ק|שיק|check/i],
      ['bank_transfer',  /העברה|בנק|transfer/i],
      ['invoice_link',   /קישור|חשבונית|invoice|link/i],
    ]
    // astra R6: שלילה צמודה לשיטה — *לפני* מילת המפתח או *אחריה*, בגבול הפסוקית
    // (עד פסיק/"אבל"/"אלא"). כך "הוראת קבע לא מתאימה לי" נשלל, ו-"הוראת קבע, לא אשראי"
    // לא שולל את הו"ק (ה-"לא אשראי" בפסוקית אחרת ושייך לאשראי).
    const CLAUSE_SEP = /[,.;:]|אבל|אלא|אך/
    const negRun = /לא\s*(רוצה|מתאים|צריכ|מעוני)|אינני\s*(רוצה|מעוני)/
    const negatedNear = (start: number, end: number): boolean => {
      const beforeClause = msg.slice(0, start).split(CLAUSE_SEP).pop() || ''
      const afterClause  = msg.slice(end).split(CLAUSE_SEP)[0] || ''
      const negBefore = /(לא|בלי|אינני|אין)[^א-ת]*$/.test(beforeClause) || negRun.test(beforeClause)
      const negAfter  = /(^|[^א-ת])(לא|בלי|אינני|אין)([^א-ת]|$)/.test(afterClause) || negRun.test(afterClause)
      return negBefore || negAfter
    }

    let chosenMethod: PaymentMethod | null = digitPick[msg] ?? null
    let sawNegatedMethod = false
    if (!chosenMethod) {
      for (const [method, kw] of methodKeywords) {
        const m = kw.exec(msg)
        if (!m || m.index == null) continue
        if (negatedNear(m.index, m.index + m[0].length)) { sawNegatedMethod = true; continue }
        chosenMethod = method
        break
      }
    }
    // שיטה נשללה בלי בחירה חלופית מפורשת → מציגים שוב את האפשרויות (astra R6)
    if (!chosenMethod && sawNegatedMethod) {
      return { text: botText('payset_method_invalid'), nextFlow: 'payment_setup_method' }
    }

    if (!chosenMethod) {
      return {
        text: botText('payset_method_invalid'),
        nextFlow: 'payment_setup_method',
      }
    }

    session.collectedData.payment_method = chosenMethod

    // ── אשראי / הוראת קבע → שאלות זיהוי לפני שליחת קישור ───────────────────
    // ⚠️ לא מסתמכים על מספר הטלפון של הפונה! הורה יכול לכתוב מטלפון לא מזוהה.
    // שואלים: שם הילד/ה המלא + אזור — ולפי האזור נשלח הלינק הנכון.
    if (chosenMethod === 'credit' || chosenMethod === 'standing_order') {
      return {
        text: botText('payset_credit_ask_name', {
          'סוג': chosenMethod === 'standing_order' ? '🏦 *הוראת קבע*' : '💳 *כרטיס אשראי*',
        }),
        nextFlow: 'payment_setup_child_name',
      }
    }

    // ── מזומן ────────────────────────────────────────────────────────────────
    if (chosenMethod === 'cash') {
      return {
        text: botText('payset_cash', {
          'סכום': String(amount),
          'המשך': isBusinessHours() ? 'נחזור אליך היום! 😊' : 'נחזור אליך בשעות הפעילות 💛',
        }),
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
        text: botText('payset_checks_ask'),
        nextFlow: 'payment_setup_checks',
      }
    }

    // ── העברה בנקאית ─────────────────────────────────────────────────────────
    if (chosenMethod === 'bank_transfer') {
      return {
        text: botText('payset_bank', { 'פרטי_בנק': formatBankTransferMessage(), 'סכום': String(amount) }),
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
          text: botText('payset_invoice_link', { 'קישור': invoiceUrl }),
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
        text: botText('payset_invoice_fallback', {
          'המשך': isBusinessHours()
            ? 'נציגה שלנו תשלח לך קישור תשלום עכשיו! 💛'
            : 'נשלח לך קישור תשלום בשעות הפעילות (8:00-17:00) 📬',
        }),
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
        text: botText('payment_status_name_invalid'),
        nextFlow: 'payment_setup_child_name',
      }
    }

    session.collectedData.child_name = nameInput
    session.collectedData.identity_confirmed = 'true'

    return {
      text: botText('payset_ask_area', { 'ילד': nameInput }),
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
        text: botText('payset_area_invalid'),
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
        text: botText('payset_school_reselect', { 'מסגרות': list.map((s, i) => `*${i + 1}* - ${s}`).join('\n') }),
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
        text: botText('payset_checks_invalid'),
        nextFlow: 'payment_setup_checks',
      }
    }

    const totalAmount = amount * numChecks

    return {
      text: botText('payset_checks_summary', {
        'מספר': String(numChecks),
        'סכום': String(amount),
        'סהכ': String(totalAmount),
        'חודש': new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' }),
        'המשך': isBusinessHours() ? 'ניצור קשר היום! 💛' : 'ניצור קשר בשעות הפעילות 💛',
      }),
      isComplete: true,
      createTask: {
        type:        'שאלה כללית',
        description: `צ׳קים — ${numChecks} צ׳קים × ${amount}₪ | ${childName} | לתיאום קבלת צ׳קים`,
        priority:    'גבוה',
      },
    }
  }

  return {
    text: botText('payset_restart'),
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

    if (unambiguousMatch(userMessage, CONFIRM_SPOT)) {
      // ← מעבר למסלול הסדרת תשלום
      session.collectedData.from_spot_offer = 'true'
      session.currentFlow = 'payment_setup_start'
      return handlePaymentSetupFlow(session, userMessage)
    }

    if (unambiguousMatch(userMessage, DECLINE_SPOT)) {
      return {
        text: botText('waitlist_declined'),
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
      text: botText('waitlist_unclear', { 'ילד': childName }),
      nextFlow: 'waiting_spot_confirm',
    }
  }

  return {
    text: botText('waitlist_restart'),
    nextFlow: 'waiting_spot_confirm',
  }
}
