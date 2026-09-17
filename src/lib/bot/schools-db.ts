// ─── קריאה/cache של מסגרות (טבלת schools) ────────────────────────────────────
// המסגרות (גנים/בתי"ס) משתנות כל שנה — הלקוח מנהל אותן בפאנל (הוספה/עריכה/כיבוי,
// כולל מחיר חודשי). הבוט קורא מחיר לפי מסגרת מכאן (עם fallback ל-pricing.ts).
//
// ⚠️ כמו ה-settings — cache פר-בקשה לקריאה סינכרונית מתוך resolveMonthlyFee.
//    לא הוזרק / כשל DB → [] → הקורא נופל לתמחור הקשיח (התנהגות ללא שינוי).
import { createServiceClient } from '@/lib/supabase/server'

export interface SchoolRow {
  id:            string
  name:          string
  area_code:     string
  city:          string | null
  monthly_price: number | null
  max_capacity:  number | null
  is_active:     boolean
  sort_order:    number | null
}

const COLUMNS = 'id, name, area_code, city, monthly_price, max_capacity, is_active, sort_order'

export async function getAllSchools(): Promise<SchoolRow[]> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('schools').select(COLUMNS)
      .order('area_code').order('sort_order')
    return (data || []) as SchoolRow[]
  } catch {
    return []
  }
}

// ─── cache פר-בקשה ────────────────────────────────────────────────────────────
let _cache: { at: number; rows: SchoolRow[] } | null = null
const CACHE_TTL_MS = 60_000

export async function primeSchoolsCache(): Promise<SchoolRow[]> {
  const rows = await getAllSchools()
  _cache = { at: Date.now(), rows }
  return rows
}

export function getCachedSchools(): SchoolRow[] {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.rows
  return []
}

export function invalidateSchoolsCache(): void { _cache = null }

// גרעין שם להשוואה — מסיר קידומות בי"ס/גן וגרשיים (כמו areaFromSchoolName).
function schoolCore(name: string): string {
  return (name || '')
    .replace(/^\s*(בי["׳']?ס|בית ספר|בית-ספר|גן|גני|ביה["׳']?ס)\s+/, '')
    .replace(/["׳'״]/g, '')
    .trim()
}

// מחיר חודשי לפי שם מסגרת חופשי — רק אם יש התאמה *יחידה* פעילה עם מחיר. אחרת null.
// זהו המקור המועדף ב-resolveMonthlyFee (הלקוח עורך אותו), עם fallback לקשיח.
export function priceFromCachedSchools(schoolText: string | null | undefined): number | null {
  const rows = getCachedSchools()
  const needle = schoolCore(schoolText || '')
  if (!rows.length || needle.length < 3) return null

  const prices = rows
    .filter(r => r.is_active && typeof r.monthly_price === 'number' && r.monthly_price > 0)
    .filter(r => {
      const core = schoolCore(r.name)
      return core.length >= 3 && (needle.includes(core) || core.includes(needle))
    })
    .map(r => r.monthly_price as number)

  const unique = Array.from(new Set(prices))
  return unique.length === 1 ? unique[0] : null
}
