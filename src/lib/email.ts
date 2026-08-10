// ─── שליחת מיילים דרך Gmail של המשרד ─────────────────────────────────────────
// משתמש בסיסמת אפליקציה (App Password) של office@kidsandfun.co.il.
// שליחה אסינכרונית ולא-חוסמת: כשל במייל לעולם לא מפיל רישום.
// ─────────────────────────────────────────────────────────────────────────────

import nodemailer from 'nodemailer'
import { PAYPLUS_STATIC_LINKS } from '@/lib/bot/payment-helpers'

const AREA_LABELS: Record<string, string> = {
  carmel:  'חוף הכרמל',
  sharon:  'דרום השרון / חוף השרון',
  telaviv: 'גני ילדים תל אביב',
}

function getTransport() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
}

// ─── רשימת משתתפים/נוכחות שבועית לצוות מסגרת ─────────────────────────────────
export async function sendFrameworkRoster(params: {
  to:            string[]
  frameworkName: string
  participants:  { childName: string; className: string; parentName: string; parentPhone: string; parentEmail: string }[]
}): Promise<boolean> {
  const transport = getTransport()
  const recipients = params.to.filter(e => e && e.includes('@'))
  if (!transport || recipients.length === 0) return false

  const rows = params.participants.length
    ? params.participants.map((p, i) => `
        <tr style="border-bottom:1px solid #EFE3D5;">
          <td style="padding:8px 10px; color:#9A7B6B; text-align:center;">${i + 1}</td>
          <td style="padding:8px 10px; font-weight:600; color:#5E4B35;">${p.childName || '—'}</td>
          <td style="padding:8px 10px; color:#5E4B35;">${p.className || '—'}</td>
          <td style="padding:8px 10px; color:#5E4B35;">${p.parentName || '—'}</td>
          <td style="padding:8px 10px; color:#9A7B6B; direction:ltr; text-align:right;">${p.parentPhone || '—'}</td>
          <td style="padding:8px 10px; color:#9A7B6B; direction:ltr; text-align:right;">${p.parentEmail || '—'}</td>
        </tr>`).join('')
    : `<tr><td colspan="6" style="padding:16px; text-align:center; color:#9A7B6B;">אין משתתפים רשומים כרגע</td></tr>`

  const html = `
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; max-width: 640px; margin: 0 auto; background:#FDF8F0; padding:24px; border-radius:16px;">
    <div style="background:#fff; border:1px solid #E0CCB3; border-radius:16px; padding:24px;">
      <div style="text-align:center; margin-bottom:16px;">
        <div style="font-size:32px;">🌟</div>
        <h2 style="color:#6D436D; font-size:20px; margin:6px 0;">רשימת משתתפים — ${params.frameworkName}</h2>
        <p style="color:#9A7B6B; font-size:13px; margin:0;">${params.participants.length} משתתפים · Kids &amp; Fun</p>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <thead>
          <tr style="background:#FAF3EA; color:#6D436D;">
            <th style="padding:8px 10px; text-align:center;">#</th>
            <th style="padding:8px 10px; text-align:right;">שם הילד/ה</th>
            <th style="padding:8px 10px; text-align:right;">כיתה</th>
            <th style="padding:8px 10px; text-align:right;">הורה</th>
            <th style="padding:8px 10px; text-align:right;">טלפון</th>
            <th style="padding:8px 10px; text-align:right;">מייל</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p style="text-align:center; color:#b8a89a; font-size:12px; margin-top:16px;">
      רשימה שבועית אוטומטית · Kids &amp; Fun | office@kidsandfun.co.il
    </p>
  </div>`

  try {
    await transport.sendMail({
      from:    `"Kids & Fun" <${process.env.GMAIL_USER}>`,
      to:      recipients.join(', '),
      subject: `📋 רשימת משתתפים — ${params.frameworkName} (${params.participants.length})`,
      html,
    })
    console.log(`[Email] Roster sent to ${recipients.length} staff for ${params.frameworkName}`)
    return true
  } catch (err) {
    console.error('[Email] Failed to send roster:', err)
    return false
  }
}

// ─── התראת אדמין: פנייה חדשה (נציגה / כשל תשלום / דחוף) ───────────────────────
// נשלחת ל-office@kidsandfun.co.il (או ADMIN_ALERT_EMAIL). ערוץ אמין בלי מגבלת
// 24 השעות של וואטסאפ. לא-חוסם: כשל מייל לעולם לא מפיל את יצירת הפנייה.
const PRIORITY_EMOJI: Record<string, string> = { 'דחוף': '🔴', 'גבוה': '🟠', 'רגיל': '🔔' }

export async function sendAdminAlert(params: {
  taskType:     string
  description:  string
  priority?:    'דחוף' | 'גבוה' | 'רגיל'
  parentName?:  string
  parentPhone?: string
  to?:          string   // override יעד (לבדיקה); ברירת מחדל ADMIN_ALERT_EMAIL/GMAIL_USER
}): Promise<boolean> {
  const transport = getTransport()
  const to = params.to || process.env.ADMIN_ALERT_EMAIL || process.env.GMAIL_USER
  if (!transport || !to) return false

  const emoji = PRIORITY_EMOJI[params.priority ?? 'גבוה'] ?? '🔔'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kids-fun-app-psi.vercel.app'
  const row = (label: string, val?: string) => val
    ? `<tr><td style="padding:6px 10px; color:#9A7B6B; white-space:nowrap;">${label}</td>
         <td style="padding:6px 10px; color:#5E4B35; font-weight:600;">${val}</td></tr>`
    : ''

  const html = `
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin:0 auto; background:#FDF8F0; padding:24px; border-radius:16px;">
    <div style="background:#fff; border:1px solid #E0CCB3; border-radius:16px; padding:24px;">
      <div style="text-align:center; margin-bottom:12px;">
        <div style="font-size:30px;">${emoji}</div>
        <h2 style="color:#6D436D; font-size:19px; margin:6px 0;">פנייה חדשה במערכת</h2>
        <p style="color:#9A7B6B; font-size:13px; margin:0;">${params.taskType} · עדיפות ${params.priority ?? 'גבוה'}</p>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:14px; margin:8px 0 16px;">
        ${row('סוג', params.taskType)}
        ${row('הורה', params.parentName)}
        ${row('טלפון', params.parentPhone)}
        <tr><td style="padding:6px 10px; color:#9A7B6B; vertical-align:top;">פרטים</td>
            <td style="padding:6px 10px; color:#5E4B35;">${params.description}</td></tr>
      </table>
      <div style="text-align:center;">
        <a href="${appUrl}/dashboard" style="display:inline-block; background:#6D436D; color:#fff; text-decoration:none; padding:10px 22px; border-radius:999px; font-size:14px; font-weight:600;">
          פתחי בדשבורד →
        </a>
      </div>
    </div>
    <p style="text-align:center; color:#b8a89a; font-size:12px; margin-top:16px;">
      התראה אוטומטית · Kids &amp; Fun
    </p>
  </div>`

  try {
    await transport.sendMail({
      from:    `"Kids & Fun התראות" <${process.env.GMAIL_USER}>`,
      to,
      subject: `${emoji} פנייה חדשה: ${params.taskType}${params.parentName ? ` — ${params.parentName}` : ''}`,
      html,
    })
    console.log(`[Email] Admin alert sent (${params.taskType}) → ${to}`)
    return true
  } catch (err) {
    console.error('[Email] Failed to send admin alert:', err)
    return false
  }
}

export async function sendRegistrationConfirmation(params: {
  to:         string
  parentName: string
  childName:  string
  areaCode:   string
  className?: string
  school?:    string
}): Promise<boolean> {
  const transport = getTransport()
  if (!transport || !params.to || !params.to.includes('@')) return false

  const areaLabel  = AREA_LABELS[params.areaCode] ?? params.areaCode
  const paymentUrl = PAYPLUS_STATIC_LINKS[params.areaCode]
  const firstName  = params.parentName?.split(' ')[0] || ''

  const html = `
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; background: #fdf6ef; padding: 24px; border-radius: 16px;">
    <div style="background: #fff; border-radius: 16px; padding: 32px; text-align: center;">
      <div style="font-size: 40px;">🌟</div>
      <h1 style="color: #5c3d2e; font-size: 24px; margin: 8px 0;">Kids &amp; Fun</h1>
      <h2 style="color: #5c3d2e; font-size: 20px; margin: 16px 0 8px;">הרישום התקבל בהצלחה!</h2>
      <p style="color: #555; font-size: 16px; line-height: 1.7;">
        היי ${firstName} 💛<br/>
        קיבלנו את הרישום של <b>${params.childName}</b> לצהרון ${areaLabel}${params.school ? ` — ${params.school}` : ''}${params.className ? ` (כיתה ${params.className})` : ''}.
      </p>
      ${paymentUrl ? `
      <p style="color: #555; font-size: 16px;">נותר צעד אחרון להשלמת הרישום:</p>
      <a href="${paymentUrl}"
         style="display: inline-block; background: #5c8a4e; color: #fff; font-size: 18px; font-weight: bold; text-decoration: none; padding: 14px 28px; border-radius: 12px; margin: 8px 0 16px;">
        💳 להסדרת התשלום (הוראת קבע)
      </a>
      <p style="color: #999; font-size: 13px;">התשלום מאובטח דרך PayPlus. לאחר ההסדרה הרישום יושלם.</p>
      ` : `
      <p style="color: #555; font-size: 16px;">הצוות שלנו יצור אתכם קשר בהקדם לאישור ופרטי תשלום.</p>
      `}
      <div style="background: #f5e6d8; border-radius: 12px; padding: 14px; color: #5c3d2e; font-size: 14px; margin-top: 16px;">
        מעדיפים לשלם אחרת (מזומן / צ׳קים / העברה)?<br/>📱 השיבו למייל הזה או כתבו לנו בוואטסאפ
      </div>
    </div>
    <p style="text-align: center; color: #b8a89a; font-size: 12px; margin-top: 16px;">
      Kids &amp; Fun — צהרונים וקייטנות | office@kidsandfun.co.il
    </p>
  </div>`

  try {
    await transport.sendMail({
      from:    `"Kids & Fun" <${process.env.GMAIL_USER}>`,
      to:      params.to,
      subject: `🌟 הרישום של ${params.childName} לצהרון התקבל — נותר רק להסדיר תשלום`,
      html,
    })
    console.log(`[Email] Confirmation sent to ${params.to} (${params.childName})`)
    return true
  } catch (err) {
    console.error('[Email] Failed to send confirmation:', err)
    return false
  }
}
