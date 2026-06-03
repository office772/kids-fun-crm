import { NextRequest, NextResponse } from 'next/server'
import { isDemoMode, DEMO_TIMELINE, DEMO_PARENTS } from '@/lib/demo-data'
import { RegistrationTimeline } from '@/lib/types'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (isDemoMode()) {
    const timeline = DEMO_TIMELINE[params.id] || []
    // Sort newest first
    return NextResponse.json(timeline.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ))
  }

  const { createServiceClient } = await import("@/lib/supabase/server")
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('registration_timeline')
    .select('*')
    .eq('parent_id', params.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { event_type, description, old_value, new_value, performed_by, registration_id, metadata } = body

  if (isDemoMode()) {
    const newEntry: RegistrationTimeline = {
      id: 'tl_' + Date.now(),
      parent_id: params.id,
      registration_id,
      event_type,
      old_value,
      new_value,
      description,
      performed_by: performed_by || 'נציג',
      metadata,
      created_at: new Date().toISOString(),
    }
    if (!DEMO_TIMELINE[params.id]) DEMO_TIMELINE[params.id] = []
    DEMO_TIMELINE[params.id].unshift(newEntry)
    return NextResponse.json(newEntry)
  }

  const { createServiceClient } = await import("@/lib/supabase/server")
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('registration_timeline')
    .insert({
      parent_id: params.id,
      registration_id: registration_id || null,
      event_type,
      old_value: old_value || null,
      new_value: new_value || null,
      description,
      performed_by: performed_by || 'נציג',
      metadata: metadata || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
