import { NextRequest, NextResponse } from 'next/server'
import { DEMO_TASKS, isDemoMode } from '@/lib/demo-data'

// in-memory store for demo mode task updates
const demoTaskOverrides: Record<string, string> = {}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  if (isDemoMode()) {
    let data = DEMO_TASKS.map(t => ({
      ...t,
      status: (demoTaskOverrides[t.id] || t.status) as any
    }))
    if (status) data = data.filter(t => t.status === status)
    return NextResponse.json(data)
  }

  const { createServiceClient } = await import("@/lib/supabase/server")
  const supabase = createServiceClient()

  let query = supabase
    .from('tasks')
    .select('*, parent:parents(id, name, phone)')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json()

  if (isDemoMode()) {
    demoTaskOverrides[id] = status
    return NextResponse.json({ id, status })
  }

  const { createServiceClient } = await import("@/lib/supabase/server")
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
