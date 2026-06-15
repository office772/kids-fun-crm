export const dynamic = 'force-dynamic'

// ─── תזכורות יזומות שהורים ביקשו ב-bot ────────────────────────────────────
// רץ כל בוקר (08:00 שעון ישראל). שולף את כל ה-reminders שמועד התזכורת שלהם הגיע,
// פותח משימה דחופה לנציגה (וכשיהיה uChat — ישלח הודעה יזומה ללקוח),
// ומסמן את התזכורת כ-sent.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'

export async function GET() {
  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()

  const nowIso = new Date().toISOString()
  const { data: due } = await supabase
    .from('followup_reminders')
    .select('id, parent_id, child_name, reason, context, scheduled_for')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)
    .limit(50)

  if (!due?.length) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  const { notifyStaff } = await import('@/lib/notify')
  let processed = 0

  for (const r of due) {
    try {
      // משימה דחופה לנציגה
      await supabase.from('tasks').insert({
        parent_id:   r.parent_id,
        type:        'תזכורת כשל תשלום',
        description: `⏰ תזכורת — ${r.child_name ?? 'הורה'} ביקש/ה שנחזור היום: "${r.context ?? r.reason}"`,
        priority:    'דחוף',
        status:      'פתוח',
      })
      await notifyStaff({
        text: `⏰ תזכורת — לחזור היום ל${r.child_name ?? 'הורה'} בנושא: ${r.reason}`,
        priority: 'דחוף',
      })
      await supabase.from('followup_reminders').update({
        status: 'sent', sent_at: nowIso,
      }).eq('id', r.id)
      processed++
    } catch (err) {
      console.error('[followup-reminders] error:', err)
      await supabase.from('followup_reminders').update({ status: 'failed' }).eq('id', r.id)
    }
  }

  return NextResponse.json({ ok: true, processed })
}
