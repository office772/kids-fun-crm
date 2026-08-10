// ─── אימות קריאות API פנימיות (crons / webhooks / sync) ──────────────────────
// גישת "graceful": אם ה-secret לא מוגדר ב-env — מאפשרים אך מזהירים בלוג
// (כדי לא לשבור crons/callbacks קיימים ברגע הפריסה). ברגע שמגדירים את ה-env
// ב-Vercel — האימות נאכף מיד. כך אפשר להדק בלי downtime.

import { NextRequest, NextResponse } from 'next/server'

// Vercel Cron שולח אוטומטית: Authorization: Bearer <CRON_SECRET> (אם מוגדר env).
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.warn('[auth] CRON_SECRET לא מוגדר — ה-cron פתוח. הגדירי CRON_SECRET ב-Vercel כדי לאכוף.')
    return true
  }
  return (req.headers.get('authorization') || '') === `Bearer ${secret}`
}

// אימות webhook/sync לפי secret משותף: ?secret= או כותרת x-webhook-secret.
export function isAuthorizedWebhook(req: NextRequest, envVar: string): boolean {
  const expected = process.env[envVar]
  if (!expected) {
    console.warn(`[auth] ${envVar} לא מוגדר — ה-endpoint פתוח. הגדירי ${envVar} כדי לאכוף אימות.`)
    return true
  }
  const fromQuery  = new URL(req.url).searchParams.get('secret')
  const fromHeader = req.headers.get('x-webhook-secret')
  return fromQuery === expected || fromHeader === expected
}

export function unauthorized(): NextResponse {
  return new NextResponse('Unauthorized', { status: 401 })
}
