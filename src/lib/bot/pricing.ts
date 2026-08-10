// ─── מודל תמחור הצהרון (אושר ע"י קורלי 2026-06-22) ───────────────────────────
// המחיר נקבע לפי בית-הספר/הגן (ולעיתים הכיתה), לא לפי אזור.
// מקור התשובות: docs/payplus-links-mapping.md ("תשובות קורלי").
//
// ⚠️ אם שינוי מחיר עתידי — לעדכן כאן (וקורלי מעדכנת את הסכום בלינק ב-PayPlus).
// resolveMonthlyFee מחזיר null כשאי-אפשר לקבוע מחיר בוודאות — אז הבוט
// לא ייצר לינק עם סכום מנוחש אלא יפנה לנציגה.

// תל אביב — 5 גני "המערכה" (כולל אבטחה) = ₪991
const TA_991 = ['זיו', 'יערה', 'מכחול', 'מניפה', 'צבעי הקשת']
// תל אביב — שאר הגנים = ₪946
const TA_946 = ['אריגן', 'גן ארי', 'יצירה', 'לביא', 'ציור', 'אילון', 'ירדן', 'פולג', 'נחשון', 'געתון', 'גולן', 'ערבה']

// חילוץ אות הכיתה (א/ב/ג/ד/ה/ו) משם כיתה חופשי כמו "כיתה ג'", "ב1", "א".
// מחזיר '' לגנים ("גן חובה") או כשאין כיתה ברורה.
function gradeOf(className?: string | null): string {
  if (!className) return ''
  const c = className.replace('כיתה', '').replace(/['"׳]/g, '').trim()
  if (c.startsWith('גן')) return ''
  const first = c[0] ?? ''
  return 'אבגדהו'.includes(first) ? first : ''
}

export interface FeeContext {
  area_code?:  string | null
  school?:     string | null
  class_name?: string | null
}

// מחזיר את שכר הלימוד החודשי הבסיסי (₪), או null אם לא ניתן לקבוע בוודאות.
// (הנחות עתלית — אח / רישום חלקי — מחושבות בנפרד בזרימת הבוט, שלב 3.)
export function resolveMonthlyFee(ctx: FeeContext): number | null {
  const school = (ctx.school ?? '').trim()
  if (!school) return null

  // חוף הכרמל — גלי עתלית: ₪1,150 אחיד לכל הכיתות, כולל שמות הקבוצות שבתוכו
  // (פיטר פן / דרדסים / החתול במגפיים — אישרה קורלי 2026-06-23).
  // ⚠️ 'גלי עתלית' ולא 'עתלית' (האזור מצורף לשם). משעולים / אדוות גיא / כוכב הצפון /
  //    מעבר אפק = קייטנות בלבד → תשלום דרך האתר, לא PayPlus → לא מתומחרים כאן.
  const ATLIT = ['גלי עתלית', 'פיטר פן', 'דרדסים', 'החתול במגפיים']
  if (ATLIT.some(g => school.includes(g))) return 1150

  // שרון
  if (school.includes('מתן')) {
    const g = gradeOf(ctx.class_name)
    if (g === 'א' || g === 'ב') return 916
    if (g === 'ג') return 1015
    return null // כיתה לא ודאית במתן → לא לנחש מחיר
  }
  if (school.includes('חצב') || school.includes('אלמוג')) return 1470

  // תל אביב
  if (TA_991.some(g => school.includes(g))) return 991
  if (TA_946.some(g => school.includes(g))) return 946

  return null
}
