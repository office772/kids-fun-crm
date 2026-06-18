// ─── החזרת אוטומציית הבוט לפונה (resume) — מהדשבורד ─────────────────────────
// POST { parentId } או { phone } → מאתר user_ns ומפעיל resume-bot ב-uChat.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resumeBot, getUserNsByPhone } from '@/lib/uchat'

export async function POST(req: NextRequest) {
  try {
    const { parentId, phone } = await req.json()

    let userNs: string | null = null

    if (parentId) {
      const { createServiceClient } = await import('@/lib/supabase/server')
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('parents').select('uchat_user_ns, phone').eq('id', parentId).maybeSingle()
      userNs = data?.uchat_user_ns ?? (data?.phone ? await getUserNsByPhone(data.phone) : null)
    } else if (phone) {
      userNs = await getUserNsByPhone(phone)
    }

    if (!userNs) {
      return NextResponse.json(
        { success: false, error: 'לא נמצא מזהה uChat לפונה (ייתכן שעוד לא כתב לבוט)' },
        { status: 404 },
      )
    }

    const ok = await resumeBot(userNs)
    return NextResponse.json({ success: ok }, { status: ok ? 200 : 502 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאה'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
