export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      areaCode,
      // פרטי הורה
      parentName,
      parentPhone,
      parentEmail,
      parentPhone2,       // טלפון נוסף (אופציונלי)
      // פרטי ילד
      childName,
      childClass,
      childBirthDate,
      childAllergies,
      childMedicalNotes,
      // מידע נוסף
      emergencyContact,   // איש קשר לשעת חירום
      howDidYouHear,
      notes,
    } = body

    // ─── ולידציה בסיסית ────────────────────────────────────────────────────
    if (!parentName || !parentPhone || !childName || !areaCode) {
      return NextResponse.json({ error: 'שדות חובה חסרים' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const cleanPhone = parentPhone.replace(/\D/g, '').replace(/^0/, '972')

    // ─── בדיקת קיבולת לפני רישום ────────────────────────────────────────────
    const { data: branch } = await supabase
      .from('branches')
      .select('id, max_capacity')
      .eq('area_code', areaCode)
      .maybeSingle()

    if (branch) {
      const { count: registered } = await supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('area_code', areaCode)
        .eq('type', 'צהרון')
        .in('status', ['ממתין לאישור', 'מאושר'])

      if ((registered ?? 0) >= branch.max_capacity) {
        return NextResponse.json({ error: 'אין מקום פנוי', waitingList: true }, { status: 409 })
      }
    }

    // ─── צור / עדכן הורה ────────────────────────────────────────────────────
    let parentId: string

    const { data: existingParent } = await supabase
      .from('parents')
      .select('id')
      .eq('phone', cleanPhone)
      .maybeSingle()

    if (existingParent) {
      parentId = existingParent.id
      await supabase
        .from('parents')
        .update({ name: parentName, email: parentEmail || null })
        .eq('id', parentId)
    } else {
      const { data: newParent, error: parentError } = await supabase
        .from('parents')
        .insert({
          phone:     cleanPhone,
          name:      parentName,
          email:     parentEmail || null,
          notes:     [
            parentPhone2 && `טלפון נוסף: ${parentPhone2}`,
            emergencyContact && `איש קשר חירום: ${emergencyContact}`,
            howDidYouHear && `איך שמעת עלינו: ${howDidYouHear}`,
          ].filter(Boolean).join(' | ') || null,
        })
        .select('id')
        .single()

      if (parentError || !newParent) {
        return NextResponse.json({ error: parentError?.message ?? 'שגיאה ביצירת הורה' }, { status: 500 })
      }
      parentId = newParent.id
    }

    // ─── צור ילד ────────────────────────────────────────────────────────────
    const { data: child, error: childError } = await supabase
      .from('children')
      .insert({
        parent_id:     parentId,
        name:          childName,
        class_name:    childClass || null,
        birth_date:    childBirthDate || null,
        framework:     'צהרון',
        area_code:     areaCode,
        allergies:     childAllergies || null,
        medical_notes: childMedicalNotes || null,
      })
      .select('id')
      .single()

    if (childError || !child) {
      return NextResponse.json({ error: childError?.message ?? 'שגיאה ביצירת ילד' }, { status: 500 })
    }

    // ─── צור רישום ──────────────────────────────────────────────────────────
    const { data: registration, error: regError } = await supabase
      .from('registrations')
      .insert({
        parent_id:          parentId,
        child_id:           child.id,
        type:               'צהרון',
        status:             'ממתין לאישור',
        area_code:          areaCode,
        form_submitted_at:  new Date().toISOString(),
        notes:              notes || null,
      })
      .select('id')
      .single()

    if (regError || !registration) {
      return NextResponse.json({ error: regError?.message ?? 'שגיאה ביצירת רישום' }, { status: 500 })
    }

    // ─── צור משימה לצוות ────────────────────────────────────────────────────
    await supabase.from('tasks').insert({
      parent_id:   parentId,
      type:        'רישום',
      description: `רישום חדש לצהרון — ${childName} כיתה ${childClass} | אזור: ${areaCode} | הורה: ${parentName} ${cleanPhone}`,
      status:      'פתוח',
      priority:    'רגיל',
    })

    // התראה לנייד הנציגה (פעיל אוטומטית ברגע ש-uChat מחובר)
    try {
      const { notifyStaff } = await import('@/lib/notify')
      await notifyStaff({
        text: `רישום חדש לצהרון 🎉\n${childName} (כיתה ${childClass || '?'}) — ${areaCode}\nהורה: ${parentName} ${cleanPhone}`,
        priority: 'רגיל',
      })
    } catch { /* לא חוסם רישום */ }

    // ─── מייל אישור להורה (לא-חוסם — כשל במייל לא מפיל את הרישום) ──────────
    if (parentEmail) {
      try {
        const { sendRegistrationConfirmation } = await import('@/lib/email')
        await sendRegistrationConfirmation({
          to:         parentEmail,
          parentName,
          childName,
          areaCode,
          className:  childClass || undefined,
          school:     body.childSchool || undefined,
        })
      } catch (emailErr) {
        console.error('[Register] Email send failed (non-blocking):', emailErr)
      }
    }

    return NextResponse.json({
      success:        true,
      registrationId: registration.id,
      parentId,
      childId:        child.id,
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאה כללית'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
