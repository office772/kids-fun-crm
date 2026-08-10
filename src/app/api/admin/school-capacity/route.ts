export const dynamic = 'force-dynamic'

// ─── קיבולת לפי מסגרת/גן (בי"ס/גן) ───────────────────────────────────────────
// GET  — רשימת המסגרות לפי אזור, עם מקסימום נרשמים והספירה הנוכחית בפועל.
// PATCH — עדכון max_capacity למסגרת בודדת (null = ללא הגבלה ייעודית).
import { NextRequest, NextResponse } from 'next/server'
import { normSchool, activeCountsBySchool } from '@/lib/school-capacity'

const AREA_LABEL: Record<string, string> = { sharon: 'דרום השרון', carmel: 'חוף הכרמל', telaviv: 'תל אביב' }

export async function GET() {
  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()

  const { data: schools, error } = await supabase
    .from('schools')
    .select('id, name, area_code, max_capacity, is_active, sort_order')
    .order('area_code').order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ספירת רישומים פעילים לפי שם המסגרת (registrations → child.school)
  const counts = await activeCountsBySchool(supabase)

  type SchoolRow = { id: string; name: string; area_code: string; max_capacity: number | null }
  const rows = ((schools || []) as SchoolRow[]).map(s => ({
    id: s.id,
    name: s.name,
    area_code: s.area_code,
    area_label: AREA_LABEL[s.area_code] || s.area_code,
    max_capacity: s.max_capacity,           // יכול להיות null
    registered: counts[normSchool(s.name)] || 0,
  }))
  return NextResponse.json({ schools: rows })
}

export async function PATCH(req: NextRequest) {
  const { id, max_capacity } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id נדרש' }, { status: 400 })
  // null מותר (הסרת הגבלה); אחרת חייב מספר אי-שלילי
  const value = max_capacity === null || max_capacity === '' ? null : Number(max_capacity)
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    return NextResponse.json({ error: 'max_capacity לא תקין' }, { status: 400 })
  }
  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()
  const { error } = await supabase.from('schools').update({ max_capacity: value }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
