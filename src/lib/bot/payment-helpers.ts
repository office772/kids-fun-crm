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

  // ─── דמו מוד — סימולציה מציאותית ─────────────────────────────────────────
  if (isDemoMode()) {
    return simulatePayPlusResponse(params)
  }

  const apiKey  = process.env.PAYPLUS_API_KEY
  const secretKey = process.env.PAYPLUS_SECRET_KEY
  const pageUid = process.env.PAYPLUS_PAGE_UID

  if (!apiKey || !secretKey || !pageUid) {
    console.warn('[PayPlus] Missing env vars: PAYPLUS_API_KEY / PAYPLUS_SECRET_KEY / PAYPLUS_PAGE_UID')
    return { success: false, error: 'PayPlus לא מוגדר — בדוק .env.local' }
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kidsandfun.co.il'

    const body: Record<string, unknown> = {
      payment_page_uid: pageUid,
      charge_default:   params.amount,
      charge_method:    params.paymentType === 'standing_order' ? 3 : 0,
      order: {
        external_uid: params.registrationId,
        description:  params.description,
      },
      customer: {
        customer_name: params.parentName,
        phone:         params.phone.replace(/\D/g, '').replace(/^0/, '972'),
      },
      items: [
        {
          name:     params.description,
          quantity: 1,
          price:    params.amount,
          vat_type: 1,  // 1 = כולל מע"מ
        },
      ],
      success_url:  `${appUrl}/payment-success?reg=${params.registrationId}`,
      fail_url:     `${appUrl}/payment-fail?reg=${params.registrationId}`,
      callback_url: `${appUrl}/api/webhooks/payplus`,
      lang:         'he',
    }

    // ─── הוראת קבע — הגדרות חיוב חוזר ────────────────────────────────────
    if (params.paymentType === 'standing_order') {
      body.recurring_settings = {
        billing_cycle: 'monthly',
        trial_days:    0,
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
      return { success: false, error: `PayPlus HTTP ${res.status}: ${errText.slice(0, 120)}` }
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

    if (!reg) return

    if (reg.child) {
      const child = Array.isArray(reg.child) ? reg.child[0] : reg.child
      session.collectedData.child_name      = child.name
      session.collectedData.area_label      = reg.area_label ?? ''
      session.collectedData.area_code       = reg.area_code  ?? ''
      session.collectedData.registration_id = reg.id
    }

    // עלות לפי branch (TODO: משוך מ-branches.monthly_fee)
    session.collectedData.monthly_fee = session.collectedData.monthly_fee ?? String(DEFAULT_MONTHLY_FEE)

  } catch (err) {
    console.error('[loadParentRegistrationContext] Error:', err)
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
