export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { isDemoMode, DEMO_PARENTS } from '@/lib/demo-data'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (isDemoMode()) {
    const parent = DEMO_PARENTS.find(p => p.id === params.id)
    if (!parent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(parent)
  }

  const { createServiceClient } = await import("@/lib/supabase/server")
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('parents')
    .select('*, children(*), payments(*), tasks(*), registrations(*), conversations(*)')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const {
    name, phone, email, notes,
    city, parent2Name, parent2Phone, parentIdNumber,
    childName, childClass, framework, area, school, grade,
    gender, dietary, childIdNumber,
  } = body

  if (isDemoMode()) {
    const idx = DEMO_PARENTS.findIndex(p => p.id === params.id)
    if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = DEMO_PARENTS[idx]
    DEMO_PARENTS[idx] = {
      ...existing,
      name: name ?? existing.name,
      phone: phone ?? existing.phone,
      email: email ?? existing.email,
      notes: notes ?? existing.notes,
      updated_at: new Date().toISOString(),
      children: existing.children?.map((c, i) =>
        i === 0 ? {
          ...c,
          name: childName ?? c.name,
          class_name: childClass ?? c.class_name,
          framework: framework ?? c.framework,
        } : c
      ),
    }
    return NextResponse.json(DEMO_PARENTS[idx])
  }

  const { createServiceClient } = await import("@/lib/supabase/server")
  const supabase = createServiceClient()

  const cleanPhone = phone?.replace(/\D/g, '').replace(/^0/, '972')

  // Build parent patch — only include defined, non-empty values
  const parentPatch: Record<string, string | null> = {
    name,
    email: email || null,
    notes: notes || null,
    city: city || null,
    parent2_name: parent2Name || null,
    parent2_phone: parent2Phone || null,
    id_number: parentIdNumber || null,
    updated_at: new Date().toISOString(),
  }
  if (phone) parentPatch.phone = cleanPhone

  const { data, error } = await supabase
    .from('parents')
    .update(parentPatch)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // עדכון / יצירת ילד ראשון
  if (childName || area || school || grade || gender || dietary || childIdNumber) {
    const { data: children } = await supabase.from('children').select('id').eq('parent_id', params.id).limit(1)
    const childPatch: Record<string, string | null> = {}
    if (childName)      childPatch.name       = childName
    if (childClass)     childPatch.class_name = childClass
    if (framework)      childPatch.framework  = framework
    if (area)           childPatch.area_code  = area
    if (school)         childPatch.school     = school
    if (grade)          childPatch.grade      = grade
    if (gender)         childPatch.gender     = gender
    if (dietary)        childPatch.dietary    = dietary
    if (childIdNumber)  childPatch.id_number  = childIdNumber

    if (children?.[0]) {
      await supabase.from('children').update(childPatch).eq('id', children[0].id)
    } else if (childName) {
      await supabase.from('children').insert({ parent_id: params.id, ...childPatch })
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (isDemoMode()) {
    const idx = DEMO_PARENTS.findIndex(p => p.id === params.id)
    if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    DEMO_PARENTS.splice(idx, 1)
    return NextResponse.json({ success: true })
  }

  const { createServiceClient } = await import("@/lib/supabase/server")
  const supabase = createServiceClient()

  const { error } = await supabase.from('parents').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
