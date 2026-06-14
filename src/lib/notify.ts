// ─── התראות וואטסאפ לנציגה ולצוות המסגרת ─────────────────────────────────────
// תשתית מוכנה-מראש: כשמשימה דחופה/חשובה נוצרת, נשלחת הודעה לנייד הנציגה
// דרך uChat. כל עוד uChat לא מחובר — הפונקציה רושמת ללוג ולא עושה כלום,
// כך שאפשר לקרוא לה מכל מקום כבר עכשיו בלי תלות.
//
// הפעלה (כשמחברים את uChat) — שלושה משתני סביבה ב-Vercel:
//   UCHAT_API_TOKEN     — טוקן API מ-uChat (Settings → API Access)
//   UCHAT_STAFF_USER_NS — מזהה המנוי (user_ns) של הנציגה הראשית בבוט
//   UCHAT_BASE_URL      — אופציונלי, ברירת מחדל https://www.uchat.com.au
//
// אם מצוין frameworkContext (אזור+שם מסגרת/בי"ס) — ההודעה תישלח גם לצוות
// המסגרת מטבלת framework_staff. לכל איש צוות עם טלפון נשלחת הודעה נפרדת.
// הנציגה הראשית מקבלת תמיד עותק (כברירת מחדל).
// ─────────────────────────────────────────────────────────────────────────────

export interface StaffNotification {
  text:      string
  priority?: 'דחוף' | 'גבוה' | 'רגיל'
  // הקשר מסגרת אופציונלי — אם מצוין, נשלף הצוות שלה ותישלח לו הודעה
  framework?: {
    area_code:  string                  // 'carmel' / 'sharon' / 'telaviv'
    school?:    string                  // שם בי"ס / גן (התאמה מילולית)
    type?:      'צהרון' | 'קייטנה'      // ברירת מחדל: צהרון
  }
}

async function sendUchatMessage(userNs: string, text: string): Promise<boolean> {
  const token = process.env.UCHAT_API_TOKEN
  const base  = process.env.UCHAT_BASE_URL ?? 'https://www.uchat.com.au'
  if (!token) return false
  try {
    const res = await fetch(`${base}/api/subscriber/send-text`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ user_ns: userNs, text }),
    })
    if (!res.ok) {
      console.error(`[notifyStaff] uChat HTTP ${res.status} for ${userNs}: ${(await res.text().catch(() => '')).slice(0, 120)}`)
      return false
    }
    return true
  } catch (err) {
    console.error('[notifyStaff] uChat error:', err)
    return false
  }
}

export async function notifyStaff(notification: StaffNotification): Promise<boolean> {
  const adminUserNs = process.env.UCHAT_STAFF_USER_NS
  const emoji = notification.priority === 'דחוף' ? '🔴' : notification.priority === 'גבוה' ? '🟠' : '🔔'
  const baseText  = `${emoji} *Kids & Fun — התראת מערכת*\n\n${notification.text}`

  // שליפת צוות המסגרת (אם רלוונטי) — לרשימת נמענים נוספת מעבר לאדמין
  const recipients: { label: string; userNs?: string; phone?: string }[] = []
  if (adminUserNs) recipients.push({ label: 'אדמין', userNs: adminUserNs })

  if (notification.framework) {
    try {
      const { createServiceClient } = await import('@/lib/supabase/server')
      const supabase = createServiceClient()
      const { data: fws } = await supabase
        .from('frameworks')
        .select('id, name, staff:framework_staff(name, phone, role, is_active)')
        .eq('area_code', notification.framework.area_code)
        .eq('type', notification.framework.type ?? 'צהרון')
        .eq('is_active', true)

      // התאמת מסגרת לפי שם בי"ס (אם מסופק) — אחרת כל המסגרות באזור
      const matched = notification.framework.school
        ? (fws ?? []).filter((f: { name: string }) =>
            f.name === notification.framework!.school ||
            f.name.includes(notification.framework!.school!) || notification.framework!.school!.includes(f.name))
        : (fws ?? [])

      for (const fw of matched) {
        const staffList = (fw.staff ?? []) as { name: string; phone: string | null; role: string | null; is_active: boolean }[]
        for (const s of staffList) {
          if (!s.is_active || !s.phone) continue
          recipients.push({ label: `${fw.name} — ${s.name}${s.role ? ` (${s.role})` : ''}`, phone: s.phone })
        }
      }
    } catch (err) {
      console.error('[notifyStaff] framework lookup error:', err)
    }
  }

  // אם uChat לא מוגדר — רושמים ללוג מי היה אמור לקבל
  if (!process.env.UCHAT_API_TOKEN || !adminUserNs) {
    const targetsLog = recipients.map(r => r.userNs ? `${r.label} [uChat]` : `${r.label} [טלפון: ${r.phone}]`).join(' | ')
    console.log(`[notifyStaff] (uChat not configured) → ${targetsLog || 'no recipients'} :: ${baseText.replace(/\n/g, ' | ')}`)
    return false
  }

  // שליחה בפועל — לכל user_ns ידוע. לאנשי צוות עם טלפון בלבד (ולא user_ns) נדרשת
  // הגדרה עתידית של מיפוי טלפון→user_ns ב-uChat; כרגע אנחנו רושמים ללוג.
  let sentCount = 0
  for (const r of recipients) {
    if (r.userNs) {
      if (await sendUchatMessage(r.userNs, baseText)) sentCount++
    } else if (r.phone) {
      console.log(`[notifyStaff] would send to ${r.label} (${r.phone}) — phone→uChat mapping not yet configured`)
    }
  }
  console.log(`[notifyStaff] sent to ${sentCount}/${recipients.length} recipients`)
  return sentCount > 0
}
