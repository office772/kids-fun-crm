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

import { sendText as uchatSendText, getUserNsByPhone } from './uchat'

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

  // שליחה בפועל דרך ה-helper המשותף (uchat.sendText) — שדה `content` + בדיקת
  // שגיאת ספק *בגוף* (uChat מחזיר 200 עם status:error). לצוות עם טלפון בלבד:
  // פותרים user_ns דרך uChat/DB ושולחים בפועל; אם לא נפתר — לא נמסר (מדווח).
  // astra #11: אין לדווח הצלחה כשהספק החזיר שגיאה, ואין "would send" מדומה.
  let sentCount = 0
  const undelivered: string[] = []
  for (const r of recipients) {
    let ns = r.userNs
    if (!ns && r.phone) ns = (await getUserNsByPhone(r.phone)) ?? undefined
    if (ns && (await uchatSendText(ns, baseText))) sentCount++
    else undelivered.push(`${r.label}${r.phone ? ` (${r.phone})` : ''}`)
  }
  if (undelivered.length) console.warn(`[notifyStaff] ⚠️ לא נמסר ל: ${undelivered.join(' | ')}`)
  console.log(`[notifyStaff] נמסר ל-${sentCount}/${recipients.length} נמענים`)
  return sentCount > 0
}

// ─── הסלמה לקורלי בוואטסאפ — תבנית escalation_to_corli (אושרה ב-Meta 07/2026) ──
// שולח לקורלי הודעת תבנית עם פרטי ההורה + כפתור "צפייה בשיחה" (→ /c/<parent_id>).
// תבנית מאושרת עוקפת את חלון 24 השעות — מגיעה תמיד.

const CORLI_PHONE_VARIANTS = ['972546102262', '+972546102262', '0546102262']
const ESCALATION_TEMPLATE_NAME = 'escalation_to_corli'

// ⚠️ תקופת בדיקות: עותק של כל הסלמה נשלח גם לעינת — לוודאות שהמנגנון עובד
//    בלי תלות בדיווח מקורלי. 🔴 לרוקן את הרשימה לפני המסירה ללקוחה!
const ESCALATION_CC: Array<{ userId: string; firstName: string }> = [
  { userId: '972544535688', firstName: 'עינת' },
]

let cachedCorliUserNs: string | null = null
let cachedTemplateNs:  string | null = null

async function uchatApi(path: string, method: 'GET' | 'POST', body?: unknown): Promise<Record<string, unknown> | null> {
  const token = process.env.UCHAT_API_TOKEN
  const base  = process.env.UCHAT_BASE_URL ?? 'https://www.uchat.com.au'
  if (!token) return null
  try {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!res.ok) {
      console.error(`[corli-template] uChat ${method} ${path} HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 150)}`)
      return null
    }
    return (await res.json()) as Record<string, unknown>
  } catch (err) {
    console.error(`[corli-template] uChat ${path} error:`, err)
    return null
  }
}

// איתור ה-user_ns של קורלי: קודם מה-DB (parents.uchat_user_ns), אחרת מ-uChat לפי טלפון
async function findCorliUserNs(): Promise<string | null> {
  if (cachedCorliUserNs) return cachedCorliUserNs
  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('parents').select('uchat_user_ns')
      .in('phone', CORLI_PHONE_VARIANTS).not('uchat_user_ns', 'is', null).limit(1)
    if (data?.[0]?.uchat_user_ns) {
      cachedCorliUserNs = data[0].uchat_user_ns as string
      return cachedCorliUserNs
    }
  } catch { /* המשך ל-uChat */ }

  for (const phone of CORLI_PHONE_VARIANTS) {
    const res = await uchatApi(`/subscribers?phone=${encodeURIComponent(phone)}`, 'GET')
    const list = (res?.data ?? []) as Array<{ user_ns?: string }>
    if (list[0]?.user_ns) {
      cachedCorliUserNs = list[0].user_ns
      return cachedCorliUserNs
    }
  }
  return null
}

// איתור ה-namespace של התבנית (נדרש בשליחה) מרשימת התבניות ב-uChat.
// אם לא נמצאה — מריצים sync (מושך תבניות מאושרות מ-Meta) ומנסים שוב.
async function findTemplateNamespace(): Promise<string | null> {
  if (cachedTemplateNs) return cachedTemplateNs

  const lookup = async (): Promise<string | null> => {
    const res = await uchatApi('/whatsapp-template/list', 'POST', {})
    const list = (res?.data ?? []) as Array<{ name?: string; namespace?: string }>
    return list.find(t => t.name === ESCALATION_TEMPLATE_NAME)?.namespace ?? null
  }

  let ns = await lookup()
  if (!ns) {
    console.log('[corli-template] template not in uChat list — running sync from Meta')
    await uchatApi('/whatsapp-template/sync', 'POST', {})
    ns = await lookup()
  }
  if (ns) { cachedTemplateNs = ns; return ns }
  console.error(`[corli-template] template "${ESCALATION_TEMPLATE_NAME}" not found even after sync`)
  return null
}

export interface CorliEscalation {
  parentName:  string
  parentPhone: string
  topic:       string      // מה ההורה צריך — נכנס ל-{{3}}
  parentId?:   string      // לכפתור "צפייה בשיחה" (URL suffix)
}

export async function sendCorliEscalationTemplate(esc: CorliEscalation): Promise<boolean> {
  if (!process.env.UCHAT_API_TOKEN) {
    console.log('[corli-template] UCHAT_API_TOKEN not set — skipping WhatsApp escalation')
    return false
  }
  const [userNs, templateNs] = await Promise.all([findCorliUserNs(), findTemplateNamespace()])
  if (!templateNs) return false

  const content = {
    namespace: templateNs,
    name:      ESCALATION_TEMPLATE_NAME,
    lang:      'he',
    params: {
      'BODY_{{1}}': esc.parentName  || 'לא ידוע',
      'BODY_{{2}}': esc.parentPhone || '—',
      'BODY_{{3}}': esc.topic.slice(0, 200) || 'פנייה מהבוט',
      // כפתור "צפייה בשיחה" — Meta מוסיפה את הפרמטר לסוף ה-URL הבסיסי
      ...(esc.parentId ? { 'URL_1': esc.parentId } : {}),
    },
  }

  // ניסיון 1: לפי user_ns (קורלי קיימת כ-subscriber — אומת חי 07/2026)
  let res = userNs
    ? await uchatApi('/subscriber/send-whatsapp-template', 'POST', { user_ns: userNs, content })
    : null

  // ניסיון 2 (לקח פנטהרי): send-whatsapp-template-by-user-id עם create_if_not_found + contact —
  // עובד גם אם איש הקשר לא קיים/נמחק ב-uChat, ויוצר אותו *תקין* דרך ערוץ הוואטסאפ.
  // ⚠️ לעולם לא subscriber/create לפני שליחה — לאותו endpoint אין whatsapp_phone
  //    (בניגוד למניצ'ט) והוא יוצר איש קשר "רפאים" שלא מקבל הודעות.
  if (!res) {
    res = await uchatApi('/subscriber/send-whatsapp-template-by-user-id', 'POST', {
      user_id: CORLI_PHONE_VARIANTS[0],   // 972546102262 — פורמט בינלאומי בלי +
      create_if_not_found: 'yes',
      contact: { first_name: 'קורלי' },   // שם לאיש הקשר אם נוצר עכשיו
      content,
    })
    if (res) cachedCorliUserNs = null   // איש קשר אולי נוצר מחדש — לרענן בפעם הבאה
  }

  const ok = !!res
  console.log(`[corli-template] escalation ${ok ? 'sent' : 'FAILED'} → קורלי (parent: ${esc.parentName})`)

  // עותקים לתקופת הבדיקות (עינת) — לא-חוסם: כשל בעותק לא משפיע על השליחה לקורלי
  for (const cc of ESCALATION_CC) {
    try {
      const ccRes = await uchatApi('/subscriber/send-whatsapp-template-by-user-id', 'POST', {
        user_id: cc.userId,
        create_if_not_found: 'yes',
        contact: { first_name: cc.firstName },
        content,
      })
      console.log(`[corli-template] CC ${ccRes ? 'sent' : 'FAILED'} → ${cc.firstName} (${cc.userId})`)
    } catch (err) {
      console.error(`[corli-template] CC to ${cc.userId} failed:`, err)
    }
  }

  return ok
}
