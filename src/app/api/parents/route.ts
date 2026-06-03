export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { DEMO_PARENTS, isDemoMode } from '@/lib/demo-data'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')

  if (isDemoMode()) {
    let data = DEMO_PARENTS
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.phone?.includes(q) ||
        p.children?.some(c => c.name?.toLowerCase().includes(q))
      )
    }
    return NextResponse.json(data)
  }

  const { createServiceClient } = await import("@/lib/supabase/server")
  const supabase = createServiceClient()

  let query = supabase
    .from('parents')
    .select(`*, children(*), payments(id, status, amount, due_date), tasks(id, status, priority, type), conversations(id, direction, message_text, intent, created_at)`)
    .order('created_at', { ascending: false })
    .limit(100)

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
