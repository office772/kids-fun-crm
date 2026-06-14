export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('framework_staff')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()
  const { error } = await supabase.from('framework_staff').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
