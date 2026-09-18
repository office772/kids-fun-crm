// ─── טקסט הודעות בוט קבועות — עריכה מהפאנל (טקסט בלבד, משתנים נעולים) ─────────
// הלקוח עורך את *הטקסט* של הודעות הבוט; המשתנים ({שם}, {אזור}, {תפריט}...) נעולים.
// מקור האמת ל-defaults + לרשימת המשתנים הוא BOT_MESSAGE_REGISTRY כאן (כדי שברירת
// המחדל בקוד ורשימת המשתנים לא יתפצלו). ה-DB מחזיק רק *דריסות*.
//
// ⚠️ כלל־ברזל: אם אין דריסה, או שהיא לא-פעילה, או שהמשתנים שלה לא תואמים למותר —
//    נופלים לברירת המחדל בקוד. כך הבוט לעולם לא שולח הודעה עם משתנה שבור,
//    וכשאין cache (replay/כשל DB) ההתנהגות זהה בדיוק להיום.
import { createServiceClient } from '@/lib/supabase/server'

export interface BotMessageDef {
  label:    string   // שם קריא לעורך
  category: string   // קיבוץ במסך
  default:  string   // ברירת המחדל (בדיוק כמו הטקסט שהיה קשיח)
  vars:     string[] // המשתנים המותרים/נדרשים (חייבים להישמר בעריכה)
}

// ─── הרג'יסטרי — סט התחלה (פאזה 4). מרחיבים בהדרגה: מוסיפים מפתח + מחווטים call-site.
export const BOT_MESSAGE_REGISTRY: Record<string, BotMessageDef> = {
  menu: {
    label: 'תפריט ראשי (1–6)',
    category: 'כללי',
    vars: [],
    default:
      `*1* — רישום לצהרון\n` +
      `*2* — רישום לקייטנה\n` +
      `*3* — ביטול\n` +
      `*4* — שעות ולוח זמנים\n` +
      `*5* — תשלומים\n` +
      `*6* — איסוף מוקדם`,
  },
  did_not_understand: {
    label: 'כשהבוט לא הבין',
    category: 'כללי',
    vars: ['תפריט'],
    default: `לא הצלחתי להבין 😊\n\nאפשר לבחור מהתפריט:\n\n{תפריט}`,
  },
  escalation_business_hours: {
    label: 'העברה לנציגה (בשעות הפעילות)',
    category: 'העברה לנציגה',
    vars: [],
    default: `העברתי את פנייתך לקורלי, הנציגה שלנו — היא תחזור אליך בהקדם 💛`,
  },
  escalation_after_hours: {
    label: 'העברה לנציגה (מחוץ לשעות)',
    category: 'העברה לנציגה',
    vars: [],
    default: `קיבלתי! העברתי לקורלי, הנציגה שלנו, והיא תחזור אליך בשעות הפעילות (ראשון-חמישי 8:00-17:00) 📬\n\nלילה טוב! 🌙`,
  },
  area_confirmed: {
    label: 'אישור בחירת אזור (ברישום)',
    category: 'רישום',
    vars: ['אזור'],
    default: `עדכנתי: אזור *{אזור}* ✅\n\n*מה שם הילד/ה?* (שם פרטי + שם משפחה)`,
  },

  // ─── לו"ז ───────────────────────────────────────────────────────────────────
  schedule_no_faq: {
    label: 'שעות/חגים — כשאין תשובה שמורה',
    category: 'לו״ז',
    vars: [],
    default: `אשמח לעזור! 😊\n\nלשעות הפעילות ולוח החגים המעודכן — נציגה שלנו תשלח לך את הפרטים המדויקים בהקדם 💛`,
  },

  // ─── איסוף מוקדם ────────────────────────────────────────────────────────────
  pickup_start: {
    label: 'איסוף מוקדם — פתיחה',
    category: 'איסוף מוקדם',
    vars: [],
    default: `👋 *בקשת איסוף מוקדם*\n\n*מה שם הילד/ה* שתרצו לאסוף?`,
  },
  pickup_ask_time: {
    label: 'איסוף מוקדם — שאלת שעה',
    category: 'איסוף מוקדם',
    vars: ['ילד'],
    default: `*{ילד}* — *באיזו שעה* תרצו לאסוף?`,
  },
  pickup_time_retry: {
    label: 'איסוף מוקדם — שעה לא ברורה',
    category: 'איסוף מוקדם',
    vars: [],
    default: `רק כדי לא לטעות — *באיזו שעה* לאסוף? 🕒\n_(לדוגמה: 15:00, "בשלוש", "3 וחצי")_`,
  },
  pickup_ask_collector: {
    label: 'איסוף מוקדם — מי יאסוף',
    category: 'איסוף מוקדם',
    vars: ['שעה'],
    default: `שעה *{שעה}* ✅\n\n*מי יאסוף?*\n(שם + קרבה, למשל: "אבא דני" / "סבתא שרה")`,
  },
  pickup_confirm: {
    label: 'איסוף מוקדם — אישור',
    category: 'איסוף מוקדם',
    vars: ['ילד', 'שעה', 'אוסף'],
    default: `✅ *בקשת האיסוף התקבלה!*\n\n👧 ילד/ה: *{ילד}*\n⏰ שעה: *{שעה}*\n🚗 אוסף/ת: *{אוסף}*\n\nהצוות עודכן ויהיה מוכן 😊`,
  },
  pickup_restart: {
    label: 'איסוף מוקדם — התחלה מחדש',
    category: 'איסוף מוקדם',
    vars: [],
    default: `😊 כתבו *"איסוף מוקדם"* להתחיל מחדש.`,
  },

  // ─── עלויות ─────────────────────────────────────────────────────────────────
  cost_monthly: {
    label: 'עלות — צהרון חודשי',
    category: 'עלויות',
    vars: ['אזור', 'סכום'],
    default:
      `📅 *עלות חודשית צהרון — Kids & Fun*\n\n` +
      `העלות החודשית {אזור} היא *{סכום}₪* (כולל מע"מ).\n\n` +
      `*כולל:*\n` +
      `✅ ליווי מקצועי ראשון-חמישי\n` +
      `✅ ארוחת צהריים וחטיפים\n` +
      `✅ פעילויות חינוכיות\n\n` +
      `התשלום מתבצע בתחילת כל חודש.\n\n` +
      `רוצים להסדיר תשלום? כתבו *"תשלום"* 💳`,
  },
  cost_camp: {
    label: 'עלות — קייטנת קיץ',
    category: 'עלויות',
    vars: [],
    default:
      `☀️ *קייטנה קיץ — Kids & Fun*\n\n` +
      `הקייטנה משולמת *מראש במלואה* בעת הרישום.\n\n` +
      `*מחיר הקייטנה:* החל מ-*1,200₪* (תלוי בתוכנית ומשך).\n\n` +
      `*כולל:*\n` +
      `✅ פעילויות יומיות מגוונות\n` +
      `✅ טיולים שבועיים\n` +
      `✅ ארוחות כלולות\n\n` +
      `_פרטים מלאים ועלות מדויקת — צרו קשר לרישום_ 💛`,
  },
  cost_siblings: {
    label: 'עלות — הנחת אחים',
    category: 'עלויות',
    vars: [],
    default:
      `👨‍👩‍👧‍👦 *הנחת אחים — Kids & Fun*\n\n` +
      `מ-2 ילדים ומעלה מאותה משפחה:\n\n` +
      `✅ *ילד ראשון* — מחיר מלא\n` +
      `✅ *ילד שני ואילך* — *הנחה של 10%*\n\n` +
      `ההנחה מחושבת אוטומטית בעת הרישום.\n\n` +
      `_לרישום ילד נוסף — כתבו "רישום" ונתחיל_ 🎒`,
  },
  cost_other_prompt: {
    label: 'עלות — שאלה אחרת (הזמנה לכתוב)',
    category: 'עלויות',
    vars: [],
    default:
      `💬 *שאלות נוספות על עלות*\n\n` +
      `כתבו את שאלתכם בחופשיות — אנסה לענות! 😊\n\n` +
      `_לדוגמה: "יש הנחה לחד הורי?" / "מה אם ביטלנו באמצע חודש?"_`,
  },
  cost_not_understood: {
    label: 'עלות — לא הבנתי (תפריט)',
    category: 'עלויות',
    vars: [],
    default:
      `לא הבנתי 😊\n\n` +
      `*1* — 📅 עלות חודשית צהרון\n` +
      `*2* — ☀️ תשלום מראש לקייטנה\n` +
      `*3* — 👨‍👩‍👧‍👦 הנחת אחים / אחיות\n` +
      `*4* — 💬 שאלה אחרת`,
  },

  // ─── תשלומים — בדיקת סטטוס ───────────────────────────────────────────────────
  payment_menu: {
    label: 'תשלומים — תפריט ראשי',
    category: 'תשלומים',
    vars: ['ברכה'],
    default:
      `💰 *תשלומים — Kids & Fun*\n\n` +
      `{ברכה}על מה תרצו לשאול?\n\n` +
      `*1* — סטטוס התשלום שלי\n` +
      `*2* — לשנות שיטת תשלום\n` +
      `*3* — לא עבר תשלום / בעיה\n` +
      `*4* — מה העלות החודשית?\n` +
      `*5* — 💳 להסדיר תשלום חדש`,
  },
  payment_status_ask_child: {
    label: 'סטטוס — בקשת שם לזיהוי',
    category: 'תשלומים',
    vars: [],
    default:
      `🔍 *בדיקת סטטוס תשלום*\n\n` +
      `לא מצאתי את המספר שלך במערכת — בוא/י נזהה אותך:\n\n` +
      `*מה שם הילד/ה? (שם פרטי + שם משפחה)*`,
  },
  payment_method_change_menu: {
    label: 'תשלומים — שינוי שיטת תשלום',
    category: 'תשלומים',
    vars: [],
    default:
      `*שינוי שיטת תשלום* — נשמח לעזור! 💛\n\n` +
      `*באיזו שיטה הייתם רוצים להמשיך?*\n\n` +
      `*1* — 💳 כרטיס אשראי (PayPlus)\n` +
      `*2* — 🏦 הוראת קבע (PayPlus)\n` +
      `*3* — 💵 מזומן\n` +
      `*4* — 📝 צ׳קים\n` +
      `*5* — 🏛️ העברה בנקאית`,
  },
  cost_info_menu: {
    label: 'עלות — תפריט שאלות',
    category: 'עלויות',
    vars: [],
    default:
      `💰 *שאלות עלות — Kids & Fun*\n\n` +
      `על מה תרצו לדעת?\n\n` +
      `*1* — 📅 עלות חודשית צהרון\n` +
      `*2* — ☀️ תשלום מראש לקייטנה\n` +
      `*3* — 👨‍👩‍👧‍👦 הנחת אחים / אחיות\n` +
      `*4* — 💬 שאלה אחרת על עלות`,
  },
  payment_status_name_invalid: {
    label: 'סטטוס — שם לא תקין',
    category: 'תשלומים',
    vars: [],
    default:
      `צריך שם מלא לצורך זיהוי 😊\n\n` +
      `*אנא כתבו שם פרטי + שם משפחה של הילד/ה*\n` +
      `_(למשל: נועה כהן)_`,
  },
  payment_status_unidentified: {
    label: 'סטטוס — מספר לא מזוהה',
    category: 'תשלומים',
    vars: [],
    default:
      `המספר הזה לא מופיע אצלנו במערכת 🤔\n\n` +
      `העברתי לקורלי, הנציגה שלנו, שתבדוק ותחזור אליך 💛`,
  },
  payment_status_no_data: {
    label: 'סטטוס — נמצא ילד אך אין נתוני תשלום',
    category: 'תשלומים',
    vars: ['ילד', 'המשך'],
    default: `🔍 לא הצלחתי לאתר את פרטי התשלום של *{ילד}*.\n\n{המשך}`,
  },
}

// ─── עוזרי משתנים ─────────────────────────────────────────────────────────────
export function extractPlaceholders(text: string): string[] {
  const out: string[] = []
  const re = /\{([^}]+)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text || '')) !== null) {
    const t = m[1].trim()
    if (!out.includes(t)) out.push(t)
  }
  return out
}

// האם הטקסט מכיל *בדיוק* את המשתנים המותרים (לא חסר, לא נוסף)?
export function placeholdersMatch(text: string, required: string[]): boolean {
  const found = new Set(extractPlaceholders(text))
  if (found.size !== required.length) return false
  for (const r of required) if (!found.has(r)) return false
  return true
}

function interpolate(template: string, vars?: Record<string, string>): string {
  if (!vars) return template
  return template.replace(/\{([^}]+)\}/g, (m, name) => {
    const k = String(name).trim()
    return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m
  })
}

// ─── DB + cache פר-בקשה ───────────────────────────────────────────────────────
export interface BotMessageRow { key: string; text: string; is_active: boolean }

export async function getAllBotMessages(): Promise<Record<string, BotMessageRow>> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase.from('bot_messages').select('key, text, is_active')
    const map: Record<string, BotMessageRow> = {}
    for (const r of (data || []) as BotMessageRow[]) map[r.key] = r
    return map
  } catch {
    return {}
  }
}

let _cache: { at: number; map: Record<string, BotMessageRow> } | null = null
const CACHE_TTL_MS = 60_000

export async function primeBotMessagesCache(): Promise<Record<string, BotMessageRow>> {
  const map = await getAllBotMessages()
  _cache = { at: Date.now(), map }
  return map
}

export function getCachedBotMessages(): Record<string, BotMessageRow> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.map
  return {}
}

export function invalidateBotMessagesCache(): void { _cache = null }

// ─── הפונקציה שהבוט קורא ──────────────────────────────────────────────────────
// botText(key, vars) — טקסט ההודעה (דריסת DB תקינה, אחרת ברירת מחדל) + הזרקת משתנים.
// שם 'botText' (לא 'msg') כדי לא להתנגש בפרמטר msg הנפוץ ב-flows.ts.
export function botText(key: string, vars?: Record<string, string>): string {
  const reg = BOT_MESSAGE_REGISTRY[key]
  const fallback = reg?.default ?? ''
  const cached = getCachedBotMessages()[key]

  let template = fallback
  if (reg && cached && cached.is_active && placeholdersMatch(cached.text, reg.vars)) {
    template = cached.text
  }
  return interpolate(template, vars)
}

// ─── עבור מסך העריכה — מיזוג רג'יסטרי + דריסות DB ─────────────────────────────
export interface EditableMessage {
  key: string; label: string; category: string; vars: string[]
  default: string; text: string; is_active: boolean; overridden: boolean
}

export async function listEditableMessages(): Promise<EditableMessage[]> {
  const overrides = await getAllBotMessages()
  return Object.entries(BOT_MESSAGE_REGISTRY).map(([key, def]) => {
    const o = overrides[key]
    return {
      key, label: def.label, category: def.category, vars: def.vars,
      default: def.default,
      text: o ? o.text : def.default,
      is_active: o ? o.is_active : true,
      overridden: !!o,
    }
  })
}
