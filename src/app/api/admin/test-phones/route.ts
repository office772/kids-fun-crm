// ─── ניהול מספרי בדיקה (whitelist) דרך הדשבורד ───────────────────────────────
// GET    → { base: [...], extra: [...] }   רשימת המספרים המורשים
// POST   { phone }  → הוספת מספר לרשימה הדינמית
// DELETE { phone }  → הסרת מספר מהרשימה הדינמית (base קבוע לא ניתן להסרה)
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAllTestPhones, addTestPhone, removeTestPhone } from '@/lib/bot/test-phones-db'

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : 'שגיאה'
}

export async function GET() {
  try {
    const { base, extra } = await getAllTestPhones()
    return NextResponse.json({ success: true, base, extra })
  } catch (err) {
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json()
    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ success: false, error: 'חסר מספר טלפון' }, { status: 400 })
    }
    const extra = await addTestPhone(phone)
    return NextResponse.json({ success: true, extra })
  } catch (err) {
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { phone } = await req.json()
    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ success: false, error: 'חסר מספר טלפון' }, { status: 400 })
    }
    const extra = await removeTestPhone(phone)
    return NextResponse.json({ success: true, extra })
  } catch (err) {
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 400 })
  }
}
