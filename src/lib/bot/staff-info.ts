// ─── פרטי הצוות/המסגרת של ההורה — כהקשר ל-LLM ────────────────────────────────
// לא מסלול נפרד: המידע מוזרק לתוך ההקשר של הבוט, כדי שכשהורה שואל על הגן/הצוות
// שלו (או כל דבר) — הבוט "יודע" גם את זה ויכול לשלב בתשובה.
import { createServiceClient } from '@/lib/supabase/server'

function nameMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  const x = a.trim(), y = b.trim()
  return x === y || x.includes(y) || y.includes(x)
}

function one<T>(x: T | T[] | null | undefined): T | undefined {
  return Array.isArray(x) ? x[0] : (x ?? undefined)
}

// מחזיר משפט הקשר עם המסגרת+צוות של ההורה, או null אם לא ניתן לזהות.
export async function buildStaffContext(phone: string): Promise<string | null> {
  if (!phone) return null
  const supabase = createServiceClient()
  const cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '972')

  const { data: parents } = await supabase
    .from('parents')
    .select('id, children:children(name, school, framework)')
    .or(`phone.eq.${cleanPhone},phone.eq.${phone}`)
    .limit(1)
  const parent = one(parents as unknown as { children?: unknown }[])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children = ((parent?.children ?? []) as any[])
  if (children.length === 0) return null

  const { data: fwsRaw } = await supabase
    .from('frameworks')
    .select('name, type, is_active, staff:framework_staff(name, role, is_active)')
    .eq('is_active', true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fws = (fwsRaw ?? []) as any[]

  const parts: string[] = []
  for (const child of children) {
    if (!child.school) continue
    const match = fws.find(fw =>
      nameMatch(child.school, fw.name) &&
      (child.framework === 'שניהם' || !child.framework || child.framework === fw.type)
    )
    if (!match) {
      parts.push(`${child.name} רשום/ה ל${child.school}.`)
      continue
    }
    const staff = ((match.staff ?? []) as { name: string; role?: string; is_active: boolean }[])
      .filter(s => s.is_active !== false && s.name)
      .map(s => `${s.name}${s.role ? ` (${s.role})` : ''}`)
    if (staff.length > 0) {
      parts.push(`${child.name} במסגרת "${match.name}" (${match.type}); הצוות: ${staff.join(', ')}.`)
    } else {
      parts.push(`${child.name} במסגרת "${match.name}" (${match.type}).`)
    }
  }

  if (parts.length === 0) return null
  return 'מסגרת/צוות ההורה (השתמש במידע הזה אם ההורה שואל על הגן/הצוות שלו; אל תמציא פרטים שאינם כאן): ' + parts.join(' ')
}
