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
