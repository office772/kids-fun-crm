export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { isDemoMode, DEMO_REGISTRATIONS, DEMO_TIMELINE } from '@/lib/demo-data'
import { RegistrationTimeline } from '@/lib/types'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { status, notes, waiting_list_position } = body

  if (isDemoMode()) {
    const idx = DEMO_REGISTRATIONS.findIndex(r => r.id === params.id)
    if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const prev = DEMO_REGISTRATIONS[idx]
    const oldStatus = prev.status

    DEMO_REGISTRATIONS[idx] = {
      ...prev,
      status: status ?? prev.status,
      notes: notes ?? prev.notes,
      waiting_list_position: waiting_list_position ?? prev.waiting_list_position,
      approved_at: status === 'מאושר' && !prev.approved_at ? new Date().toISOString() : prev.approved_at,
      updated_at: new Date().toISOString(),
    }

    // Create timeline entry for status change
    if (status && status !== oldStatus) {
      const parentId = prev.parent_id
      if (!DEMO_TIMELINE[parentId]) DEMO_TIMELINE[parentId] = []
      const entry: RegistrationTimeline = {
        id: 'tl_' + Date.now(),
        parent_id: parentId,
        registration_id: params.id,
        event_type: 'status_change',
        old_value: oldStatus,
        new_value: status,
        description: `שינוי סטטוס: ${oldStatus} → ${status}`,
        performed_by: 'נציג',
        created_at: new Date().toISOString(),
      }
      DEMO_TIMELINE[parentId].unshift(entry)
    }

    return NextResponse.json(DEMO_REGISTRATIONS[idx])
  }

  const { createServiceClient } = await import("@/lib/supabase/server")
  const supabase = createServiceClient()

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (status) updateData.status = status
  if (notes !== undefined) updateData.notes = notes
  if (waiting_list_position !== undefined) updateData.waiting_list_position = waiting_list_position
  if (status === 'מאושר') updateData.approved_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('registrations')
    .update(updateData)
    .eq('id', params.id)
    .select('*, parent:parents(id, name, phone), child:children(id, name, class_name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Timeline entry created automatically by DB trigger (on_registration_status_change)
  return NextResponse.json(data)
}
