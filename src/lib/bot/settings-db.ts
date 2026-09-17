// ─── קריאה/כתיבה של טבלת settings (key/value) ────────────────────────────────
// כל ההגדרות שהלקוח עורך בדשבורד יושבות בטבלת `settings` (key primary key, value,
// description). זו שכבת הגישה הכללית — פאזה 1 ואילך משתמשות בה.
//
// ⚠️ כלל־ברזל: קריאה תמיד עם fallback. כשל DB → מפה ריקה, והקורא נופל לערך הקשיח.
//    הבוט לעולם לא נשבר בגלל הגדרה חסרה.
import { createServiceClient } from '@/lib/supabase/server'

export interface SettingEntry {
  key: string
  value: string
  description?: string
}

// כל ההגדרות כמפה key→value. כשל/ריק → {} (בטוח — הקורא ייפול ל-fallback שלו).
export async function getAllSettings(): Promise<Record<string, string>> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase.from('settings').select('key, value')
    const map: Record<string, string> = {}
    for (const row of (data || []) as { key: string; value: string }[]) {
      map[row.key] = row.value
    }
    return map
  } catch {
    return {}
  }
}

// קריאת ערך בודד עם fallback.
export async function getSetting(key: string, fallback: string): Promise<string> {
  const all = await getAllSettings()
  const v = all[key]
  return v === undefined || v === null || v === '' ? fallback : v
}

// כתיבה/עדכון של הגדרה אחת או כמה בבת אחת (upsert לפי key).
export async function upsertSettings(entries: SettingEntry[]): Promise<void> {
  if (!entries.length) return
  const supabase = createServiceClient()
  const { error } = await supabase.from('settings').upsert(entries, { onConflict: 'key' })
  if (error) throw new Error(error.message)
  _settingsCache = null // הכתיבה מבטלת cache מקומי (בקשות אחר כך יטענו מחדש)
}

// ─── cache פר-בקשה לקריאה *סינכרונית* מתוך flows ──────────────────────────────
// isBusinessHours ומחיר ברירת המחדל נקראים סינכרונית בעשרות מקומות בתוך המסלולים.
// במקום עשרות קריאות DB — מזריקים primeSettingsCache() *פעם אחת* בתחילת כל בקשת
// webhook/סימולטור, והקוראים משתמשים ב-getCachedSettings().
//
// ⚠️ כשלא הוזרק (למשל ב-replay-bot בלי DB) או כש-TTL פג → מפה ריקה, והקורא נופל
//    לערך הקשיח. כך ההתנהגות זהה *בדיוק* להיום כשאין הגדרה.
let _settingsCache: { at: number; map: Record<string, string> } | null = null
const CACHE_TTL_MS = 60_000

// טעינה חד-פעמית של כל ה-settings ל-cache (בתחילת בקשה). מחזיר גם את המפה.
export async function primeSettingsCache(): Promise<Record<string, string>> {
  const map = await getAllSettings()
  _settingsCache = { at: Date.now(), map }
  return map
}

// קריאה סינכרונית מה-cache. לא הוזרק / פג → {} (הקורא ייפול ל-fallback).
export function getCachedSettings(): Record<string, string> {
  if (_settingsCache && Date.now() - _settingsCache.at < CACHE_TTL_MS) {
    return _settingsCache.map
  }
  return {}
}
