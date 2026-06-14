export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

// GET /api/frameworks — רשימת המסגרות + אנשי הצוות שלהן
export async function GET() {
  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()
  const { data: frameworks, error } = await supabase
    .from('frameworks')
    .select('*, staff:framework_staff(*)')
    .order('area_code')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(frameworks ?? [])
}

// POST /api/frameworks — יצירת מסגרת חדשה (בעיקר לקייטנות)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, area_code, type, notes } = body
  if (!name || !area_code || !type) {
    return NextResponse.json({ error: 'name + area_code + type required' }, { status: 400 })
  }
  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('frameworks').insert({ name, area_code, type, notes: notes || null })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
