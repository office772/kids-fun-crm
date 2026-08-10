export const dynamic = 'force-dynamic'

// ─── הוספת ילד/ה נוסף/ת להורה קיים ──────────────────────────────────────────
// מאפשר לרשום כמה ילדים תחת אותו בית אב בלי למלא שוב את פרטי ההורה.
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { parentId, name, childClass, framework, area, school, grade, gender, dietary, childIdNumber } = body
  if (!parentId || !name?.trim()) {
    return NextResponse.json({ error: 'parentId ושם ילד/ה נדרשים' }, { status: 400 })
  }
  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('children').insert({
    parent_id: parentId,
    name: name.trim(),
    class_name: childClass || null,
    framework: framework || null,
    area_code: area || null,
    school: school || null,
    grade: grade || null,
    gender: gender || null,
    dietary: dietary || null,
    id_number: childIdNumber || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, child: data })
}

// DELETE — הסרת ילד/ה
export async function DELETE(req: NextRequest) {
  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id נדרש' }, { status: 400 })
  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()
  const { error } = await supabase.from('children').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
