export const dynamic = 'force-dynamic'

// ─── עדכון/מחיקת רשומת תשלום בודדת ───────────────────────────────────────────
// משמש את התראות "כשל תשלום" בדשבורד: סימון כטופל (שינוי סטטוס) או מחיקה (ג'אנק בדיקות).
import { NextRequest, NextResponse } from 'next/server'

// PATCH — עדכון סטטוס תשלום (למשל כשל → בוטל/שולם)
export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json().catch(() => ({}))
  if (!id || !status) return NextResponse.json({ error: 'id+status נדרשים' }, { status: 400 })
  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()
  const { error } = await supabase.from('payments').update({ status }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE — מחיקת רשומת תשלום
export async function DELETE(req: NextRequest) {
  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id נדרש' }, { status: 400 })
  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()
  const { error } = await supabase.from('payments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
