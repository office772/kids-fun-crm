// ─── ניהול הגדרות מערכת (טבלת settings) דרך הדשבורד ───────────────────────────
// GET    → { settings: { key: value, ... } }   כל ההגדרות
// PATCH  { settings: { key: value, ... } }      upsert של המפתחות שנשלחו
//
// ⚠️ הטבלה הזו מכילה רק הגדרות לא-סודיות (שעות, שם בוט, קול הבוט, קיבולת).
//    מפתחות סליקה/סודות חיים ב-env ולא כאן — לא לחשוף אותם דרך ה-route הזה.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getAllSettings, upsertSettings, SettingEntry } from '@/lib/bot/settings-db'

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : 'שגיאה'
}

// תיאורים למפתחות מוכרים — כדי שרשומות חדשות (למשל קול הבוט) ייקראו טוב בטבלה.
const KEY_DESCRIPTIONS: Record<string, string> = {
  bot_persona_name:   'קול הבוט — שם הפרסונה',
  bot_gender:         'קול הבוט — מגדר (male/female/neutral)',
  bot_formality:      'קול הבוט — רמת רשמיות/טון',
  bot_emoji_level:    'קול הבוט — רמת אמוג\'ים (none/low/high)',
  bot_greeting:       'קול הבוט — משפט פתיחה מועדף',
  bot_signoff:        'קול הבוט — משפט סיום מועדף',
  bot_phrases_use:    'קול הבוט — ביטויים לשימוש',
  bot_phrases_avoid:  'קול הבוט — ביטויים להימנע',
  bot_forbidden_words:'קול הבוט — מילים אסורות',
  bot_sample_answers: 'קול הבוט — דוגמאות תשובה (few-shot)',
}

export async function GET() {
  try {
    const settings = await getAllSettings()
    return NextResponse.json({ success: true, settings })
  } catch (err) {
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const incoming = body?.settings
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return NextResponse.json(
        { success: false, error: 'חסר אובייקט settings (מפה של key→value)' },
        { status: 400 },
      )
    }

    const entries: SettingEntry[] = []
    for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
      if (typeof key !== 'string' || !key.trim()) continue
      // ערך תמיד נשמר כמחרוזת (הטבלה value text not null)
      const strValue = value === null || value === undefined ? '' : String(value)
      const entry: SettingEntry = { key: key.trim(), value: strValue }
      if (KEY_DESCRIPTIONS[key]) entry.description = KEY_DESCRIPTIONS[key]
      entries.push(entry)
    }

    if (!entries.length) {
      return NextResponse.json({ success: false, error: 'אין מפתחות לעדכון' }, { status: 400 })
    }

    await upsertSettings(entries)
    const settings = await getAllSettings()
    return NextResponse.json({ success: true, settings })
  } catch (err) {
    return NextResponse.json({ success: false, error: errMsg(err) }, { status: 400 })
  }
}
