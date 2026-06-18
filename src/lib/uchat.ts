// ─── uChat API — שליטה באוטומציה (pause/resume) ושליחת טקסט ─────────────────
// אימות: Authorization: Bearer {UCHAT_API_TOKEN}. בסיס: UCHAT_BASE_URL.
// resume/pause: POST /api/subscriber/resume-bot | pause-bot, body { user_ns }.
// (אומת מול ה-Swagger: www.uchat.com.au/api — scope "Manage Flow".)
// ─────────────────────────────────────────────────────────────────────────────

const BASE = () => process.env.UCHAT_BASE_URL ?? 'https://www.uchat.com.au'

async function uchatPost(path: string, body: Record<string, unknown>): Promise<boolean> {
  const token = process.env.UCHAT_API_TOKEN
  if (!token) {
    console.log(`[uchat] (token not configured) skip ${path}`)
    return false
  }
  try {
    const res = await fetch(`${BASE()}/api${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify(body),
    })
    if (!res.ok) {
      console.error(`[uchat] ${path} HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`)
      return false
    }
    return true
  } catch (err) {
    console.error(`[uchat] ${path} error:`, err)
    return false
  }
}

/** מחזיר את אוטומציית הבוט לפונה (אחרי שנציגה התערבה) */
export function resumeBot(userNs: string): Promise<boolean> {
  if (!userNs) return Promise.resolve(false)
  return uchatPost('/subscriber/resume-bot', { user_ns: userNs })
}

/** עוצר את אוטומציית הבוט לפונה (העברה לנציגה) */
export function pauseBot(userNs: string): Promise<boolean> {
  if (!userNs) return Promise.resolve(false)
  return uchatPost('/subscriber/pause-bot', { user_ns: userNs })
}

/** שליחת טקסט לפונה לפי user_ns */
export function sendText(userNs: string, text: string): Promise<boolean> {
  if (!userNs || !text) return Promise.resolve(false)
  return uchatPost('/subscriber/send-text', { user_ns: userNs, text })
}

// ─── עזר: שליפת user_ns של הורה לפי טלפון (מ-Supabase, נשמר ע"י ה-webhook) ──
export async function getUserNsByPhone(phone: string): Promise<string | null> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const normalized = phone.replace(/\D/g, '').replace(/^972/, '0')
    const intl       = '972' + normalized.replace(/^0/, '')
    const { data } = await supabase
      .from('parents')
      .select('uchat_user_ns')
      .or(`phone.eq.${normalized},phone.eq.${intl},phone.eq.${phone}`)
      .not('uchat_user_ns', 'is', null)
      .maybeSingle()
    return data?.uchat_user_ns ?? null
  } catch (err) {
    console.error('[uchat] getUserNsByPhone error:', err)
    return null
  }
}
