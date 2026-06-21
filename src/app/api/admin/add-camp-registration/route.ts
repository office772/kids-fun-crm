// ─── הוספת רישום לקייטנה ידנית (אדמין / בדיקות) ──────────────────────────────
// מוסיף רשומת registrations מסוג 'קייטנה' (status 'מאושר') לילד — בלי לעבור
// את תהליך הרישום באתר. שימושי לאדמין ולבדיקת מסלול "בדיקת רישום לקייטנה".
// POST { parentId, childId?, campName?, areaCode? }

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { parentId, childId, campName, areaCode } = await req.json()
    if (!parentId) {
      return NextResponse.json({ success: false, error: 'חסר מזהה הורה' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // אם לא סופק ילד — לוקחים את הילד הראשון של ההורה
    let resolvedChildId = childId as string | undefined
    let childName = ''
    let childIdNumber: string | null = null
    if (resolvedChildId) {
      const { data: c } = await supabase
        .from('children').select('id, name, id_number, area_code').eq('id', resolvedChildId).maybeSingle()
      childName = c?.name ?? ''
      childIdNumber = c?.id_number ?? null
    } else {
      const { data: c } = await supabase
        .from('children').select('id, name, id_number, area_code')
        .eq('parent_id', parentId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      resolvedChildId = c?.id
      childName = c?.name ?? ''
      childIdNumber = c?.id_number ?? null
    }

    if (!resolvedChildId) {
      return NextResponse.json({ success: false, error: 'להורה אין ילד/ה במערכת' }, { status: 404 })
    }

    const { data: reg, error } = await supabase
      .from('registrations')
      .insert({
        parent_id:     parentId,
        child_id:      resolvedChildId,
        type:          'קייטנה',
        status:        'מאושר',
        area_code:     areaCode || null,
        registered_at: new Date().toISOString(),
        notes:         `נוסף ידנית ע"י אדמין (בדיקה)${campName ? ` — ${campName} (הזמנה ידנית)` : ''}`,
      })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // הערה: למסלול "בדיקת רישום לקייטנה" בבוט נדרש שלילד/ה יהיה id_number
    // (לאימות לפי 3-4 ספרות אחרונות). אם אין — הבוט לא יאמת.
    return NextResponse.json({
      success: true,
      registrationId: reg.id,
      childName,
      childHasIdNumber: !!childIdNumber,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאה'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
