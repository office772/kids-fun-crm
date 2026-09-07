// ─── מספרי בדיקה דינמיים (מנוהלים דרך הדשבורד) ──────────────────────────────
// מקור אמת: TEST_PHONES הקבועים (base — תמיד מורשים, לא ניתנים למחיקה מה-UI)
// + רשימה דינמית שאייל/עינת מוסיפים דרך הדשבורד, נשמרת ב-Supabase (טבלת settings,
// key='test_phones_extra', value=CSV).
//
// ⚠️ בטיחות: ה-whitelist הוא ההגנה היחידה בין הבוט להורים אמיתיים. לכן:
//   - אם קריאת ה-DB נכשלת או ריקה → נשארים רק ה-base הקבועים (לא נפתח לכולם בטעות).
//   - "רשימה ריקה = כולם מורשים" חלה רק על ה-base הקבוע (isTestPhone), לא על ה-DB.
import { createServiceClient } from '@/lib/supabase/server'
import { TEST_PHONES, normIntl, isTestPhone } from './test-phones'

const SETTINGS_KEY = 'test_phones_extra'

// המספרים הדינמיים מה-DB (מנורמלים ל-972...). כשל/ריק → [] (בטוח).
export async function getDynamicTestPhones(): Promise<string[]> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
    if (!data?.value) return []
    return (data.value as string)
      .split(',').map(s => s.trim()).filter(Boolean).map(normIntl)
  } catch {
    return []
  }
}

// כל המספרים המורשים, מופרדים: base קבוע + extra דינמי (ללא כפילויות).
export async function getAllTestPhones(): Promise<{ base: string[]; extra: string[] }> {
  const base = TEST_PHONES.map(normIntl)
  const extra = (await getDynamicTestPhones()).filter(p => !base.includes(p))
  return { base, extra }
}

// האם המספר מורשה — base קבוע (או base ריק = כולם) או דינמי מה-DB.
// כשל DB → רק base (בטוח, לא נפתח לכולם).
export async function isAllowedPhoneAsync(raw: string): Promise<boolean> {
  if (isTestPhone(raw)) return true
  const digits = normIntl(raw)
  const extra = await getDynamicTestPhones()
  return extra.includes(digits)
}

// הוספת מספר לרשימה הדינמית. מחזיר את רשימת ה-extra המעודכנת.
export async function addTestPhone(raw: string): Promise<string[]> {
  const digits = normIntl(raw)
  if (!/^972\d{8,9}$/.test(digits)) {
    throw new Error('מספר לא תקין — הקלד מספר ישראלי (למשל 0501234567)')
  }
  const base = TEST_PHONES.map(normIntl)
  const current = await getDynamicTestPhones()
  if (base.includes(digits) || current.includes(digits)) return current // כבר קיים
  const updated = [...current, digits]
  await writeExtra(updated)
  return updated
}

// הסרת מספר מהרשימה הדינמית (base קבוע לא ניתן להסרה).
export async function removeTestPhone(raw: string): Promise<string[]> {
  const digits = normIntl(raw)
  const current = await getDynamicTestPhones()
  const updated = current.filter(p => p !== digits)
  await writeExtra(updated)
  return updated
}

async function writeExtra(list: string[]): Promise<void> {
  const supabase = createServiceClient()
  await supabase.from('settings').upsert(
    {
      key: SETTINGS_KEY,
      value: list.join(','),
      description: 'מספרי בדיקה שנוספו דרך הדשבורד (מעבר ל-TEST_PHONES הקבועים)',
    },
    { onConflict: 'key' },
  )
}
