export const dynamic = 'force-dynamic'

// ─── בדיקת בוקר אוטומטית: האם חיובי הוראות הקבע הליליים נקלטו? ─────────────
// רץ כ-Vercel Cron כל בוקר (04:30 UTC ≈ 07:30 שעון ישראל).
// בודק אם נקלטו תשלומים מה-webhook של PayPlus ב-25 השעות האחרונות.
// אם לא נקלט כלום — נפתחת משימה דחופה בטאב "פניות" בדשבורד.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()

    const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    const todayLabel = new Date().toLocaleDateString('he-IL')

    // תשלומים שהגיעו מה-webhook של PayPlus מאז אתמול
    const { data: recentWebhookPayments, error } = await supabase
      .from('payments')
      .select('id, status, amount, created_at')
      .eq('source', 'payplus_webhook')
      .gte('created_at', since)

    if (error) {
      console.error('[Cron payments-check] DB error:', error.message)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const received = recentWebhookPayments?.length ?? 0
    const failed   = recentWebhookPayments?.filter((p: { status: string }) => p.status === 'נכשל').length ?? 0

    console.log(`[Cron payments-check] ${todayLabel}: ${received} תשלומי webhook ב-25 שעות (${failed} כשלים)`)

    if (received > 0) {
      return NextResponse.json({ ok: true, received, failed })
    }

    // לא נקלט כלום — פותחים משימה (אחת ליום, לא כפולה)
    const { data: existingTask } = await supabase
      .from('tasks')
      .select('id')
      .eq('type', 'אחר')
      .ilike('description', `%בדיקת בוקר ${todayLabel}%`)
      .maybeSingle()

    if (existingTask) {
      return NextResponse.json({ ok: true, received: 0, task: 'already exists' })
    }

    await supabase.from('tasks').insert({
      type:        'אחר',
      description:
        `⏰ בדיקת בוקר ${todayLabel}: לא נקלטו חיובי PayPlus מהלילה (webhook). ` +
        `ייתכן שלא היו חיובים מתוכננים — ואם כן היו, לבדוק את הגדרת ה-Callback בדפי הסליקה של PayPlus.`,
      priority:    'דחוף',
      status:      'פתוח',
    })

    return NextResponse.json({ ok: true, received: 0, task: 'created' })
  } catch (err) {
    console.error('[Cron payments-check] Error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
