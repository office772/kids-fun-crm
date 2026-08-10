export const dynamic = 'force-dynamic'

// ─── שליחת רשימת משתתפים/נוכחות שבועית לצוות המסגרת ───────────────────────────
// רץ פעם בשבוע. לכל מסגרת פעילה שיש לה צוות פעיל עם מייל — שולח את רשימת
// המשתתפים העדכנית במייל. מסגרת בלי צוות רשום/מעודכן → לא נשלחת (skipped).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCron, unauthorized } from '@/lib/api-auth'
import { buildFrameworkRosters } from '@/lib/attendance'
import { sendFrameworkRoster } from '@/lib/email'

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return unauthorized()

  const rosters = await buildFrameworkRosters()

  // ?dry=1 — תצוגה מקדימה: מה היה נשלח, בלי לשלוח מיילים בפועל
  if (req.nextUrl.searchParams.get('dry') === '1') {
    return NextResponse.json({
      dryRun: true,
      frameworks: rosters.map(r => ({
        framework: r.frameworkName,
        participants: r.participants.length,
        staffEmails: r.staffEmails.map(s => s.email),
        willSend: r.staffEmails.length > 0,
      })),
    })
  }

  let sent = 0, skipped = 0
  const details: { framework: string; participants: number; status: 'sent' | 'skipped' | 'failed' }[] = []

  for (const r of rosters) {
    const emails = r.staffEmails.map(s => s.email)
    if (emails.length === 0) {
      // אין צוות פעיל עם מייל → לא נשלח (לפי הדרישה)
      skipped++
      details.push({ framework: r.frameworkName, participants: r.participants.length, status: 'skipped' })
      continue
    }
    const ok = await sendFrameworkRoster({
      to: emails,
      frameworkName: r.frameworkName,
      participants: r.participants,
    })
    if (ok) { sent++; details.push({ framework: r.frameworkName, participants: r.participants.length, status: 'sent' }) }
    else    { details.push({ framework: r.frameworkName, participants: r.participants.length, status: 'failed' }) }
  }

  console.log(`[Cron weekly-roster] frameworks=${rosters.length} sent=${sent} skipped=${skipped}`)
  return NextResponse.json({ success: true, frameworks: rosters.length, sent, skipped, details })
}
