export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { isDemoMode } from '@/lib/demo-data'

// העברת הורים לארכיון / שחזור מהארכיון (ללא מחיקה!)
export async function POST(req: NextRequest) {
  const { ids, archive, reason } = await req.json()
  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: 'ids required' }, { status: 400 })

  if (isDemoMode()) return NextResponse.json({ updated: ids.length })

  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()

  const patch = archive
    ? { is_archived: true, archive_reason: reason ?? 'קייטנה', archived_at: new Date().toISOString() }
    : { is_archived: false, archive_reason: null, archived_at: null }

  const { error } = await supabase.from('parents').update(patch).in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ updated: ids.length })
}
