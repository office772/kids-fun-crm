export const dynamic = 'force-dynamic'

// ─── עריכת טקסט הודעות הבוט (טקסט בלבד, משתנים נעולים) ────────────────────────
// GET   → { messages: [...] }  רשימת ההודעות הניתנות לעריכה (רג'יסטרי + דריסות DB).
// PATCH { key, text, is_active? }  — שמירת דריסה. **דוחה** שינוי משתנים ({...}).
import { NextRequest, NextResponse } from 'next/server'
import {
  BOT_MESSAGE_REGISTRY, listEditableMessages, placeholdersMatch,
  extractPlaceholders, invalidateBotMessagesCache,
} from '@/lib/bot/bot-messages-db'

function errMsg(err: unknown) { return err instanceof Error ? err.message : 'שגיאה' }

export async function GET() {
  try {
    const messages = await listEditableMessages()
    return NextResponse.json({ success: true, messages })
  } catch (err) {
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const key = String(body?.key || '').trim()
    const def = BOT_MESSAGE_REGISTRY[key]
    if (!def) return NextResponse.json({ success: false, error: 'מפתח הודעה לא מוכר' }, { status: 400 })

    const text = typeof body?.text === 'string' ? body.text : ''
    if (!text.trim()) return NextResponse.json({ success: false, error: 'הטקסט לא יכול להיות ריק' }, { status: 400 })

    // ⚠️ נעילת משתנים — חובה בדיוק אותם {...} כמו בברירת המחדל.
    if (!placeholdersMatch(text, def.vars)) {
      const found = extractPlaceholders(text)
      const required = def.vars
      return NextResponse.json({
        success: false,
        error: required.length
          ? `חובה לשמור בדיוק את המשתנים: ${required.map(v => `{${v}}`).join(' ')} — לא להוסיף, לא למחוק ולא לשנות. נמצאו: ${found.length ? found.map(v => `{${v}}`).join(' ') : 'ללא'}.`
          : `בהודעה הזו אין משתנים — אין להוסיף {…}. נמצאו: ${found.map(v => `{${v}}`).join(' ')}.`,
      }, { status: 400 })
    }

    const is_active = body?.is_active === undefined ? true : Boolean(body.is_active)

    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const { error } = await supabase.from('bot_messages').upsert(
      { key, text, is_active, description: def.label, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    if (error) throw new Error(error.message)

    invalidateBotMessagesCache()
    const messages = await listEditableMessages()
    return NextResponse.json({ success: true, messages })
  } catch (err) {
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 400 })
  }
}
