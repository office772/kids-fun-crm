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

// ─── עזר: שליפת user_ns של הורה לפי טלפון ────────────────────────────────────
// 1) קודם מ-Supabase (נשמר ע"י ה-webhook אם uChat שולח user_ns).
// 2) אם אין — שאילתה ל-uChat API: get-info-by-user-id (ב-WhatsApp ה-user_id הוא
//    המספר הבינלאומי). כך ה-resume עובד גם בלי לשנות את זרימת uChat.
export async function getUserNsByPhone(phone: string): Promise<string | null> {
  const normalized = phone.replace(/\D/g, '').replace(/^972/, '0')
  const intl       = '972' + normalized.replace(/^0/, '')

  // 1) Supabase
  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('parents')
      .select('uchat_user_ns')
      .or(`phone.eq.${normalized},phone.eq.${intl},phone.eq.${phone}`)
      .not('uchat_user_ns', 'is', null)
      .maybeSingle()
    if (data?.uchat_user_ns) return data.uchat_user_ns
  } catch (err) {
    console.error('[uchat] getUserNsByPhone db error:', err)
  }

  // 2) uChat API — get-info-by-user-id (user_id = מספר בינלאומי ב-WhatsApp)
  const token = process.env.UCHAT_API_TOKEN
  if (!token) return null
  try {
    const res = await fetch(
      `${BASE()}/api/subscriber/get-info-by-user-id?user_id=${encodeURIComponent(intl)}`,
      { headers: { 'Authorization': `Bearer ${token}` } },
    )
    if (!res.ok) return null
    const json = await res.json()
    const userNs = json?.user_ns ?? json?.data?.user_ns ?? null
    // שמירה ל-DB לפעם הבאה (best-effort)
    if (userNs) {
      try {
        const { createServiceClient } = await import('@/lib/supabase/server')
        const supabase = createServiceClient()
        await supabase.from('parents').update({ uchat_user_ns: userNs })
          .or(`phone.eq.${normalized},phone.eq.${intl}`)
      } catch { /* לא חוסם */ }
    }
    return userNs
  } catch (err) {
    console.error('[uchat] getUserNsByPhone api error:', err)
    return null
  }
}
