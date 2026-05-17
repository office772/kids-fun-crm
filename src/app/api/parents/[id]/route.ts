import { NextRequest, NextResponse } from 'next/server'
import { isDemoMode, DEMO_PARENTS } from '@/lib/demo-data'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (isDemoMode()) {
    const parent = DEMO_PARENTS.find(p => p.id === params.id)
    if (!parent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(parent)
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
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
  const { name, phone, email, notes, childName, childClass, framework } = body

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

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const cleanPhone = phone?.replace(/\D/g, '').replace(/^0/, '972')

  const { data, error } = await supabase
    .from('parents')
    .update({
      name, email: email || null, notes: notes || null,
      ...(phone && { phone: cleanPhone }),
      updated_at: new Date().toISOString()
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // עדכון ילד ראשון אם יש
  if (childName) {
    const { data: children } = await supabase.from('children').select('id').eq('parent_id', params.id).limit(1)
    if (children?.[0]) {
      await supabase.from('children').update({ name: childName, class_name: childClass || null, framework: framework || null })
        .eq('id', children[0].id)
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

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { error } = await supabase.from('parents').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
