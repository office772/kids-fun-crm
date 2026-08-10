export const dynamic = 'force-dynamic'

// ─── רשימות נוכחות/משתתפים לפי מסגרת — לתצוגה בדשבורד ─────────────────────────
// ?kind=צהרון | קייטנה (ברירת מחדל: שניהם)
import { NextRequest, NextResponse } from 'next/server'
import { buildFrameworkRosters, type FrameworkKind } from '@/lib/attendance'

export async function GET(req: NextRequest) {
  try {
    const k = req.nextUrl.searchParams.get('kind')
    const kind = k === 'צהרון' || k === 'קייטנה' ? (k as FrameworkKind) : undefined
    const rosters = await buildFrameworkRosters(kind)
    return NextResponse.json(rosters)
  } catch (err) {
    console.error('[api/attendance] error:', err)
    return NextResponse.json([], { status: 200 })
  }
}
