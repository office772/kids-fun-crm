export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

// POST /api/frameworks/staff — הוספת איש צוות למסגרת
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { framework_id, name, phone, email, role, sort_order } = body
  if (!framework_id || !name) {
    return NextResponse.json({ error: 'framework_id + name required' }, { status: 400 })
  }
  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('framework_staff')
    .insert({
      framework_id, name,
      phone: phone || null, email: email || null,
      role: role || null, sort_order: sort_order ?? 0,
    })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
