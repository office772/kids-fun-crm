// ─── PayPlus API helpers ─────────────────────────────────────────────────────
// פעולות API מול PayPlus: ביטול הוראות קבע, שליפת חיובים, וסנכרון.
// כל הפונקציות מחזירות שגיאה ידידותית אם ה-API חסום (לפני שהמסלול הופעל).
// ─────────────────────────────────────────────────────────────────────────────

const PAYPLUS_PROD_BASE    = 'https://restapi.payplus.co.il/api/v1.0'
const PAYPLUS_SANDBOX_BASE = 'https://restapidev.payplus.co.il/api/v1.0'

export function getPayPlusBase(): string {
  return process.env.PAYPLUS_SANDBOX === 'true' ? PAYPLUS_SANDBOX_BASE : PAYPLUS_PROD_BASE
}

function getAuthHeaders(): HeadersInit | null {
  const apiKey    = process.env.PAYPLUS_API_KEY
  const secretKey = process.env.PAYPLUS_SECRET_KEY
  if (!apiKey || !secretKey) return null
  return {
    'Content-Type': 'application/json',
    'api-key':      apiKey,
    'secret-key':   secretKey,
  }
}

interface PayPlusResult<T = unknown> {
  success: boolean
  data?:   T
  error?:  string
}

// ─── ביטול הוראת קבע ─────────────────────────────────────────────────────────
// POST /recurringpayments-deleterecurring-uid
export async function cancelRecurringPayment(recurringUid: string): Promise<PayPlusResult> {
  const headers = getAuthHeaders()
  if (!headers) return { success: false, error: 'PayPlus API לא מוגדר (חסרים מפתחות)' }
  if (!recurringUid) return { success: false, error: 'חסר מזהה הוראת קבע' }

  try {
    const res = await fetch(`${getPayPlusBase()}/recurringpayments-deleterecurring-uid`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({ recurring_payment_uid: recurringUid }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { success: false, error: `PayPlus HTTP ${res.status}: ${errText.slice(0, 200)}` }
    }

    const data = await res.json()
    if (data?.results?.status !== '1' && data?.results?.status !== 1) {
      return { success: false, error: data?.results?.description ?? 'PayPlus החזיר שגיאה' }
    }
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'שגיאת רשת' }
  }
}

// ─── שליפת חיובים שבוצעו ─────────────────────────────────────────────────────
// GET /recurringpaymentsreports-charged
export interface ChargedRecord {
  recurring_uid?:    string
  transaction_uid?:  string
  customer_name?:    string
  customer_phone?:   string
  amount?:           number
  payment_date?:     string
  payment_number?:   number
}

export async function fetchChargedReport(fromDate?: string, toDate?: string): Promise<PayPlusResult<ChargedRecord[]>> {
  const headers = getAuthHeaders()
  if (!headers) return { success: false, error: 'PayPlus API לא מוגדר' }
  try {
    const qs = new URLSearchParams()
    if (fromDate) qs.set('from_date', fromDate)
    if (toDate)   qs.set('to_date', toDate)
    const res = await fetch(`${getPayPlusBase()}/recurringpaymentsreports-charged?${qs}`, { method: 'GET', headers })
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    return { success: true, data: data?.data ?? data?.items ?? [] }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'שגיאת רשת' }
  }
}

// ─── שליפת חיובים שנכשלו ─────────────────────────────────────────────────────
// GET /recurringpaymentsreports-failures
export async function fetchFailuresReport(fromDate?: string, toDate?: string): Promise<PayPlusResult<ChargedRecord[]>> {
  const headers = getAuthHeaders()
  if (!headers) return { success: false, error: 'PayPlus API לא מוגדר' }
  try {
    const qs = new URLSearchParams()
    if (fromDate) qs.set('from_date', fromDate)
    if (toDate)   qs.set('to_date', toDate)
    const res = await fetch(`${getPayPlusBase()}/recurringpaymentsreports-failures?${qs}`, { method: 'GET', headers })
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    return { success: true, data: data?.data ?? data?.items ?? [] }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'שגיאת רשת' }
  }
}

// ─── שליפת כרטיסים שפג תוקפם ─────────────────────────────────────────────────
// GET /recurringpaymentsreports-expiredcards
export async function fetchExpiredCardsReport(): Promise<PayPlusResult<ChargedRecord[]>> {
  const headers = getAuthHeaders()
  if (!headers) return { success: false, error: 'PayPlus API לא מוגדר' }
  try {
    const res = await fetch(`${getPayPlusBase()}/recurringpaymentsreports-expiredcards`, { method: 'GET', headers })
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    return { success: true, data: data?.data ?? data?.items ?? [] }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'שגיאת רשת' }
  }
}

export function isPayPlusApiConfigured(): boolean {
  return !!(process.env.PAYPLUS_API_KEY && process.env.PAYPLUS_SECRET_KEY)
}
