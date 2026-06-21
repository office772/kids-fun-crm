// ─── איפוס פונה לבדיקה ────────────────────────────────────────────────────────
// מוחק את כל הרשומות של מספר טלפון (הורה, ילדים, רישומים, תשלומים, פניות,
// שיחות, session) כדי שאפשר להתחיל בדיקה "כאילו מהורה חדש".
// ⚠️ בטיחות: עובד רק על מספרי בדיקה (src/lib/bot/test-phones.ts) — אי אפשר
//    למחוק בטעות הורה אמיתי.
// POST { phone }

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isTestPhone, normIntl } from '@/lib/bot/test-phones'

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json()
    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ success: false, error: 'חסר מספר טלפון' }, { status: 400 })
    }

    // בטיחות — רק מספרי בדיקה
    if (!isTestPhone(phone)) {
      return NextResponse.json(
        { success: false, error: 'אפשר לאפס רק מספרי בדיקה מאושרים' },
        { status: 403 },
      )
    }

    const supabase = createServiceClient()
    const intl  = normIntl(phone)                 // 972...
    const local = '0' + intl.replace(/^972/, '')  // 0...
    const variants = [intl, local, phone]
    const orPhones = variants.map(p => `phone.eq.${p}`).join(',')

    const deleted: Record<string, number> = {}

    // מצא את ההורים לפי שני הפורמטים
    const { data: parents } = await supabase
      .from('parents').select('id').or(orPhones)
    const parentIds = ((parents ?? []) as Array<{ id: string }>).map(p => p.id)

    // מחיקת תלויות לפי parent_id
    if (parentIds.length) {
      for (const table of ['tasks', 'payments', 'registrations', 'children']) {
        const { count } = await supabase
          .from(table).delete({ count: 'exact' }).in('parent_id', parentIds)
        deleted[table] = count ?? 0
      }
    }

    // שיחות + session + הורים לפי טלפון
    const conv = await supabase.from('conversations').delete({ count: 'exact' }).or(orPhones)
    deleted['conversations'] = conv.count ?? 0
    const sess = await supabase.from('bot_sessions').delete({ count: 'exact' }).or(orPhones)
    deleted['bot_sessions'] = sess.count ?? 0
    const par = await supabase.from('parents').delete({ count: 'exact' }).or(orPhones)
    deleted['parents'] = par.count ?? 0

    return NextResponse.json({ success: true, phone: intl, deleted })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאה'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
