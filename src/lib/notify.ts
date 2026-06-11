// ─── התראות וואטסאפ לנציגה ───────────────────────────────────────────────────
// תשתית מוכנה-מראש: כשמשימה דחופה/חשובה נוצרת, נשלחת הודעה לנייד הנציגה
// דרך uChat. כל עוד uChat לא מחובר — הפונקציה רושמת ללוג ולא עושה כלום,
// כך שאפשר לקרוא לה מכל מקום כבר עכשיו בלי תלות.
//
// הפעלה (כשמחברים את uChat) — שלושה משתני סביבה ב-Vercel:
//   UCHAT_API_TOKEN     — טוקן API מ-uChat (Settings → API Access)
//   UCHAT_STAFF_USER_NS — מזהה המנוי (user_ns) של הנציגה בבוט
//   UCHAT_BASE_URL      — אופציונלי, ברירת מחדל https://www.uchat.com.au
// ─────────────────────────────────────────────────────────────────────────────

export interface StaffNotification {
  text:      string
  priority?: 'דחוף' | 'גבוה' | 'רגיל'
}

export async function notifyStaff(notification: StaffNotification): Promise<boolean> {
  const token  = process.env.UCHAT_API_TOKEN
  const userNs = process.env.UCHAT_STAFF_USER_NS
  const base   = process.env.UCHAT_BASE_URL ?? 'https://www.uchat.com.au'

  const emoji = notification.priority === 'דחוף' ? '🔴' : notification.priority === 'גבוה' ? '🟠' : '🔔'
  const text  = `${emoji} *Kids & Fun — התראת מערכת*\n\n${notification.text}`

  // uChat עוד לא מחובר — רושמים ללוג בלבד (התשתית מוכנה, ההפעלה בהגדרת env)
  if (!token || !userNs) {
    console.log(`[notifyStaff] (uChat not configured) ${text.replace(/\n/g, ' | ')}`)
    return false
  }

  try {
    const res = await fetch(`${base}/api/subscriber/send-text`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ user_ns: userNs, text }),
    })
    if (!res.ok) {
      console.error(`[notifyStaff] uChat HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 150)}`)
      return false
    }
    console.log('[notifyStaff] ✅ Sent to staff WhatsApp')
    return true
  } catch (err) {
    console.error('[notifyStaff] Error:', err)
    return false
  }
}
