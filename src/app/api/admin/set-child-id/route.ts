// ─── עדכון ת"ז של ילד/ה (אדמין / בדיקות) ─────────────────────────────────────
// מאפשר להזין/לעדכן id_number לילד/ה — נדרש למסלול "בדיקת רישום לקייטנה" בבוט
// (אימות לפי 3-4 ספרות אחרונות).
// POST { childId, idNumber }

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { childId, idNumber } = await req.json()
    if (!childId) {
      return NextResponse.json({ success: false, error: 'חסר מזהה ילד/ה' }, { status: 400 })
    }
    const digits = String(idNumber ?? '').replace(/\D/g, '')
    if (digits.length < 5 || digits.length > 9) {
      return NextResponse.json({ success: false, error: 'ת"ז לא תקינה (5-9 ספרות)' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('children').update({ id_number: digits }).eq('id', childId).select('name').single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, childName: data?.name ?? '' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאה'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
