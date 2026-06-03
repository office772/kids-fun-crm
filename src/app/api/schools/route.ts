import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const area = searchParams.get('area')

  if (!area) return NextResponse.json({ error: 'area required' }, { status: 400 })

  const supabase = createServiceClient()

  const [{ data: schools }, { data: classes }] = await Promise.all([
    supabase.from('schools').select('name, city').eq('area_code', area).eq('is_active', true).order('sort_order'),
    supabase.from('school_classes').select('name').eq('area_code', area).order('sort_order'),
  ])

  return NextResponse.json({ schools: schools ?? [], classes: classes ?? [] })
}
