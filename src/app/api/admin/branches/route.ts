export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET — שלוף כל האזורים עם קיבולת + נרשמים עכשיו
export async function GET() {
  const supabase = createServiceClient()

  const { data: branches, error } = await supabase
    .from('branches')
    .select('id, name, area_code, max_capacity, form_link')
    .order('area_code')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // לכל אזור — ספור רישומים פעילים + רשימת המתנה
  const enriched = await Promise.all((branches ?? []).map(async (b: typeof branches[number]) => {
    const [{ count: active }, { count: waiting }] = await Promise.all([
      supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('area_code', b.area_code)
        .eq('type', 'צהרון')
        .in('status', ['ממתין לאישור', 'מאושר']),
      supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('area_code', b.area_code)
        .eq('type', 'צהרון')
        .eq('status', 'רשימת המתנה'),
    ])
    return {
      ...b,
      active:  active  ?? 0,
      waiting: waiting ?? 0,
    }
  }))

  return NextResponse.json(enriched)
}

// PUT — עדכן max_capacity לפי area_code
export async function PUT(req: NextRequest) {
  const { area_code, max_capacity } = await req.json()

  if (!area_code || typeof max_capacity !== 'number' || max_capacity < 0) {
    return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('branches')
    .update({ max_capacity })
    .eq('area_code', area_code)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
