import { NextRequest, NextResponse } from 'next/server'
import { isDemoMode, DEMO_FAQS } from '@/lib/demo-data'
import type { FAQ } from '@/lib/types'

// ─── GET — רשימת FAQs ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category  = searchParams.get('category')
  const key       = searchParams.get('key')
  const search    = searchParams.get('search')?.toLowerCase()
  const showAll   = searchParams.get('_all') === '1'  // לפאנל ניהול — כולל מושבתים

  function filterDemo(data: FAQ[]) {
    let result = showAll ? data : data.filter(f => f.is_active)
    if (category) result = result.filter(f => f.category === category)
    if (key)      result = result.filter(f => f.key === key)
    if (search)   result = result.filter(f =>
      f.question.toLowerCase().includes(search) ||
      f.answer.toLowerCase().includes(search) ||
      f.key.toLowerCase().includes(search)
    )
    return result
  }

  if (isDemoMode()) {
    return NextResponse.json(filterDemo(DEMO_FAQS))
  }

  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()

    let query = supabase
      .from('faqs')
      .select('*')
      .order('category')
      .order('created_at', { ascending: true })

    if (!showAll) query = query.eq('is_active', true)
    if (category) query = query.eq('category', category)
    if (key)      query = query.eq('key', key)
    if (search)   query = query.or(`question.ilike.%${search}%,answer.ilike.%${search}%,key.ilike.%${search}%`)

    const { data, error } = await query

    // ─── אם הטבלה לא קיימת עוד — fallback לדמו ──────────────────────────────
    if (error) {
      if (error.message.includes('faqs') || error.message.includes('schema cache')) {
        console.warn('[FAQ API] faqs table not found — falling back to demo data')
        return NextResponse.json(filterDemo(DEMO_FAQS))
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json(filterDemo(DEMO_FAQS))
  }
}

// ─── POST — יצירת FAQ חדש ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ error: 'Demo mode — DB writes disabled' }, { status: 400 })
  }

  const body = await req.json() as Partial<FAQ>
  if (!body.key || !body.question || !body.answer || !body.category) {
    return NextResponse.json({ error: 'key, question, answer, category חובה' }, { status: 400 })
  }

  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('faqs')
    .insert({
      key:       body.key,
      question:  body.question,
      answer:    body.answer,
      category:  body.category,
      is_active: body.is_active ?? true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// ─── PATCH — עדכון FAQ ───────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ error: 'Demo mode — DB writes disabled' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id חובה' }, { status: 400 })

  const body = await req.json() as Partial<FAQ>

  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('faqs')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ─── DELETE — מחיקת FAQ ──────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ error: 'Demo mode — DB writes disabled' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id חובה' }, { status: 400 })

  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()

  const { error } = await supabase.from('faqs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
