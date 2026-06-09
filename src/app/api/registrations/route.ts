export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { isDemoMode, DEMO_REGISTRATIONS } from '@/lib/demo-data'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const type = searchParams.get('type')
  const parentId = searchParams.get('parent_id')

  if (isDemoMode()) {
    let data = DEMO_REGISTRATIONS
    if (status) data = data.filter(r => r.status === status)
    if (type) data = data.filter(r => r.type === type)
    if (parentId) data = data.filter(r => r.parent_id === parentId)
    return NextResponse.json(data)
  }

  const { createServiceClient } = await import("@/lib/supabase/server")
  const supabase = createServiceClient()

  let query = supabase
    .from('registrations')
    .select('*, parent:parents(id, name, phone), child:children(id, name, class_name, framework)')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (type) query = query.eq('type', type)
  if (parentId) query = query.eq('parent_id', parentId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { ids } = await req.json()
  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: 'ids required' }, { status: 400 })

  if (isDemoMode()) return NextResponse.json({ deleted: ids.length })

  const { createServiceClient } = await import("@/lib/supabase/server")
  const supabase = createServiceClient()
  const { error } = await supabase.from('registrations').delete().in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: ids.length })
}
