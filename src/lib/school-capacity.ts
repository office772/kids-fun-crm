// ─── התאמת שמות מסגרות וספירת קיבולת ─────────────────────────────────────────
// children.school הוא טקסט חופשי לא-אחיד (סיומת " - עיר", גרשיים שונים).
// מנרמלים לצורך התאמה לשם המסגרת בטבלת schools.

const ACTIVE = ['ממתין לאישור', 'מאושר']

export function normSchool(s?: string | null): string {
  if (!s) return ''
  return s.split(' - ')[0]
    .replace(/["'״׳]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// מפה: שם-מסגרת-מנורמל → מספר רישומים פעילים (צהרון). לשימוש בפאנל הקיבולת.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function activeCountsBySchool(supabase: any): Promise<Record<string, number>> {
  const { data: regs } = await supabase
    .from('registrations')
    .select('status, child:children(school)')
    .in('status', ACTIVE)
  const counts: Record<string, number> = {}
  for (const r of (regs || []) as { child?: { school?: string } | { school?: string }[] }[]) {
    const c = Array.isArray(r.child) ? r.child[0] : r.child
    const key = normSchool(c?.school)
    if (key) counts[key] = (counts[key] || 0) + 1
  }
  return counts
}

// בדיקת מקום פנוי במסגרת מסוימת. מחזיר full=true רק אם הוגדר max_capacity והוא נוצל.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isSchoolFull(supabase: any, schoolName?: string | null): Promise<boolean> {
  const target = normSchool(schoolName)
  if (!target) return false
  const { data: school } = await supabase
    .from('schools')
    .select('name, max_capacity')
    .eq('name', schoolName)
    .maybeSingle()
  if (!school || school.max_capacity == null) return false   // opt-in: אין הגבלה ייעודית
  const counts = await activeCountsBySchool(supabase)
  return (counts[target] || 0) >= school.max_capacity
}
