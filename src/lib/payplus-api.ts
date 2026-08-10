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

// ─── עדכון הוראת קבע — שינוי תאריך חיוב חודשי ───────────────────────────────
// POST /recurringpayments-update-uid
export async function updateRecurringBillingDate(
  recurringUid: string,
  newDayOfMonth: number
): Promise<PayPlusResult> {
  const headers = getAuthHeaders()
  if (!headers) return { success: false, error: 'PayPlus API לא מוגדר' }
  if (!recurringUid) return { success: false, error: 'חסר מזהה הוראת קבע' }
  if (newDayOfMonth < 1 || newDayOfMonth > 28) {
    return { success: false, error: 'יום החיוב חייב להיות בין 1 ל-28' }
  }
  try {
    const res = await fetch(`${getPayPlusBase()}/recurringpayments-update-uid`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({
        recurring_payment_uid: recurringUid,
        billing_day:           newDayOfMonth,
      }),
    })
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    if (data?.results?.status !== '1' && data?.results?.status !== 1) {
      return { success: false, error: data?.results?.description ?? 'PayPlus החזיר שגיאה' }
    }
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'שגיאת רשת' }
  }
}

// ─── עדכון כרטיס בהוראת קבע קיימת (כשל תשלום) ───────────────────────────────
// POST /RecurringPayments/CreditCardRenewal/{recurring_uid}
// מחזיר לינק לדף תשלום להזנת כרטיס חדש — *על אותה הוראת קבע*, בלי ליצור חדשה
// ובלי לבטל את הקיימת. זה הפתרון לכשל תשלום (מונע הוראת קבע כפולה).
// דורש PAYPLUS_TERMINAL_UID + payment page משויך לטרמינל.
export async function renewRecurringCard(recurringUid: string): Promise<PayPlusResult<{ paymentUrl?: string; emailed: boolean }>> {
  const headers = getAuthHeaders()
  if (!headers) return { success: false, error: 'PayPlus API לא מוגדר (חסרים מפתחות)' }
  if (!recurringUid) return { success: false, error: 'חסר מזהה הוראת קבע' }
  const terminalUid = process.env.PAYPLUS_TERMINAL_UID
  if (!terminalUid) return { success: false, error: 'חסר PAYPLUS_TERMINAL_UID — להגדיר ב-Vercel' }

  try {
    const res = await fetch(`${getPayPlusBase()}/RecurringPayments/CreditCardRenewal/${recurringUid}`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({ terminal_uid: terminalUid }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { success: false, error: `PayPlus HTTP ${res.status}: ${errText.slice(0, 200)}` }
    }
    const data = await res.json()
    // PayPlus מחזיר את הסטטוס לעיתים תחת result (יחיד — כמו בתיעוד CreditCardRenewal),
    // לעיתים results (רבים), ולעיתים ברמה העליונה. בודקים את כולם.
    const r = data?.result ?? data?.results ?? data
    const ok = r?.code === 0 || r?.status === 'success' || r?.status === '1' || r?.status === 1
    if (!ok) {
      return { success: false, error: r?.description ?? data?.description ?? 'PayPlus החזיר שגיאה' }
    }
    const d = data?.data ?? {}
    const url = d.payment_page_link ?? d.link ?? d.payment_page_request_link ?? d.payment_page_request_uid_link
      ?? data?.payment_page_link ?? data?.link ?? undefined
    // הצלחה = PayPlus שלח ללקוח מייל עם קישור לעדכון הכרטיס (Vault). אם חזר גם לינק — נשתמש בו לוואטסאפ.
    return { success: true, data: { paymentUrl: url, emailed: true } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'שגיאת רשת' }
  }
}

// ─── ביטול הוראת קבע ─────────────────────────────────────────────────────────
// POST /recurringpayments-deleterecurring-uid
export async function cancelRecurringPayment(recurringUid: string): Promise<PayPlusResult> {
  const headers = getAuthHeaders()
  if (!headers) return { success: false, error: 'PayPlus API לא מוגדר (חסרים מפתחות)' }
  if (!recurringUid) return { success: false, error: 'חסר מזהה הוראת קבע' }

  try {
    const res = await fetch(`${getPayPlusBase()}/recurringpayments/deleterecurring/${recurringUid}`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({}),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { success: false, error: `PayPlus HTTP ${res.status}: ${errText.slice(0, 200)}` }
    }

    const data = await res.json()
    const r = data?.result ?? data?.results ?? data
    if (!(r?.code === 0 || r?.status === 'success' || r?.status === '1' || r?.status === 1)) {
      return { success: false, error: r?.description ?? 'PayPlus החזיר שגיאה' }
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
  recurring_number?: string
  // uid = מזהה הרשומה בדו"ח (קיים גם בכשלים, שם אין transaction_uid)
  uid?:              string
  transaction_uid?:  string
  customer_name?:    string
  customer_phone?:   string
  amount?:           number
  // PayPlus מחזיר תאריכים כ-"DD/MM/YYYY"
  payment_date?:     string
  date_to_charge?:   string
  date_of_failure?:  string
  execution_date?:   string
  payment_number?:   number
  card_number?:      string
  card_expiry?:      string
  // בדו"ח כשלים: status הוא אובייקט { status_code, key } (לא מחרוזת)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  status?:           any
}

// פרמטרים משותפים לדו"חות: terminal_uid + currency_code חובה; till_date (לא to_date).
function reportParams(opts: { fromDate?: string; toDate?: string; skip?: number; take?: number } = {}): URLSearchParams {
  const qs = new URLSearchParams()
  const terminalUid = process.env.PAYPLUS_TERMINAL_UID
  if (terminalUid) qs.set('terminal_uid', terminalUid)
  qs.set('currency_code', 'ILS')
  if (opts.fromDate)      qs.set('from_date', opts.fromDate)
  if (opts.toDate)        qs.set('till_date', opts.toDate)
  if (opts.skip != null)  qs.set('skip', String(opts.skip))
  if (opts.take != null)  qs.set('take', String(opts.take))
  return qs
}

// חילוץ מערך הרשומות מתשובת PayPlus (מבנה לא עקבי בין endpoints)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractArray(data: any): ChargedRecord[] {
  for (const c of [data?.data, data?.items, data?.data?.items, data?.results?.data, data?.data?.data, data]) {
    if (Array.isArray(c)) return c as ChargedRecord[]
  }
  return []
}

export async function fetchChargedReport(fromDate?: string, toDate?: string, skip = 0, take = 500): Promise<PayPlusResult<ChargedRecord[]>> {
  const headers = getAuthHeaders()
  if (!headers) return { success: false, error: 'PayPlus API לא מוגדר' }
  try {
    const qs = reportParams({ fromDate, toDate, skip, take })
    const res = await fetch(`${getPayPlusBase()}/recurringpaymentsreports/charged?${qs}`, { method: 'GET', headers })
    if (!res.ok) { const t = await res.text().catch(() => ''); return { success: false, error: `HTTP ${res.status}: ${t.slice(0, 200)}` } }
    return { success: true, data: extractArray(await res.json()) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'שגיאת רשת' }
  }
}

// ─── שליפת חיובים שנכשלו ─────────────────────────────────────────────────────
export async function fetchFailuresReport(fromDate?: string, toDate?: string): Promise<PayPlusResult<ChargedRecord[]>> {
  const headers = getAuthHeaders()
  if (!headers) return { success: false, error: 'PayPlus API לא מוגדר' }
  try {
    const qs = reportParams({ fromDate, toDate, take: 500 })
    const res = await fetch(`${getPayPlusBase()}/recurringpaymentsreports/failures?${qs}`, { method: 'GET', headers })
    if (!res.ok) { const t = await res.text().catch(() => ''); return { success: false, error: `HTTP ${res.status}: ${t.slice(0, 200)}` } }
    return { success: true, data: extractArray(await res.json()) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'שגיאת רשת' }
  }
}

// ─── שליפת כרטיסים שפג תוקפם ─────────────────────────────────────────────────
export async function fetchExpiredCardsReport(): Promise<PayPlusResult<ChargedRecord[]>> {
  const headers = getAuthHeaders()
  if (!headers) return { success: false, error: 'PayPlus API לא מוגדר' }
  try {
    const qs = reportParams({ take: 500 })
    const res = await fetch(`${getPayPlusBase()}/recurringpaymentsreports/expiredcards?${qs}`, { method: 'GET', headers })
    if (!res.ok) { const t = await res.text().catch(() => ''); return { success: false, error: `HTTP ${res.status}: ${t.slice(0, 200)}` } }
    return { success: true, data: extractArray(await res.json()) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'שגיאת רשת' }
  }
}

export function isPayPlusApiConfigured(): boolean {
  return !!(process.env.PAYPLUS_API_KEY && process.env.PAYPLUS_SECRET_KEY)
}
