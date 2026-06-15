// ─── PayPlus Integration ───────────────────────────────────────────────────
// PayPlus REST API — https://docs.payplus.co.il/
//
// Auth: נפרד — 'api-key' + 'secret-key' כ-HTTP headers (לא JSON)
// Endpoint: POST https://restapi.payplus.co.il/api/v1.0/PaymentPages/generateLink
// Sandbox:  POST https://restapidev.payplus.co.il/api/v1.0/PaymentPages/generateLink
//
// Response: { results: { status: '1', description: '...' }, data: { payment_page_link, page_request_uid } }
//
// PayPlus תומך ב:
//   1. תשלום אשראי חד-פעמי / חיוב חודשי  → charge_method: 0
//   2. הוראת קבע (הרשאת חיוב חוזר)        → charge_method: 3 + recurring_settings
//
// ⚠️  PayPlus לא תומך בקישורי תשלום מיידיים (instant payment links).
//     לקישורי תשלום מיידיים → חשבונית ירוקה (getInvoiceLink)
// ──────────────────────────────────────────────────────────────────────────────

import type { BotSession } from '@/lib/types'

export type PaymentMethod =
  | 'credit'           // 💳 כרטיס אשראי — חיוב חודשי דרך PayPlus
  | 'standing_order'   // 🏦 הוראת קבע — PayPlus recurring
  | 'cash'             // 💵 מזומן — תשלום ידני בתחילת כל חודש
  | 'checks'           // 📝 צ׳קים — מראש
  | 'bank_transfer'    // 🏛️ העברה בנקאית
  | 'invoice_link'     // 🔗 קישור תשלום מיידי — חשבונית ירוקה

export interface PayPlusOrderParams {
  registrationId: string
  parentName:     string
  phone:          string
  childName:      string
  areaCode:       string
  areaLabel?:     string
  amount:         number          // בשקלים
  description:    string
  paymentType:    'credit' | 'standing_order'
}

export interface PayPlusOrderResult {
  success:     boolean
  paymentUrl?: string   // קישור לדף תשלום PayPlus
  orderId?:    string   // page_request_uid ב-PayPlus
  error?:      string
  isDemo?:     boolean
}

const PAYPLUS_PROD_BASE    = 'https://restapi.payplus.co.il/api/v1.0'
const PAYPLUS_SANDBOX_BASE = 'https://restapidev.payplus.co.il/api/v1.0'

function getPayPlusBase(): string {
  return process.env.PAYPLUS_SANDBOX === 'true' ? PAYPLUS_SANDBOX_BASE : PAYPLUS_PROD_BASE
}

// ─── לינקי תשלום PayPlus סטטיים ──────────────────────────────────────────────
// generateLink API חסום בחשבון זה — משתמשים בלינקים קיימים מהדשבורד.
// עדכן כתובות לפי אזור אם תקבלי לינקים מתאימים יותר.
export const PAYPLUS_STATIC_LINKS: Record<string, string> = {
  carmel:  'https://payments.payplus.co.il/l/743bc04a-0e38-4968-afce-24ddcc2d3a4f', // עתלית ₪935
  telaviv: 'https://payments.payplus.co.il/l/249fdfe7-dd8d-4e31-9509-08d5d7a4b82c', // גני תל אביב ₪946
  sharon:  'https://payments.payplus.co.il/l/0cbaab71-413b-4d45-b7e4-eef549c09bdf', // גני רשפון ₪1470
  default: 'https://payments.payplus.co.il/l/743bc04a-0e38-4968-afce-24ddcc2d3a4f',
}

// ─── סימולציית דמו לפיתוח ────────────────────────────────────────────────────
function simulatePayPlusResponse(params: PayPlusOrderParams): PayPlusOrderResult {
  const demoOrderId = `DEMO-${Math.random().toString(36).substr(2, 8).toUpperCase()}`
  const demoUrl     = `https://payments.payplus.co.il/demo-link/${demoOrderId}`
  console.log(`[PayPlus DEMO] Simulated link for ${params.childName} (${params.amount}₪): ${demoUrl}`)
  return {
    success:    true,
    paymentUrl: demoUrl,
    orderId:    demoOrderId,
    isDemo:     true,
  }
}

// ─── יצירת קישור תשלום ב-PayPlus ──────────────────────────────────────────
export async function createPayPlusPaymentLink(
  params: PayPlusOrderParams
): Promise<PayPlusOrderResult> {
  const { isDemoMode } = await import('@/lib/demo-data')

  // ─── דמו מוד (demo data בלבד) — סימולציה ─────────────────────────────────
  if (isDemoMode()) {
    return simulatePayPlusResponse(params)
  }

  const apiKey    = process.env.PAYPLUS_API_KEY
  const secretKey = process.env.PAYPLUS_SECRET_KEY
  const pageUid   = process.env.PAYPLUS_PAGE_UID

  // ─── אין מפתחות API — fallback ללינקים סטטיים (כמו לפני הפתיחה) ─────────
  if (!apiKey || !secretKey || !pageUid) {
    const staticUrl = PAYPLUS_STATIC_LINKS[params.areaCode] ?? PAYPLUS_STATIC_LINKS.default
    if (staticUrl) {
      console.log(`[PayPlus] No API keys — static link for area=${params.areaCode}`)
      return { success: true, paymentUrl: staticUrl }
    }
    return { success: false, error: 'PayPlus לא מוגדר — בדוק .env.local' }
  }

  // ─── מכאן והלאה: קריאה אמיתית ל-API (sandbox או prod לפי PAYPLUS_SANDBOX) ─

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kidsandfun.co.il'

    // ─── מבנה הבקשה לפי הדוקומנטציה הרשמית של PayPlus ───────────────────
    // https://docs.payplus.co.il/reference/post_paymentpages-generatelink
    //
    // charge_method: 0=Check, 1=Charge, 2=Approval, 3=Recurring, 4=Refund, 5=Token
    // הוראת קבע = 3, חיוב חד-פעמי או חודשי באשראי = 1
    const body: Record<string, unknown> = {
      payment_page_uid:   pageUid,
      amount:             params.amount,
      currency_code:      'ILS',
      charge_method:      params.paymentType === 'standing_order' ? 3 : 1,
      sendEmailApproval:  true,
      sendEmailFailure:   true,
      send_failure_callback: true,   // קריטי: callback גם על כשלי חיוב, לא רק הצלחות
      // refURL_callback מקבל את האיוונט בכל חיוב חדש — כולל חיובים חודשיים מתחדשים
      refURL_success:  `${appUrl}/payment-success?reg=${params.registrationId}`,
      refURL_failure:  `${appUrl}/payment-fail?reg=${params.registrationId}`,
      refURL_cancel:   `${appUrl}/payment-fail?reg=${params.registrationId}&cancelled=1`,
      refURL_callback: `${appUrl}/api/webhooks/payplus`,
      // לקוח + פריטים — פותחים את כרטיס הלקוח ב-PayPlus ומופיע בחשבונית
      customer: {
        customer_name: params.parentName,
        phone:         params.phone.replace(/\D/g, '').replace(/^0/, '972'),
      },
      items: [{
        name:     params.description,
        quantity: 1,
        price:    params.amount,
        vat_type: 1,                 // 1 = כולל מע"מ
      }],
      // external_uid — המזהה שלנו לזיהוי הרישום, מוחזר בכל callback
      order: {
        external_uid: params.registrationId,
        description:  params.description,
      },
      paying_vat: true,
      lang:       'he',
    }

    // ─── הוראת קבע — הגדרות חיוב חוזר (לפי דוק PayPlus) ─────────────────
    // recurring_type: 0=Daily, 1=Weekly, 2=Monthly | range: כל כמה (1=כל חודש)
    // number_of_charges: 0 = ללא הגבלה
    if (params.paymentType === 'standing_order') {
      // start_date — יום בחודש (1-31) לא תאריך מלא! PayPlus יחייב בכל חודש ביום הזה.
      // נבדק מול ה-API ב-2026-06-15: ערך 16 → success, "2026-06-16" → integer error.
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      body.recurring_settings = {
        recurring_type:     2,                  // 2 = Monthly
        recurring_range:    1,                  // כל חודש אחד
        number_of_charges:  0,                  // ללא הגבלה
        start_date:         tomorrow.getDate(), // יום בחודש בלבד (1-31)
      }
    }

    // ─── PayPlus auth — headers נפרדים (לא JSON) ──────────────────────────
    const res = await fetch(`${getPayPlusBase()}/PaymentPages/generateLink`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key':      apiKey,
        'secret-key':   secretKey,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { success: false, error: `PayPlus HTTP ${res.status}: ${errText.slice(0, 500)}` }
    }

    // תגובת PayPlus:
    // { results: { status: '1', description: 'OK' }, data: { payment_page_link, page_request_uid } }
    const data = await res.json()

    if (data?.results?.status !== '1') {
      return {
        success: false,
        error:   data?.results?.description ?? 'PayPlus החזיר שגיאה',
      }
    }

    return {
      success:    true,
      paymentUrl: data?.data?.payment_page_link,
      orderId:    data?.data?.page_request_uid,   // ← תוקן: היה uid
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאת רשת'
    return { success: false, error: msg }
  }
}

// ─── חשבונית ירוקה — קישור תשלום מיידי ─────────────────────────────────────
// בדמו: מחזיר URL לדוגמה
// בפרודקשן: יוצר מסמך ב-API ומחזיר קישור אמיתי
export async function getInvoiceLink(params?: {
  customerName?: string
  amount?: number
  description?: string
}): Promise<string | null> {
  const { isDemoMode } = await import('@/lib/demo-data')

  if (isDemoMode()) {
    return 'https://pages.greeninvoice.co.il/payments/links/DEMO-KF2025'
  }

  // ─── ניסיון לייצר קישור חדש ב-API ────────────────────────────────────────
  if (params?.customerName && params?.amount) {
    try {
      const { createGreenInvoicePaymentLink } = await import('@/lib/greeninvoice')
      const result = await createGreenInvoicePaymentLink({
        customerName: params.customerName,
        amount:       params.amount,
        description:  params.description ?? 'תשלום חודשי Kids & Fun',
      })
      if (result.success && result.paymentUrl) return result.paymentUrl
    } catch (err) {
      console.error('[GreenInvoice] Error creating link:', err)
    }
  }

  // ─── fallback — קישור שמור ב-bot_assets ──────────────────────────────────
  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('bot_assets')
      .select('url')
      .eq('key', 'payment_link')
      .eq('is_active', true)
      .maybeSingle()
    return data?.url ?? null
  } catch {
    return null
  }
}

// ─── פרסונליזציה — טעינת נתוני רישום ההורה ─────────────────────────────────
// נקרא בתחילת payment_setup_start כדי לאכלס את session.collectedData
export async function loadParentRegistrationContext(
  phone: string,
  session: BotSession
): Promise<void> {
  try {
    const { isDemoMode, DEMO_REGISTRATIONS, DEMO_PARENTS } = await import('@/lib/demo-data')

    if (isDemoMode()) {
      // ─── דמו מוד ────────────────────────────────────────────────────────
      // נרמל פורמט טלפון
      const normalizedPhone = phone.replace(/\D/g, '').replace(/^972/, '0')

      // חפש הורה
      const parent = DEMO_PARENTS.find(p => {
        const pNorm = p.phone.replace(/\D/g, '').replace(/^972/, '0')
        return pNorm === normalizedPhone || p.phone === phone
      })

      if (!parent) return

      // מצא רישום פעיל (מאושר / ממתין לאישור)
      const reg = DEMO_REGISTRATIONS.find(r =>
        r.parent_id === parent.id &&
        (r.status === 'מאושר' || r.status === 'ממתין לאישור')
      )

      if (reg?.child) {
        session.collectedData.child_name      = reg.child.name
        session.collectedData.area_label      = reg.area_label ?? ''
        session.collectedData.area_code       = reg.area_code  ?? 'sharon'
        session.collectedData.registration_id = reg.id
      }

      // עלות לפי אזור (demo)
      const areaFees: Record<string, number> = {
        sharon:  920,
        carmel:  880,
        telaviv: 950,
      }
      const areaCode = reg?.area_code ?? 'sharon'
      session.collectedData.monthly_fee = String(areaFees[areaCode] ?? DEFAULT_MONTHLY_FEE)

      return
    }

    // ─── Supabase mode ───────────────────────────────────────────────────────
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()

    // מצא הורה לפי טלפון
    const { data: parent } = await supabase
      .from('parents')
      .select('id, name')
      .or(`phone.eq.${phone},phone.eq.972${phone.replace(/^0/, '')}`)
      .maybeSingle()

    if (!parent) return

    // מצא רישום פעיל
    const { data: reg } = await supabase
      .from('registrations')
      .select('id, area_code, area_label, child:children(id, name)')
      .eq('parent_id', parent.id)
      .in('status', ['מאושר', 'ממתין לאישור'])
      .order('created_at', { ascending: false })
      .maybeSingle()

    if (reg?.child) {
      const child = Array.isArray(reg.child) ? reg.child[0] : reg.child
      session.collectedData.child_name      = child.name
      session.collectedData.area_label      = reg.area_label ?? ''
      session.collectedData.area_code       = reg.area_code  ?? ''
      session.collectedData.registration_id = reg.id
    } else {
      // אין רישום פורמלי — לחפש ילד צהרון אצל ההורה (ייבוא היסטורי)
      const { data: kid } = await supabase
        .from('children')
        .select('id, name, area_code')
        .eq('parent_id', parent.id)
        .in('framework', ['צהרון', 'שניהם'])
        .not('name', 'in', '(—,–,-,*,?)')
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle()
      if (kid?.name) {
        session.collectedData.child_name = kid.name
        if (kid.area_code) session.collectedData.area_code = kid.area_code
      }
    }

    // עלות לפי branch (TODO: משוך מ-branches.monthly_fee)
    session.collectedData.monthly_fee = session.collectedData.monthly_fee ?? String(DEFAULT_MONTHLY_FEE)

  } catch (err) {
    console.error('[loadParentRegistrationContext] Error:', err)
  }
}

// ─── בדיקת סטטוס תשלום אמיתי מ-Supabase ─────────────────────────────────────
// חיפוש לפי טלפון הפונה, או לפי שם ילד (כשהטלפון לא מזוהה).
// מחזיר טקסט מוכן לשליחה, או null אם לא נמצא כלום.

const PAYMENT_STATUS_EMOJI: Record<string, string> = {
  'שולם':  '🟢',
  'ממתין': '🟡',
  'נכשל':  '🔴',
  'חלקי':  '🟠',
  'זיכוי': '⚪',
}

interface PaymentRow {
  amount:         number | null
  status:         string
  payment_type:   string | null
  paid_at:        string | null
  payment_number: number | null
  total_payments: number | null
  created_at:     string
}

function formatPaymentStatusText(parentName: string | null, payments: PaymentRow[]): string {
  const latest = payments[0]
  const emoji  = PAYMENT_STATUS_EMOJI[latest.status] ?? '💳'
  const date   = latest.paid_at ?? latest.created_at
  const dateStr = date ? new Date(date).toLocaleDateString('he-IL') : ''
  const progress = latest.payment_number && latest.total_payments
    ? `\nתשלום *${latest.payment_number}* מתוך *${latest.total_payments}*`
    : latest.payment_number
      ? `\nתשלום מס׳ *${latest.payment_number}*`
      : ''

  let text =
    `🔍 *סטטוס תשלום${parentName ? ` — ${parentName}` : ''}*\n\n` +
    `${emoji} *${latest.status}*` +
    `${latest.amount ? ` — ₪${Number(latest.amount).toLocaleString()}` : ''}` +
    `${latest.payment_type ? ` (${latest.payment_type})` : ''}` +
    progress +
    `${dateStr ? `\nעדכון אחרון: ${dateStr}` : ''}`

  if (latest.status === 'נכשל') {
    text += `\n\n⚠️ נראה שיש חיוב שלא עבר — כתבו *"כשל תשלום"* ונסדר את זה ביחד 💛`
  } else if (latest.status === 'ממתין') {
    text += `\n\nכדי להסדיר את התשלום — כתבו *"אפשרויות תשלום"* 💛`
  } else {
    text += `\n\nהכל מסודר! יש שאלה? כתבו לנו 💛`
  }
  return text
}

export async function getPaymentStatusByPhone(phone: string): Promise<string | null> {
  try {
    const { isDemoMode } = await import('@/lib/demo-data')
    if (isDemoMode() || !phone || phone === 'simulator') return null

    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()

    const normalized = phone.replace(/\D/g, '').replace(/^972/, '0')
    const intl       = '972' + normalized.replace(/^0/, '')

    const { data: parent } = await supabase
      .from('parents')
      .select('id, name')
      .or(`phone.eq.${normalized},phone.eq.${intl},phone.eq.${phone}`)
      .maybeSingle()

    if (!parent) return null

    const { data: payments } = await supabase
      .from('payments')
      .select('amount, status, payment_type, paid_at, payment_number, total_payments, created_at')
      .eq('parent_id', parent.id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (!payments?.length) return null
    return formatPaymentStatusText(parent.name, payments as PaymentRow[])
  } catch (err) {
    console.error('[getPaymentStatusByPhone] Error:', err)
    return null
  }
}

export async function getPaymentStatusByChildName(childName: string): Promise<string | null> {
  try {
    const { isDemoMode } = await import('@/lib/demo-data')
    if (isDemoMode()) return null

    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()

    // התאמה מדויקת לשם הילד; אם אין — חיפוש מכיל
    let { data: children } = await supabase
      .from('children').select('id, name, parent_id')
      .ilike('name', childName.trim()).limit(2)

    if (!children?.length) {
      const res = await supabase
        .from('children').select('id, name, parent_id')
        .ilike('name', `%${childName.trim()}%`).limit(2)
      children = res.data
    }

    // דורשים התאמה חד-משמעית — אם יש כמה ילדים עם אותו שם, לא מנחשים
    if (!children || children.length !== 1) return null

    const { data: parent } = await supabase
      .from('parents').select('id, name')
      .eq('id', children[0].parent_id).maybeSingle()

    const { data: payments } = await supabase
      .from('payments')
      .select('amount, status, payment_type, paid_at, payment_number, total_payments, created_at')
      .eq('parent_id', children[0].parent_id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (!payments?.length) return null
    return formatPaymentStatusText(parent?.name ?? children[0].name, payments as PaymentRow[])
  } catch (err) {
    console.error('[getPaymentStatusByChildName] Error:', err)
    return null
  }
}

// ─── פרטי חשבון בנק להעברה ─────────────────────────────────────────────────
export const BANK_TRANSFER_DETAILS = {
  bankName:      'בנק לאומי',
  branchNumber:  '900',
  accountNumber: '12345678',
  accountName:   'קידס אנד פאן בע"מ',
  note:          'חובה לציין שם ילד + אזור בהערות',
}

export function formatBankTransferMessage(): string {
  const b = BANK_TRANSFER_DETAILS
  return (
    `🏛️ *פרטי חשבון בנק:*\n\n` +
    `בנק: *${b.bankName}*\n` +
    `סניף: *${b.branchNumber}*\n` +
    `חשבון: *${b.accountNumber}*\n` +
    `שם חשבון: *${b.accountName}*\n\n` +
    `⚠️ ${b.note}\n\n` +
    `לאחר ביצוע ההעברה — שלחו צילום מסך אישור`
  )
}

// ─── תבנית הודעת הצעת מקום (פרואקטיבי מהמערכת) ─────────────────────────────
export function buildSpotOfferMessage(
  parentFirstName: string,
  childName:       string,
  areaLabel:       string,
  waitingPosition: number
): string {
  return (
    `היי ${parentFirstName}! 🎉\n\n` +
    `*יש לנו מקום פנוי!*\n\n` +
    `*${childName}* ב${areaLabel} — אתם במקום *${waitingPosition}* ברשימת ההמתנה ` +
    `וכעת יש מקום זמין! 🌟\n\n` +
    `האם תרצו לאשר את הרישום ולסדר תשלום?\n\n` +
    `*כן* — אשר/י ונתקדם לסידור תשלום 💛\n` +
    `*לא* — תודה, נעבור לאדם הבא ברשימה`
  )
}

// ─── עלות חודשית ברירת מחדל ─────────────────────────────────────────────────
export const DEFAULT_MONTHLY_FEE = 799  // ₪ — ברירת מחדל כשאין נתון ספציפי
