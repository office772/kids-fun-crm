export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/manychat
 *
 * מקבל הודעות נכנסות מ-ManyChat / uchat.
 * פורמט בסיסי: { phone, message, first_name?, last_name? }
 *
 * Flow:
 *  1. אימות secret header
 *  2. טעינת הורה מ-Supabase לפי טלפון (או יצירת רשומה חדשה)
 *  3. טעינת session (מ-Supabase) או יצירת session חדש
 *  4. processMessage → handler.ts → flows.ts
 *  5. עדכון session ב-Supabase
 *  6. רישום שיחה ב-conversations
 *  7. יצירת task ב-Supabase אם הבוט ביקש
 *  8. החזרת { reply, intent } ל-ManyChat
 */

import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { processMessage } from '@/lib/bot/handler'
import { isTestPhone as isAllowedPhone, TEST_PHONES } from '@/lib/bot/test-phones'
import { isAllowedPhoneAsync } from '@/lib/bot/test-phones-db'
import { primeSettingsCache } from '@/lib/bot/settings-db'
import { primeSchoolsCache } from '@/lib/bot/schools-db'
import { primeBotMessagesCache, botText } from '@/lib/bot/bot-messages-db'
import { phoneVariants } from '@/lib/phone'
import { HANDOFF_FLOW } from '@/lib/bot/handler'
import { detectMedia, handleMediaMessage, type MediaInfo } from '@/lib/bot/media-handler'
import { getUserNsByPhone, sendText } from '@/lib/uchat'
import { waitUntil } from '@vercel/functions'
import type { BotSession, TaskPriority } from '@/lib/types'

// ─── Auth ──────────────────────────────────────────────────────────────────────
const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET ?? 'dev-secret'

function isAuthorized(req: NextRequest): boolean {
  if (WEBHOOK_SECRET === 'dev-secret') return true
  const header =
    req.headers.get('x-webhook-secret') ||
    req.headers.get('x-manychat-secret') ||
    req.headers.get('authorization')?.replace('Bearer ', '')
  return header === WEBHOOK_SECRET
}

// ─── Whitelist זמני (שלב בדיקות) — מנוהל ב-src/lib/bot/test-phones.ts ─────────
// רק מספרי הבדיקה מקבלים את הבוט. הורים אמיתיים → reply ריק (הבוט שותק).
// (isAllowedPhone מיובא בראש הקובץ)

// ─── אדמין (קורלי) — resume מהוואטסאפ ────────────────────────────────────────
function normPhone(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0/, '972')
}
// מספרי אדמין מורשים: STAFF_ADMIN_PHONE (קורלי) + ADMIN_PHONES (רשימה מופרדת בפסיקים,
// לאדמינים נוספים בעתיד). תשתית למסלול הניהול — כרגע מזהה את הגישה; הרחבת הפקודות אחרי הפגישה.
function adminPhones(): string[] {
  const list = [process.env.STAFF_ADMIN_PHONE, ...(process.env.ADMIN_PHONES?.split(',') ?? [])]
  return list.map(p => p?.trim()).filter((p): p is string => !!p).map(normPhone)
}
function isAdminPhone(raw: string): boolean {
  if (adminPhones().includes(normPhone(raw))) return true
  // שלב בדיקות: כל מספרי הבדיקה יכולים לבדוק גם את מסלול הניהול (בקשת עינת).
  // כשעוברים להורים אמיתיים (TEST_PHONES ריק) — נשארים רק האדמינים מה-env.
  return TEST_PHONES.length > 0 && isAllowedPhone(raw)
}

// המספר של קורלי עצמה (האדמין). הודעות שמגיעות *ממנו* לבוט לא מסלימות אליה —
// אין טעם לשלוח לקורלי תבנית "פנייה חדשה" על הודעה שהיא שלחה (בקשת עינת 17.9).
// מזהים לפי env (STAFF_ADMIN_PHONE / ADMIN_PHONES) + המספר הידוע כגיבוי.
// ⚠️ לא isAdminPhone — הוא מחזיר true לכל מספרי הבדיקה בשלב הבדיקות.
const STAFF_ADMIN_FALLBACK = '972546102262'
function isStaffAdminSender(raw: string): boolean {
  const n = normPhone(raw)
  return n === STAFF_ADMIN_FALLBACK || adminPhones().includes(n)
}

// מטפל בהודעות מהאדמין (קורלי) — מסלול הניהול המלא (src/lib/bot/admin-flow.ts).
// מחזיר טקסט תשובה אם ההודעה טופלה כניהול, או null → ממשיכה למסלול הורה רגיל
// (כך קורלי ממשיכה לבדוק את הבוט כהורה כשהיא לא במצב ניהול).
async function handleAdminCommand(phone: string, message: string, userNs: string | null): Promise<string | null> {
  if (!isAdminPhone(phone)) return null

  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()

  // שמירת ה-user_ns של קורלי (לשליחת התראות/תבניות אליה)
  if (userNs) {
    try {
      const normalized = phone.replace(/\D/g, '').replace(/^972/, '0')
      const intl = '972' + normalized.replace(/^0/, '')
      await supabase.from('parents').update({ uchat_user_ns: userNs })
        .or(`phone.eq.${normalized},phone.eq.${intl},phone.eq.+${intl}`)
    } catch { /* לא חוסם */ }
  }

  const { handleAdminFlow } = await import('@/lib/bot/admin-flow')
  return handleAdminFlow(supabase, phone, message)
}

// ─── TaskType mapper ───────────────────────────────────────────────────────────
// ממפה את הטיפוס החופשי שחוזר מ-flows.ts לערך חוקי בטבלת tasks
function toTaskType(raw: string): string {
  if (/ביטול חריג/.test(raw)) return 'ביטול חריג'
  if (/ביטול/.test(raw)) return 'ביטול חריג'
  if (/כשל תשלום|תזכורת כשל/.test(raw)) return 'כשל תשלום'
  if (/רישום מאוחר|קייטנה/.test(raw)) return 'רישום מאוחר'
  if (/רשימת המתנה|המתנה/.test(raw)) return 'רשימת המתנה'
  if (/תלונה/.test(raw)) return 'תלונה'
  return 'שאלה כללית'
}


// astra R3: בקרת-מקביליות מבוססת-גרסה + בעלות (עמודת bot_sessions.rev). loadSession
// עושה **upsert אטומי** — יוצר שורה אם אין (session חדש) *או* מעדכן rev אם יש — ומחזיר
// rev חדש. כך לכל הודעה יש בעלות/גרסה כבר בטעינה, גם ללא session קודם (astra B). כל
// כתיבה (save/clear) מותנית ב-rev. שתי הודעות מקבילות → זו שטענה אחרונה מנצחת; הישנה
// מיושנת (0 שורות) — ולא כותבת, לא מוחקת, ולא נשלחת (בכל הנתיבים).
async function loadSession(
  supabase: ReturnType<typeof createServiceClient>,
  phone: string
): Promise<{ session: BotSession; rev: string } | null> {
  const newRev = randomUUID()
  // upsert שמעדכן רק rev בהתנגשות (phone הוא המפתח), ומשאיר current_flow/collected_data.
  // שורה חדשה מקבלת ברירות-מחדל (current_flow=null, collected_data='{}', expires_at=+30ד').
  const { data, error } = await supabase.from('bot_sessions')
    .upsert({ phone, rev: newRev }, { onConflict: 'phone' })
    .select('parent_id, current_flow, collected_data, expires_at')
  if (error) { console.error('[manychat] loadSession error:', error.message); return null }
  const row = (data as Array<Record<string, unknown>> | null)?.[0]
  if (!row) return null

  // session שפג תוקפו → מצב טרי (אבל השורה קיימת עם ה-rev שלנו).
  const expiresAt = row.expires_at as string | null
  const expired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false

  return {
    session: {
      sessionId:     `${phone}-session`,
      phone,
      parentId:      (row.parent_id as string | null) ?? undefined,
      currentFlow:   expired ? undefined : ((row.current_flow as string | null) ?? undefined),
      collectedData: expired ? {} : ((row.collected_data as BotSession['collectedData']) ?? {}),
      messages:      [],
    },
    rev: newRev,
  }
}

function sessionRow(session: BotSession, rev: string) {
  const now = Date.now()
  return {
    phone:           session.phone,
    parent_id:       session.parentId ?? null,
    current_flow:    session.currentFlow ?? null,
    collected_data:  session.collectedData ?? {},
    last_message_at: new Date(now).toISOString(),
    expires_at:      new Date(now + 30 * 60 * 1000).toISOString(),
    rev,
  }
}

// שמירה מותנית-גרסה. ה-row תמיד קיים (loadSession יצר אותו), אז זה תמיד UPDATE ... WHERE
// rev=expectedRev. 0 שורות = הודעה מאוחרת יותר לקחה בעלות ⇒ מיושן.
async function persistSession(
  supabase: ReturnType<typeof createServiceClient>,
  session: BotSession,
  expectedRev: string
): Promise<{ saved: boolean; stale: boolean }> {
  const { data, error } = await supabase.from('bot_sessions')
    .update(sessionRow(session, randomUUID())).eq('phone', session.phone).eq('rev', expectedRev).select('phone')
  if (error) { console.error('[manychat] persistSession error:', error.message); return { saved: false, stale: false } }
  return (data?.length ?? 0) > 0 ? { saved: true, stale: false } : { saved: false, stale: true }
}

// מחיקה מותנית-גרסה בסיום שיחה. מחזיר error=true בכשל DB (astra D: כשל מחיקה אינו
// הצלחה) ו-stale=true אם ה-rev כבר לא שלנו (astra R3: לא מוחקים מסלול חדש).
async function clearSessionIfCurrent(
  supabase: ReturnType<typeof createServiceClient>,
  phone: string,
  expectedRev: string
): Promise<{ stale: boolean; error: boolean }> {
  const { data, error } = await supabase.from('bot_sessions')
    .delete().eq('phone', phone).eq('rev', expectedRev).select('phone')
  if (error) { console.error('[manychat] clearSessionIfCurrent error:', error.message); return { stale: false, error: true } }
  return { stale: (data?.length ?? 0) === 0, error: false }
}

// astra R5: תפיסת עיבוד *נפרדת* מיומן השיחה, עם **טוקן בעלות** (session_id) שמונע מעובד
// ישן לשחרר/לסיים/לדרוס בעלות שהוחלפה. whatsapp_message_log(id_message ייחודי + processed
// + created_at + session_id=טוקן). מחזיר {status, token}:
//  'new'       → נתפסה בעלות (token) — ממשיכים לעבד.
//  'duplicate' → הושלם (processed) או עיבוד מקביל עדכני, או שמישהו אחר תפס-מחדש → מדלגים.
//  'unclaimed' → כשל תפיסה שאינו 23505 → אין בעלות תקפה; לא מעבדים בלי הגנה.
// תפיסה ישנה (>2ד', קריסה) → חידוש **אטומי**: מחיקה מותנית בטוקן הישן (רק זוכה אחד),
// ואז הכנסה חדשה. שני retry מקבילים → רק אחד זוכה בבעלות, השני 'duplicate'.
async function claimMessage(
  supabase: ReturnType<typeof createServiceClient>,
  phone: string,
  messageId: string,
  text: string
): Promise<{ status: 'new' | 'duplicate' | 'unclaimed'; token: string | null }> {
  const token = randomUUID()
  const row = { id_message: messageId, phone, direction: 'נכנס', message_text: text || '(ריק)', processed: false, session_id: token }
  const { error } = await supabase.from('whatsapp_message_log').insert(row)
  if (!error) return { status: 'new', token }
  if (error.code !== '23505') {
    console.error(`[manychat] claim insert failed (${error.code}) for ${messageId}: ${error.message}`)
    return { status: 'unclaimed', token: null }
  }
  const { data } = await supabase.from('whatsapp_message_log')
    .select('processed, created_at, session_id').eq('id_message', messageId).limit(1)
  const ex = (data as { processed: boolean; created_at: string | null; session_id: string | null }[] | null)?.[0]
  if (ex?.processed) return { status: 'duplicate', token: null }
  const claimedAt = ex?.created_at ? new Date(ex.created_at).getTime() : 0
  if (Date.now() - claimedAt < 2 * 60_000) return { status: 'duplicate', token: null }   // עיבוד מקביל בעיצומו
  // חידוש אטומי: מחיקה מותנית *גם בטוקן הישן וגם ב-processed=false* (astra סבב 4). כך
  // אם העובד המקורי סיים (processed=true) בין ה-SELECT ל-DELETE — המחיקה לא תואמת ולא
  // מעבדים מחדש אירוע שהושלם. שגיאת DB מובחנת מכפילות (לא נבלעת כ-duplicate).
  const { data: del, error: delErr } = await supabase.from('whatsapp_message_log')
    .delete().eq('id_message', messageId).eq('session_id', ex?.session_id ?? '__none__').eq('processed', false).select('id_message')
  if (delErr) { console.error(`[manychat] reclaim delete failed for ${messageId}: ${delErr.message}`); return { status: 'unclaimed', token: null } }
  if (!del?.length) return { status: 'duplicate', token: null }   // הושלם או נתפס-מחדש בינתיים
  const { error: reErr } = await supabase.from('whatsapp_message_log').insert(row)
  return reErr ? { status: 'unclaimed', token: null } : { status: 'new', token }
}

// astra R5: משחרר את תפיסת העיבוד (whatsapp_message_log, *לא* יומן) — מותנה בטוקן הבעלות
// שלנו, כדי לא למחוק בעלות שהוחלפה. בכשל שמירה → שחרור → retry מיידי יתפוס מחדש.
async function releaseClaim(
  supabase: ReturnType<typeof createServiceClient>,
  messageId: string | null,
  token: string | null
): Promise<void> {
  if (!messageId || !token) return
  await supabase.from('whatsapp_message_log').delete().eq('id_message', messageId).eq('session_id', token)
}

// astra R5: מסמן "הושלם" *מותנה בטוקן הבעלות* שלנו — עובד ישן שהוחלף לא יסמן את בעלות
// המחליף כמושלמת.
async function markProcessed(
  supabase: ReturnType<typeof createServiceClient>,
  messageId: string | null,
  token: string | null
): Promise<void> {
  if (!messageId || !token) return
  await supabase.from('whatsapp_message_log').update({ processed: true }).eq('id_message', messageId).eq('session_id', token)
}

// טעינת היסטוריית שיחה אחרונה (ל-context של ה-LLM — שיבין הקשר ולא יתנהג כטופס)
// ⏱️ רק 6 השעות האחרונות: הודעות מאתמול הן שיחה אחרת, וגררו את ה-LLM להקשר שגוי.
async function loadRecentMessages(
  supabase: ReturnType<typeof createServiceClient>,
  phone: string
): Promise<BotSession['messages']> {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('conversations')
    .select('direction, message_text, created_at')
    .eq('phone', phone)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(8)
  if (!data?.length) return []
  const rows = data as Array<{ direction: string; message_text: string | null; created_at: string }>
  return rows
    .reverse()
    .map((m) => ({
      role: (m.direction === 'נכנס' ? 'user' : 'bot') as 'user' | 'bot',
      text: m.message_text ?? '',
      timestamp: new Date(m.created_at),
    }))
}

// ─── Parent lookup / create ────────────────────────────────────────────────────
async function getOrCreateParent(
  supabase: ReturnType<typeof createServiceClient>,
  phone: string,
  firstName?: string,
  lastName?: string
): Promise<{ id: string; name?: string }> {
  // חיפוש לפי כל וריאנטי הטלפון (+972/972/0…) — כדי לא לכפול הורה שכבר קיים מטופס/ידני
  const { data: matches } = await supabase
    .from('parents')
    .select('id, name')
    .in('phone', phoneVariants(phone))
    .limit(1)

  if (matches?.[0]) return matches[0]

  const name = [firstName, lastName].filter(Boolean).join(' ') || undefined
  const { data: created } = await supabase
    .from('parents')
    .insert({ phone, name })
    .select('id, name')
    .single()

  return created ?? { id: 'unknown' }
}

// ─── Log conversation ──────────────────────────────────────────────────────────
async function logConversation(
  supabase: ReturnType<typeof createServiceClient>,
  opts: {
    phone: string
    parentId?: string
    direction: 'נכנס' | 'יוצא'
    text: string
    intent?: string
    sessionId?: string
    idMessage?: string | null   // מזהה הודעת uChat — לסינון כפילויות
  }
): Promise<{ error: { code?: string; message?: string } | null }> {
  const { error } = await supabase.from('conversations').insert({
    phone: opts.phone,
    parent_id: opts.parentId ?? null,
    platform: 'whatsapp',
    direction: opts.direction,
    message_text: opts.text,
    intent: opts.intent ?? null,
    handled_by: 'בוט',
    session_id: opts.sessionId ?? null,
    id_message: opts.idMessage ?? null,
  })
  return { error: (error as { code?: string; message?: string } | null) ?? null }
}

// ─── Create task ───────────────────────────────────────────────────────────────
async function createTask(
  supabase: ReturnType<typeof createServiceClient>,
  opts: {
    parentId?: string
    type: string
    description: string
    priority: TaskPriority
    framework?: { area_code: string; school?: string; type?: 'צהרון'|'קייטנה' }
    parentName?: string
    parentPhone?: string
  }
): Promise<{ saved: boolean }> {
  // astra סבב 6 gap2: עד כה תוצאת ה-insert *נבלעה* — בכשל DB האירוע סומן "הושלם"
  //   בלי פנייה שמורה. עכשיו בודקים: כשל חולף → ניסיון חוזר יחיד; כשל מתמשך → CRITICAL
  //   בלוג + saved=false (הקורא לא יסמן "הושלם" בשקט). ⚠️ הבדיקה *לא* מריצה מחדש את
  //   הפעולה העסקית (ביטול/שליחה) — היא כבר בוצעה; זו רק שמירת התיעוד. ה-notify/email
  //   למטה הם ערוץ גיבוי בלתי-תלוי לפנייה, כך שגם בכשל שמירה הצוות מקבל התראה.
  const taskRow = {
    parent_id: opts.parentId ?? null,
    type: toTaskType(opts.type),
    description: opts.description,
    priority: opts.priority,
    status: 'פתוח',
  }
  let taskErr = (await supabase.from('tasks').insert(taskRow)).error
  if (taskErr) taskErr = (await supabase.from('tasks').insert(taskRow)).error   // ניסיון חוזר לכשל חולף
  if (taskErr) {
    console.error(`[createTask] CRITICAL: task insert failed for ${opts.parentPhone ?? opts.parentId ?? '—'} — ${toTaskType(opts.type)}: ${opts.description} | ${(taskErr as { message?: string; code?: string }).message ?? (taskErr as { code?: string }).code}`)
  }
  const taskSaved = !taskErr

  // התראה לאדמין + צוות המסגרת (אם הוגדר framework). פעיל ברגע ש-uChat מחובר.
  const { notifyStaff, sendCorliEscalationTemplate } = await import('@/lib/notify')
  await notifyStaff({
    text: `משימה חדשה (${opts.type}):\n${opts.description}`,
    priority: opts.priority,
    framework: opts.framework,
  })

  // הודעה מהמספר של קורלי עצמה → הפנייה נרשמת בדשבורד, אבל בלי תבנית ובלי מייל
  // (אחרת קורלי מקבלת "פנייה חדשה מהבוט" על החשבוניות שהיא שלחה בעצמה).
  const urgent = opts.priority === 'דחוף' || opts.priority === 'גבוה'
  const selfEscalation = !!opts.parentPhone && isStaffAdminSender(opts.parentPhone)
  if (urgent && selfEscalation) {
    console.log('[manychat] escalation notifications skipped — message came from the staff admin phone')
  }

  // הסלמה דחופה/גבוהה → גם תבנית וואטסאפ לקורלי (עם כפתור "צפייה בשיחה").
  // לא-חוסם: כשל בשליחה לא מפיל את יצירת הפנייה.
  if (urgent && !selfEscalation) {
    try {
      await sendCorliEscalationTemplate({
        parentName:  opts.parentName  || 'לא ידוע',
        parentPhone: opts.parentPhone || '—',
        topic:       opts.description,
        parentId:    opts.parentId,
      })
    } catch (err) {
      console.error('[manychat] Corli template escalation failed (non-blocking):', err)
    }
  }

  // התראת מייל לאדמין — ערוץ אמין (בלי מגבלת 24ש' של וואטסאפ). רק לפניות שאינן שגרתיות
  // (נציגה / כשל תשלום / דחוף). לא-חוסם: כשל מייל לא מפיל את יצירת הפנייה.
  if (urgent && !selfEscalation) {
    try {
      const { sendAdminAlert } = await import('@/lib/email')
      await sendAdminAlert({
        taskType: opts.type,
        description: opts.description,
        priority: opts.priority,
        parentName: opts.parentName,
        parentPhone: opts.parentPhone,
      })
    } catch (err) {
      console.error('[manychat] admin alert email failed:', err)
    }
  }

  return { saved: taskSaved }
}

// ─── A7: קובץ/תמונה — אישור מיידי, ניתוח ברקע, הודעה שנייה דרך uChat API ────
// uChat מנתק את ה-External Request אחרי ~12 שניות. ניתוח PDF/תמונה (הורדה + Claude)
// לקח יותר, והתשובה לא נמסרה להורה (uChat Error Logs, 17.9). לכן: עונים מיד
// "קיבלתי", והניתוח ממשיך ברקע (waitUntil) ונשלח כהודעה נפרדת ל-user_ns של הפונה.
// טקסט האישור נקרא מ-bot_messages (מפתח 'media_ack') עם fallback לקשיח.
// הקאש מוזרק בתחילת ה-POST לפני נתיב המדיה, כך שעריכה מהדשבורד תיכנס לתוקף.
const mediaAck = () => botText('media_ack')

async function finishMediaInBackground(
  supabase: ReturnType<typeof createServiceClient>,
  opts: {
    session: BotSession
    media: MediaInfo
    userNs: string
    phone: string
    parentId?: string
    parentName?: string | null
    rev: string
    messageId: string | null
    claimToken: string | null
  }
) {
  const { session, media, userNs, phone, parentId, parentName, rev, messageId, claimToken } = opts
  try {
    const result = await handleMediaMessage(session, media)
    const sent = await sendText(userNs, result.text)
    if (!sent) console.error(`[media-bg] send-text failed for ${phone} — parent got only the ack`)
    await logConversation(supabase, {
      phone, parentId, direction: 'יוצא',
      text: (sent ? '' : '⚠️ (לא נמסר להורה) ') + result.text,
      intent: 'לא_ידוע', sessionId: session.sessionId,
    })
    if (result.createTask || !sent) {
      await createTask(supabase, {
        parentId,
        type:        result.createTask?.type ?? 'שאלה כללית',
        description: (result.createTask?.description ?? `הורה שלח/ה קובץ — לפתוח ולטפל.`) +
                     (sent ? '' : ' | ⚠️ תשובת הבוט על הקובץ לא נמסרה בוואטסאפ (uChat send-text נכשל).'),
        priority:    result.createTask?.priority ?? 'גבוה',
        parentName:  parentName ?? undefined,
        parentPhone: phone,
      })
    }
    // מדיה מסיימת את המסלול — מחיקה *מותנית-rev* (לא לדרוס הודעה חדשה שהגיעה בזמן הניתוח).
    const cleared = await clearSessionIfCurrent(supabase, phone, rev)
    if (cleared.error) {
      // astra סבב 5: התשובה (sendText) והפנייה (createTask) *כבר בוצעו* למעלה. כשל ניקוי
      //   הסשן אינו מצדיק replay — release+retry היה שולח את הניתוח ויוצר פנייה *שוב*
      //   (astra round5, פער המדיה). לכן מסמנים processed (commit) ומתעדים; הסשן נותר
      //   rev-guarded ויפוג. הכשל לא נבלע (נרשם), אבל אין שכפול של פעולה שכבר הצליחה.
      console.error(`[media-bg] clearSession failed for ${phone} — session left to expire (rev-guarded); marking processed to avoid duplicate send/task on retry`)
    }
    await markProcessed(supabase, messageId, claimToken)   // הושלם (התשובה+הפנייה בוצעו) — לא לעבד שוב
    console.log(`[media-bg] phone=${phone} kind=${media.kind} sent=${sent} cleared=${!cleared.error}`)
  } catch (err) {
    console.error('[media-bg] failed:', err)
    // כשל ניתוח → לא מסמנים הושלם (ניתן לנסות שוב); לא משחררים אוטומטית (ה-ack כבר נשלח).
  }
}

// ─── תשובה איטית → "רק רגע, בודקת" + המשך ברקע ──────────────────────────────
// uChat מנתק את ה-External Request אחרי ~12ש'. מודל חכם/איטי יותר (Sonnet) עונה
// לפעמים 11-13ש' על שאלות חופשיות — בדיוק "הרגעים האנושיים". כדי לא לאבד מסירה:
// אם התשובה לא חזרה תוך LLM_DEFER_TIMEOUT_MS (ברירת מחדל 8000) — ack מיידי, והתשובה
// האמיתית נשלחת כהודעה שנייה דרך uChat send-text (בלי מגבלת ה-12ש'). דורש user_ns.
const DEFER_MS = () => parseInt(process.env.LLM_DEFER_TIMEOUT_MS || '8000', 10)
const checkingAck = () => 'רק רגע, בודקת עבורך… 😊'

type ProcResult = Awaited<ReturnType<typeof processMessage>>

// עדכון session + task לפי תוצאת processMessage (בלי רישום ההודעה היוצאת — הקורא רושם).
async function applyResult(
  supabase: ReturnType<typeof createServiceClient>,
  session: BotSession,
  parent: { id?: string; name?: string | null },
  phone: string,
  result: ProcResult,
  opts?: { rev?: string },   // rev הבעלות שנטען → כל כתיבה מותנית בו (astra R3)
): Promise<{ saved: boolean; stale: boolean }> {
  if (result.nextFlow) {
    session.currentFlow = result.nextFlow
  } else if (result.isComplete) {
    session.currentFlow = undefined
    session.collectedData = {}
  }

  const rev = opts?.rev ?? ''
  let saved = true, stale = false
  if (result.isComplete && !result.nextFlow) {
    const r = await clearSessionIfCurrent(supabase, phone, rev)
    stale = r.stale
    if (r.error) {
      // astra סבב 5 (התאוששות מכשל חלקי): בשלב isComplete הפעולה העסקית הבלתי-הפיכה
      //   כבר בוצעה *בתוך* processMessage (ביטול רישום/הו"ק, רשימת המתנה, לינק תשלום).
      //   כשל *ניקוי* הסשן אחריה אינו מצדיק replay — replay יריץ את אותה פעולה שוב
      //   ויכפיל תשובות/פניות (astra round5). לכן מחייבים COMMIT (המשימה נוצרת, התשובה
      //   נשלחת, ההודעה processed). שונה מ-D (סבב 4): הכשל *לא נבלע*.
      // astra סבב 6 gap1: "לתת לסשן לפוג" לא הספיק — הודעה חדשה תוך 30ד' נטענה לצומת
      //   שהסתיים והחזירה מידע סותר (למשל "שמחים שנשארים" אחרי שהרישום כבר בוטל). לכן
      //   סגירה *לוגית* עמידה: UPDATE מותנה-rev שמרוקן את ה-flow (session.currentFlow כבר
      //   undefined כאן). הפעולה העסקית *לא* רצה שוב — רק הסגירה מושלמת בדרך אחרת.
      const up = await persistSession(supabase, session, rev)
      stale = up.stale
      if (!up.saved && !up.stale) {
        // קצה נדיר: גם המחיקה וגם ה-UPDATE נכשלו (כשל-DB כפול). הסשן rev-guarded ויפוג;
        //   נרשם CRITICAL כדי שלא ייבלע. אין replay של הפעולה העסקית.
        console.error(`[applyResult] CRITICAL: could not close session for ${phone} (delete+update failed) — a new message may re-enter the finished flow until expiry`)
      }
    }
  } else {
    const r = await persistSession(supabase, session, rev)
    saved = r.saved; stale = r.stale
  }

  // מיושן (השיחה התקדמה) → לא יוצרים תופעת לוואי (הבעלים החדש יעשה זאת). כשל שמירה
  // בשלב-ביניים (nextFlow, בלי פעולה בלתי-הפיכה) → release+retry בטוח דרך saved=false.
  if (stale || !saved) return { saved, stale }

  if (result.createTask) {
    let frameworkCtx: { area_code: string; school?: string; type?: 'צהרון'|'קייטנה' } | undefined
    if (result.notifyFramework?.byChildName) {
      // ⚠️ astra #10: לנתב את בקשת האיסוף *רק* למסגרת של ילד ששייך להורה המזוהה,
      //    ובהתאמה חד-משמעית. חיפוש שם גלובלי (limit(1) בלי parent) שלח את המסגרת
      //    של ילד ממשפחה אחרת. הורה לא מזוהה / שם כפול → אין ניתוב אוטומטי; הפנייה
      //    נשמרת כמשימה והצוות מאמת ידנית.
      if (parent.id) {
        const { data: kids } = await supabase
          .from('children').select('area_code, school, framework')
          .eq('parent_id', parent.id)
          .ilike('name', `%${result.notifyFramework.byChildName}%`)
        if (kids && kids.length === 1 && kids[0].area_code) {
          const kid = kids[0]
          frameworkCtx = { area_code: kid.area_code, school: kid.school ?? undefined, type: (kid.framework === 'קייטנה' ? 'קייטנה' : 'צהרון') }
        }
      }
    } else if (result.notifyFramework?.area_code) {
      frameworkCtx = { area_code: result.notifyFramework.area_code, school: result.notifyFramework.school, type: result.notifyFramework.type }
    }
    await createTask(supabase, {
      parentId: parent.id,
      type: result.createTask.type,
      description: result.createTask.description,
      priority: result.createTask.priority,
      framework: frameworkCtx,
      parentName: parent.name ?? undefined,
      parentPhone: phone,
    })
  }
  return { saved, stale }
}

// ─── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const phone = ((body.phone ?? body.subscriber_phone ?? '') as string).trim()
  const messageText = ((body.message ?? body.text ?? '') as string).trim()
  const firstName = (body.first_name as string | undefined) ?? undefined
  const lastName = (body.last_name as string | undefined) ?? undefined
  // user_ns של uChat — נדרש ל-resume/notify. uChat שולח אותו בגוף ה-External Request.
  const userNs = ((body.user_ns ?? body.subscriber_ns ?? body.ns ?? '') as string).trim() || null
  // מזהה הודעה (אם uChat שולח) — לסינון כפילויות webhook
  const messageId = ((body.message_id ?? body.mid ?? body.id_message ?? '') as string).toString().trim() || null

  if (!phone || !messageText) {
    return NextResponse.json({ error: 'Missing phone or message' }, { status: 400 })
  }

  // ─── פקודת אדמין (קורלי) — החזרת אוטומציה לבוט מהוואטסאפ שלה ───────────────
  // קורלי שולחת "החזר <מספר הפונה>" → resume לאותו פונה. רץ לפני ה-whitelist
  // כי מספר האדמין אינו ברשימת מספרי הבוט.
  const adminReply = await handleAdminCommand(phone, messageText, userNs)
  if (adminReply !== null) {
    return NextResponse.json({ reply: adminReply, admin: true }, { status: 200 })
  }

  // שלב בדיקות — רק מספרי הבדיקה מקבלים את הבוט. כל מספר אחר (הורים אמיתיים) —
  // הבוט לא מגיב כלל (reply ריק) כדי לא לשלוח להם כלום. הצוות מטפל בהם ידנית.
  // כולל את מספרי הבסיס הקבועים + מספרים שנוספו דרך הדשבורד (settings ב-Supabase).
  // כשל DB → נשארים רק ה-base הקבועים (בטוח — לא נפתח לכולם בטעות).
  if (!(await isAllowedPhoneAsync(phone))) {
    console.log(`[manychat] phone ${phone} not a test number — silent (no reply)`)
    return NextResponse.json({ reply: '', skip: true, ignored: true }, { status: 200 })
  }

  const supabase = createServiceClient()

  // ─── תפיסת עיבוד / כפילויות (astra R5) ──────────────────────────────────────
  // עם מזהה: תפיסה אטומית עם טוקן-בעלות ב-whatsapp_message_log, *נפרד* מיומן conversations.
  //   'duplicate' = הושלם/עיבוד מקביל → דילוג; 'unclaimed' = כשל תפיסה → לא מעבדים בלי
  //   הגנה. token נושא את הבעלות ל-markProcessed/releaseClaim. בלי מזהה: best-effort טקסט.
  let claimToken: string | null = null
  if (messageId) {
    const claim = await claimMessage(supabase, phone, messageId, messageText)
    if (claim.status === 'duplicate') {
      console.log(`[manychat] duplicate message_id ${messageId} (processed/in-flight) — skipped`)
      return NextResponse.json({ reply: '', skip: true, duplicate: true }, { status: 200 })
    }
    if (claim.status === 'unclaimed') {
      console.error(`[manychat] could not claim ${messageId} — asking to resend`)
      return NextResponse.json({ reply: 'רגע, נסו שוב בעוד רגע 🙏', retry: true }, { status: 200 })
    }
    claimToken = claim.token
  } else {
    try {
      const cutoff = new Date(Date.now() - 15_000).toISOString()
      const { data: dupByText } = await supabase
        .from('conversations').select('id')
        .eq('phone', phone).eq('direction', 'נכנס')
        .eq('message_text', messageText)
        .gte('created_at', cutoff).limit(1)
      if (dupByText?.length) {
        console.log(`[manychat] duplicate text within 15s from ${phone} — skipped`)
        return NextResponse.json({ reply: '', skip: true, duplicate: true }, { status: 200 })
      }
    } catch (err) {
      console.error('[manychat] text-dedup check failed (continuing):', err)
    }
  }

  // 1. טעינת הורה
  const parent = await getOrCreateParent(supabase, phone, firstName, lastName)

  // שמירת ה-user_ns של הפונה (לצורך resume/notify עתידי)
  if (userNs && parent.id) {
    await supabase.from('parents').update({ uchat_user_ns: userNs }).eq('id', parent.id)
  }

  // 2. טעינת session — loadSession עושה upsert אטומי (יוצר שורה אם אין) ומחזיר rev-בעלות.
  //    null = כשל DB בטעינה → אין בעלות; לא מעבדים בלי הגנה, מבקשים לשלוח שוב (astra R3/D).
  const loaded = await loadSession(supabase, phone)
  if (!loaded) {
    if (messageId) await releaseClaim(supabase, messageId, claimToken)
    return NextResponse.json({ reply: 'רגע, נסו שוב בעוד רגע 🙏', retry: true }, { status: 200 })
  }
  const session: BotSession = loaded.session
  const sessionRev: string = loaded.rev
  session.parentId = parent.id
  session.parentName = session.parentName || parent.name

  // טעינת היסטוריית שיחה ל-context של ה-LLM (לפני רישום ההודעה הנוכחית)
  session.messages = await loadRecentMessages(supabase, phone)

  // 3. רישום ההודעה הנכנסת — יומן היסטוריה בלבד (התפיסה/דדופ כבר נעשו למעלה,
  //    astra R5: לא מוחקים היסטוריה כדי לאפשר retry). ב-retry ה-id_message כבר קיים
  //    ביומן → מדלגים על כפילות היומן בשקט.
  const incoming = await logConversation(supabase, {
    phone,
    parentId: parent.id,
    direction: 'נכנס',
    text: messageText,
    sessionId: session.sessionId,
    idMessage: messageId,
  })
  if (incoming.error && incoming.error.code !== '23505') {
    console.error(`[manychat] incoming history log failed for ${phone}: ${incoming.error.message ?? incoming.error.code}`)
  }

  // 3.5 קובץ/תמונה שדורשים ניתוח → ack מיידי + המשך ברקע (A7). קבצים שלא
  //     מנתחים (וורד/אקסל/אודיו) נשארים בנתיב הרגיל — האישור שלהם מיידי ממילא.
  //     אחרי העברה לקורלי (שתיקה) — לא מגיבים גם לקבצים.
  // טעינת settings + מסגרות + טקסטים פעם אחת לבקשה (שעות/מחיר/מחיר-מסגרת/הודעות) —
  // flows וה-media-ack קוראים סינכרונית מה-cache. כשל DB → cache ריק → fallback קשיח.
  // מוזרק כאן (לפני נתיב המדיה) כדי שגם הודעת ה-ack תיקרא מ-bot_messages.
  await Promise.all([primeSettingsCache(), primeSchoolsCache(), primeBotMessagesCache()])

  const media = detectMedia(messageText)
  if (media && media.kind !== 'other' && session.currentFlow !== HANDOFF_FLOW) {
    const ns = userNs || await getUserNsByPhone(phone)
    if (ns) {
      await logConversation(supabase, {
        phone, parentId: parent.id, direction: 'יוצא', text: mediaAck(),
        intent: 'לא_ידוע', sessionId: session.sessionId,
      })
      // astra סבב 4: הודעת ה-ack נשלחה, אבל האירוע מסומן processed *רק אחרי* שהניתוח
      //    ברקע הסתיים (כולל המחיקה) — לא מיד. הפרדה בין קבלה להשלמת עיבוד.
      waitUntil(finishMediaInBackground(supabase, {
        session, media, userNs: ns, phone, parentId: parent.id, parentName: parent.name,
        rev: sessionRev, messageId, claimToken,
      }))
      console.log(`[manychat] phone=${phone} media=${media.kind} → ack now, analysis in background`)
      return NextResponse.json({ reply: mediaAck(), intent: 'לא_ידוע', deferred: true }, { status: 200 })
    }
    console.log(`[manychat] phone=${phone} media=${media.kind} but no user_ns — synchronous path`)
  }

  // 4. עיבוד ההודעה — עם ack "רק רגע, בודקת" אם איטי מדי (ראו DEFER_MS למעלה).
  const resultP = processMessage(session, messageText)
  const DEFER = Symbol('defer')
  const deferP = new Promise<typeof DEFER>(r => setTimeout(() => r(DEFER), DEFER_MS()))
  const raced = await Promise.race([resultP, deferP])

  // ── תשובה מהירה (רוב המקרים) — נתיב רגיל ──────────────────────────────────
  if (raced !== DEFER) {
    const result = raced
    const { saved, stale } = await applyResult(supabase, session, parent, phone, result, { rev: sessionRev })
    if (stale) {
      // astra A: תוצאה מיושנת (הודעה מאוחרת יותר לקחה בעלות) — *לא* מחזירים אותה להורה,
      // כדי שלא תסתור את המצב שהשרת יקבל בהודעה הבאה. מסמנים כמטופלת (הוחלפה).
      await markProcessed(supabase, messageId, claimToken)
      console.log(`[manychat] fast result for ${phone} stale — not replying (superseded)`)
      return NextResponse.json({ reply: '', skip: true, stale: true }, { status: 200 })
    }
    if (!saved) {
      // astra #14/R5: כשל שמירה אמיתי → retry בטוח. משחררים את התפיסה כדי שניסיון חוזר
      // יעובד; לא נוצרו תופעות לוואי (applyResult עצר לפניהן).
      console.error(`[manychat] session save failed for ${phone} — returning safe retry`)
      await releaseClaim(supabase, messageId, claimToken)
      return NextResponse.json({ reply: 'רגע, הייתה תקלה קטנה אצלנו 🙏 אפשר לשלוח שוב?', intent: result.intent, saveError: true }, { status: 200 })
    }
    if (result.text) {
      await logConversation(supabase, { phone, parentId: parent.id, direction: 'יוצא', text: result.text, intent: result.intent, sessionId: session.sessionId })
    }
    await markProcessed(supabase, messageId, claimToken)   // טופל — לא לעבד שוב ב-retry
    console.log(`[manychat] phone=${phone} intent=${result.intent} flow=${session.currentFlow ?? 'done'}`)
    return NextResponse.json({ reply: result.text, intent: result.intent }, { status: 200 })
  }

  // ── תשובה איטית (>DEFER_MS) — ack מיידי + המשך ברקע (צריך user_ns) ─────────
  const ns = userNs || await getUserNsByPhone(phone)
  if (ns) {
    await logConversation(supabase, { phone, parentId: parent.id, direction: 'יוצא', text: checkingAck(), intent: 'לא_ידוע', sessionId: session.sessionId })
    waitUntil((async () => {
      try {
        const result = await resultP
        // astra R3: שמירה מותנית-גרסה (rev). אם הודעה מאוחרת יותר ניצחה (rev השתנה) →
        // stale: לא שומרים, לא מוחקים, לא מסיימים ולא שולחים — מסלול/יצירה חדשים לא נדרסים.
        const { stale, saved } = await applyResult(supabase, session, parent, phone, result, { rev: sessionRev })
        if (stale) {
          console.log(`[manychat] deferred result for ${phone} is stale — not sending (conversation advanced)`)
          await markProcessed(supabase, messageId, claimToken)   // טופל (הוחלף) — לא לעבד שוב
          return
        }
        if (!saved) {
          // astra R4/R5: כשל שמירה בנתיב הדחוי — לא שולחים מצב לא-מעודכן, ומשחררים
          // את התפיסה כדי שניסיון חוזר יעובד.
          console.error(`[manychat] deferred save failed for ${phone} — not sending stale-state answer`)
          await releaseClaim(supabase, messageId, claimToken)
          return
        }
        if (result.text) {
          const sent = await sendText(ns, result.text)
          await logConversation(supabase, { phone, parentId: parent.id, direction: 'יוצא', text: (sent ? '' : '⚠️ (לא נמסר להורה) ') + result.text, intent: result.intent, sessionId: session.sessionId })
          if (!sent) {
            await createTask(supabase, { parentId: parent.id, type: 'שאלה כללית', description: `תשובת הבוט לא נמסרה בוואטסאפ (send-text נכשל). ההודעה: "${result.text.slice(0, 120)}"`, priority: 'גבוה', parentName: parent.name ?? undefined, parentPhone: phone })
          }
        }
        await markProcessed(supabase, messageId, claimToken)
        console.log(`[manychat] phone=${phone} deferred answer sent (intent=${result.intent})`)
      } catch (err) {
        console.error('[manychat] deferred processing failed:', err)
      }
    })())
    console.log(`[manychat] phone=${phone} slow (>${DEFER_MS()}ms) → ack now, answer in background`)
    return NextResponse.json({ reply: checkingAck(), intent: 'לא_ידוע', deferred: true }, { status: 200 })
  }

  // ── אין user_ns — נתיב סינכרוני (מחכים לתשובה גם אם איטית) ─────────────────
  const result = await resultP
  const { saved: syncSaved, stale: syncStale } = await applyResult(supabase, session, parent, phone, result, { rev: sessionRev })
  if (syncStale) {
    // astra A: מיושן → לא מחזירים תשובה סותרת.
    await markProcessed(supabase, messageId, claimToken)
    console.log(`[manychat] sync result for ${phone} stale — not replying (superseded)`)
    return NextResponse.json({ reply: '', skip: true, stale: true }, { status: 200 })
  }
  if (!syncSaved) {
    console.error(`[manychat] session save failed for ${phone} (sync) — returning safe retry`)
    await releaseClaim(supabase, messageId, claimToken)
    return NextResponse.json({ reply: 'רגע, הייתה תקלה קטנה אצלנו 🙏 אפשר לשלוח שוב?', intent: result.intent, saveError: true }, { status: 200 })
  }
  if (result.text) {
    await logConversation(supabase, { phone, parentId: parent.id, direction: 'יוצא', text: result.text, intent: result.intent, sessionId: session.sessionId })
  }
  await markProcessed(supabase, messageId, claimToken)
  console.log(`[manychat] phone=${phone} slow, no user_ns — synchronous (intent=${result.intent})${syncStale ? ' (stale-but-answered)' : ''}`)
  return NextResponse.json({ reply: result.text, intent: result.intent }, { status: 200 })
}

// ─── GET — health check ────────────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'POST /api/webhooks/manychat',
    description: 'Kids & Fun WhatsApp bot webhook (ManyChat / uchat)',
    version: '2.4.1',
  })
}
