// ─── חשבונית ירוקה (Morning) Integration ────────────────────────────────────
// API Docs: https://greeninvoice.docs.apiary.io/
//
// Auth: JWT Bearer Token — מחודש כל שעה
//   POST /account/token  { id: API_KEY_ID, secret: SECRET }
//   → Response: { token: "...", id: "..." }
//   → Use: Authorization: Bearer {token}
//
// יצירת קישור תשלום: POST /documents  (type: 305 = Invoice)
// קישור פלט: https://pages.greeninvoice.co.il/payments/links/{uid}
//
// דרישות: תוכנית Best ומעלה בחשבונית ירוקה
//
// משתני סביבה:
//   GREENINVOICE_API_KEY_ID  — מ: My Account → Developer Tools → API Keys
//   GREENINVOICE_SECRET      — מוצג פעם אחת בלבד בעת יצירת המפתח!
// ──────────────────────────────────────────────────────────────────────────────

const GI_BASE_URL = 'https://api.greeninvoice.co.il/api/v1'

// ─── Token cache (module-level) ──────────────────────────────────────────────
let _cachedToken:   string | null = null
let _tokenExpiry:   number = 0   // Unix ms

async function getGreenInvoiceToken(): Promise<string> {
  const now = Date.now()

  // שמור cache — רענן 5 דקות לפני תפוגה
  if (_cachedToken && now < _tokenExpiry - 5 * 60 * 1000) {
    return _cachedToken
  }

  const keyId  = process.env.GREENINVOICE_API_KEY_ID
  const secret = process.env.GREENINVOICE_SECRET

  if (!keyId || !secret) {
    throw new Error('GREENINVOICE_API_KEY_ID / GREENINVOICE_SECRET חסרים ב-.env.local')
  }

  const res = await fetch(`${GI_BASE_URL}/account/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: keyId, secret }),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`GreenInvoice auth failed (${res.status}): ${txt.slice(0, 100)}`)
  }

  const data = await res.json()
  _cachedToken = data.token as string
  _tokenExpiry = now + 60 * 60 * 1000  // תקף שעה

  return _cachedToken!
}

// ─── Parameters ──────────────────────────────────────────────────────────────
export interface GreenInvoicePaymentParams {
  customerName:   string
  customerEmail?: string
  amount:         number
  description:    string
  dueDate?:       string   // YYYY-MM-DD, ברירת מחדל: היום + 30 יום
}

export interface GreenInvoicePaymentResult {
  success:     boolean
  paymentUrl?: string   // https://pages.greeninvoice.co.il/payments/links/{uid}
  documentId?: string
  error?:      string
}

// ─── יצירת קישור תשלום ───────────────────────────────────────────────────────
export async function createGreenInvoicePaymentLink(
  params: GreenInvoicePaymentParams
): Promise<GreenInvoicePaymentResult> {
  try {
    const token = await getGreenInvoiceToken()

    // Due date: 30 יום מהיום אם לא צוין
    const dueDate = params.dueDate ?? (() => {
      const d = new Date()
      d.setDate(d.getDate() + 30)
      return d.toISOString().split('T')[0]
    })()

    const body = {
      type:     305,   // Invoice — supports payment links
      lang:     'he',
      currency: 'ILS',
      dueDate,
      client: {
        name:  params.customerName,
        email: params.customerEmail ?? '',
        add:   true,   // הוסף לקוח חדש אם לא קיים
      },
      income: [
        {
          description: params.description,
          price:       params.amount,
          currency:    'ILS',
          quantity:    1,
        },
      ],
      remarks: `תשלום עבור Kids & Fun — ${params.description}`,
    }

    const res = await fetch(`${GI_BASE_URL}/documents`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return {
        success: false,
        error:   `GreenInvoice HTTP ${res.status}: ${errText.slice(0, 120)}`,
      }
    }

    const data = await res.json()

    // Green Invoice returns the document object; URL is data.url or data.paymentLink
    const paymentUrl: string | undefined =
      data?.url ??
      data?.paymentLink ??
      data?.shareUrl

    return {
      success:    true,
      paymentUrl,
      documentId: data?.id ?? data?.documentId,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאת רשת'
    console.error('[GreenInvoice] createPaymentLink error:', msg)
    return { success: false, error: msg }
  }
}

// ─── בדיקת חיבור (health check) ─────────────────────────────────────────────
export async function testGreenInvoiceConnection(): Promise<{
  connected: boolean
  businessName?: string
  error?: string
}> {
  try {
    const token = await getGreenInvoiceToken()
    const res   = await fetch(`${GI_BASE_URL}/account/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { connected: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    return {
      connected:    true,
      businessName: data?.name ?? data?.businessName,
    }
  } catch (err) {
    return {
      connected: false,
      error:     err instanceof Error ? err.message : 'שגיאת חיבור',
    }
  }
}
