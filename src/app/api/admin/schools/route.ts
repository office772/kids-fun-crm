export const dynamic = 'force-dynamic'

// ─── ניהול מסגרות (גנים/בתי"ס) — CRUD מלא ────────────────────────────────────
// GET   — כל המסגרות (כולל לא-פעילות) עם מחיר/קיבולת/סטטוס + ספירת רשומים בפועל.
// POST  { name, area_code, monthly_price?, max_capacity?, city? }  — הוספת מסגרת.
// PATCH { id, ...fields }  — עדכון שם/אזור/מחיר/קיבולת/עיר/פעיל (כיבוי = is_active:false).
//
// אין מחיקה קשה — כיבוי (is_active=false) שומר על היסטוריית הרישומים.
import { NextRequest, NextResponse } from 'next/server'
import { normSchool, activeCountsBySchool } from '@/lib/school-capacity'
import { invalidateSchoolsCache } from '@/lib/bot/schools-db'

const AREA_LABEL: Record<string, string> = { sharon: 'דרום השרון', carmel: 'חוף הכרמל', telaviv: 'תל אביב' }
const VALID_AREAS = ['sharon', 'carmel', 'telaviv']

function errMsg(err: unknown) { return err instanceof Error ? err.message : 'שגיאה' }

// המרת קלט מספרי אופציונלי: '' / null → null; אחרת מספר אי-שלילי או שגיאה.
function optionalNonNegInt(v: unknown, field: string): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) throw new Error(`${field} לא תקין`)
  return Math.round(n)
}

export async function GET() {
  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('schools')
      .select('id, name, area_code, city, monthly_price, max_capacity, is_active, sort_order')
      .order('area_code').order('sort_order')
    if (error) throw new Error(error.message)

    const counts = await activeCountsBySchool(supabase)
    type Row = { id: string; name: string; area_code: string; city: string | null; monthly_price: number | null; max_capacity: number | null; is_active: boolean; sort_order: number | null }
    const schools = ((data || []) as Row[]).map(s => ({
      ...s,
      area_label: AREA_LABEL[s.area_code] || s.area_code,
      registered: counts[normSchool(s.name)] || 0,
    }))
    return NextResponse.json({ success: true, schools })
  } catch (err) {
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const name = String(body?.name || '').trim()
    const area_code = String(body?.area_code || '').trim()
    if (!name) return NextResponse.json({ success: false, error: 'שם המסגרת נדרש' }, { status: 400 })
    if (!VALID_AREAS.includes(area_code)) {
      return NextResponse.json({ success: false, error: 'אזור לא תקין' }, { status: 400 })
    }
    const monthly_price = optionalNonNegInt(body?.monthly_price, 'מחיר')
    const max_capacity  = optionalNonNegInt(body?.max_capacity, 'קיבולת')
    const city = body?.city ? String(body.city).trim() : null

    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()

    // sort_order = אחרי האחרון באזור
    const { data: last } = await supabase
      .from('schools').select('sort_order').eq('area_code', area_code)
      .order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const sort_order = ((last?.sort_order as number | null) ?? 0) + 1

    const { data, error } = await supabase
      .from('schools')
      .insert({ name, area_code, city, monthly_price, max_capacity, is_active: true, sort_order })
      .select('id').single()
    if (error) throw new Error(error.message)

    invalidateSchoolsCache()
    return NextResponse.json({ success: true, id: data?.id })
  } catch (err) {
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const id = String(body?.id || '').trim()
    if (!id) return NextResponse.json({ success: false, error: 'id נדרש' }, { status: 400 })

    const update: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) return NextResponse.json({ success: false, error: 'שם המסגרת לא יכול להיות ריק' }, { status: 400 })
      update.name = name
    }
    if (body.area_code !== undefined) {
      if (!VALID_AREAS.includes(String(body.area_code))) {
        return NextResponse.json({ success: false, error: 'אזור לא תקין' }, { status: 400 })
      }
      update.area_code = String(body.area_code)
    }
    if (body.city !== undefined)          update.city = body.city ? String(body.city).trim() : null
    if (body.monthly_price !== undefined) update.monthly_price = optionalNonNegInt(body.monthly_price, 'מחיר')
    if (body.max_capacity !== undefined)  update.max_capacity  = optionalNonNegInt(body.max_capacity, 'קיבולת')
    if (body.is_active !== undefined)     update.is_active = Boolean(body.is_active)

    if (!Object.keys(update).length) {
      return NextResponse.json({ success: false, error: 'אין שדות לעדכון' }, { status: 400 })
    }

    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const { error } = await supabase.from('schools').update(update).eq('id', id)
    if (error) throw new Error(error.message)

    invalidateSchoolsCache()
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 400 })
  }
}
