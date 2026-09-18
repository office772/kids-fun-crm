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
