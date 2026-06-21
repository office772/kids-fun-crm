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

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { processMessage } from '@/lib/bot/handler'
import { isBusinessHours } from '@/lib/bot/flows'
import { isTestPhone as isAllowedPhone } from '@/lib/bot/test-phones'
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
// (isAllowedPhone מיובא בראש הקובץ)

// ─── הודעת היעדרות למספרים שעדיין לא בבוט (שלב בדיקות) ───────────────────────
// המוח היחיד הוא ה-webhook: מספר בבוט → בוט, כל השאר → ההודעה הזו.
// (יש לכבות את הודעת ה-away המובנית של uChat כדי שלא תופיע פעמיים.)
function awayMessage(): string {
  if (isBusinessHours()) {
    return `שלום, הגעתם לקידס אנד פאן 😎\n\n` +
      `קיבלנו את הודעתך — נציג/ה יחזרו אליך בהקדם.\n\n` +
      `תודה,\nהנהלת קידס אנד פאן 🌟`
  }
  return `שלום, הגעתם לקידס אנד פאן 😎\n` +
    `המשרד סגור כעת.\n` +
    `שעות הפעילות הן א׳-ה׳ בין השעות 10:00-15:00.\n\n` +
    `נחזור בהקדם בשעות הפעילות,\n` +
    `הנהלת קידס אנד פאן 🌟`
}

// ─── אדמין (קורלי) — resume מהוואטסאפ ────────────────────────────────────────
function normPhone(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0/, '972')
}
function isAdminPhone(raw: string): boolean {
  const admin = process.env.STAFF_ADMIN_PHONE
  return !!admin && normPhone(raw) === normPhone(admin)
}

// מטפל בהודעות מהאדמין (קורלי). מחזיר טקסט תשובה, או null אם לא אדמין.
async function handleAdminCommand(phone: string, message: string, userNs: string | null): Promise<string | null> {
  if (!isAdminPhone(phone)) return null

  // שמירת ה-user_ns של קורלי (לשליחת התראות אליה בעתיד)
  if (userNs) {
    try {
      const { createServiceClient } = await import('@/lib/supabase/server')
      const supabase = createServiceClient()
      const normalized = phone.replace(/\D/g, '').replace(/^972/, '0')
      await supabase.from('parents').update({ uchat_user_ns: userNs })
        .or(`phone.eq.${normalized},phone.eq.${'972' + normalized.replace(/^0/, '')}`)
    } catch { /* לא חוסם */ }
  }

  const m = message.trim()
  if (!/^\s*(החזר|להחזיר|resume)/i.test(m)) return null  // לא פקודת resume → תיפול ל-away רגיל

  const phoneMatch = m.match(/972\d{8,9}|0\d{8,9}/)
  if (!phoneMatch) {
    return 'כדי להחזיר את הבוט — כתבי *החזר* ואחריו מספר הפונה.\nלדוגמה: *החזר 0541234567* 💛'
  }
  const { getUserNsByPhone, resumeBot } = await import('@/lib/uchat')
  const targetNs = await getUserNsByPhone(phoneMatch[0])
  if (!targetNs) {
    return `לא מצאתי פונה פעיל עם המספר ${phoneMatch[0]} 🤔\nודאי שהמספר נכון.`
  }
  const ok = await resumeBot(targetNs)
  return ok
    ? `✅ הבוט חזר לפעולה עבור ${phoneMatch[0]} 💛`
    : `הייתה תקלה בהחזרת הבוט עבור ${phoneMatch[0]}. אפשר לנסות שוב או דרך הדשבורד.`
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

// ─── Session helpers ───────────────────────────────────────────────────────────
function makeNewSession(phone: string, parentId?: string, parentName?: string): BotSession {
  return {
    sessionId: `${phone}-${Date.now()}`,
    phone,
    parentId,
    parentName,
    messages: [],
    currentFlow: undefined,
    collectedData: {},
  }
}

async function loadSession(
  supabase: ReturnType<typeof createServiceClient>,
  phone: string
): Promise<BotSession | null> {
  // ⚠️ עמודות הטבלה: current_flow, collected_data, last_message_at, expires_at
  // (לא session_data/last_activity — אי-התאמה זו גרמה לכך שה-session לא נשמר!)
  const { data, error } = await supabase
    .from('bot_sessions')
    .select('parent_id, current_flow, collected_data, last_message_at, expires_at')
    .eq('phone', phone)
    .maybeSingle()

  if (error) { console.error('[manychat] loadSession error:', error.message); return null }
  if (!data) return null

  // פג תוקף אחרי 30 דקות של חוסר פעילות
  const expired = data.expires_at
    ? new Date(data.expires_at).getTime() < Date.now()
    : (data.last_message_at ? Date.now() - new Date(data.last_message_at).getTime() > 30 * 60 * 1000 : true)
  if (expired) return null

  return {
    sessionId:     `${phone}-session`,
    phone,
    parentId:      data.parent_id ?? undefined,
    currentFlow:   data.current_flow ?? undefined,
    collectedData: (data.collected_data as BotSession['collectedData']) ?? {},
    messages:      [],
  }
}

async function saveSession(
  supabase: ReturnType<typeof createServiceClient>,
  session: BotSession
) {
  const now = Date.now()
  const { error } = await supabase.from('bot_sessions').upsert(
    {
      phone:           session.phone,
      parent_id:       session.parentId ?? null,
      current_flow:    session.currentFlow ?? null,
      collected_data:  session.collectedData ?? {},
      last_message_at: new Date(now).toISOString(),
      expires_at:      new Date(now + 30 * 60 * 1000).toISOString(),
    },
    { onConflict: 'phone' }
  )
  if (error) console.error('[manychat] saveSession error:', error.message)
}

async function clearSession(
  supabase: ReturnType<typeof createServiceClient>,
  phone: string
) {
  await supabase.from('bot_sessions').delete().eq('phone', phone)
}

// טעינת היסטוריית שיחה אחרונה (ל-context של ה-LLM — שיבין הקשר ולא יתנהג כטופס)
async function loadRecentMessages(
  supabase: ReturnType<typeof createServiceClient>,
  phone: string
): Promise<BotSession['messages']> {
  const { data } = await supabase
    .from('conversations')
    .select('direction, message_text, created_at')
    .eq('phone', phone)
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
  const { data: existing } = await supabase
    .from('parents')
    .select('id, name')
    .eq('phone', phone)
    .single()

  if (existing) return existing

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
  }
) {
  await supabase.from('conversations').insert({
    phone: opts.phone,
    parent_id: opts.parentId ?? null,
    platform: 'whatsapp',
    direction: opts.direction,
    message_text: opts.text,
    intent: opts.intent ?? null,
    handled_by: 'בוט',
    session_id: opts.sessionId ?? null,
  })
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
  }
) {
  await supabase.from('tasks').insert({
    parent_id: opts.parentId ?? null,
    type: toTaskType(opts.type),
    description: opts.description,
    priority: opts.priority,
    status: 'פתוח',
  })

  // התראה לאדמין + צוות המסגרת (אם הוגדר framework). פעיל ברגע ש-uChat מחובר.
  const { notifyStaff } = await import('@/lib/notify')
  await notifyStaff({
    text: `משימה חדשה (${opts.type}):\n${opts.description}`,
    priority: opts.priority,
    framework: opts.framework,
  })
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

  // שלב בדיקות — המספרים בבוט מקבלים את הבוט; כל מספר אחר מקבל הודעת היעדרות בלבד
  if (!isAllowedPhone(phone)) {
    console.log(`[manychat] phone ${phone} not in whitelist — away message`)
    return NextResponse.json({ reply: awayMessage(), away: true }, { status: 200 })
  }

  const supabase = createServiceClient()

  // 1. טעינת הורה
  const parent = await getOrCreateParent(supabase, phone, firstName, lastName)

  // שמירת ה-user_ns של הפונה (לצורך resume/notify עתידי)
  if (userNs && parent.id) {
    await supabase.from('parents').update({ uchat_user_ns: userNs }).eq('id', parent.id)
  }

  // 2. טעינת session או יצירה חדשה
  let session = await loadSession(supabase, phone)
  if (!session) {
    session = makeNewSession(phone, parent.id, parent.name)
  } else {
    // עדכן parentId + parentName בכל מקרה
    session.parentId = parent.id
    session.parentName = session.parentName || parent.name
  }

  // טעינת היסטוריית שיחה ל-context של ה-LLM (לפני רישום ההודעה הנוכחית)
  session.messages = await loadRecentMessages(supabase, phone)

  // 3. רישום ההודעה הנכנסת
  await logConversation(supabase, {
    phone,
    parentId: parent.id,
    direction: 'נכנס',
    text: messageText,
    sessionId: session.sessionId,
  })

  // 4. עיבוד ההודעה (async — כולל LLM fallback)
  const result = await processMessage(session, messageText)

  // 5. עדכון session לפי התוצאה
  if (result.nextFlow) {
    session.currentFlow = result.nextFlow
  } else if (result.isComplete) {
    session.currentFlow = undefined
    session.collectedData = {}
  }

  // 6. שמירת / מחיקת session
  if (result.isComplete && !result.nextFlow) {
    await clearSession(supabase, phone)
  } else {
    await saveSession(supabase, session)
  }

  // 7. רישום תשובת הבוט
  await logConversation(supabase, {
    phone,
    parentId: parent.id,
    direction: 'יוצא',
    text: result.text,
    intent: result.intent,
    sessionId: session.sessionId,
  })

  // 8. יצירת task אם נדרש — והתראה לצוות המסגרת אם הוגדר notifyFramework
  if (result.createTask) {
    // אם הפנייה דורשת צוות מסגרת — מאתרים את בית הספר/אזור של הילד
    let frameworkCtx: { area_code: string; school?: string; type?: 'צהרון'|'קייטנה' } | undefined
    if (result.notifyFramework?.byChildName) {
      const { data: kid } = await supabase
        .from('children').select('area_code, school, framework')
        .ilike('name', result.notifyFramework.byChildName).limit(1).maybeSingle()
      if (kid?.area_code) {
        frameworkCtx = {
          area_code: kid.area_code,
          school: kid.school ?? undefined,
          type: (kid.framework === 'קייטנה' ? 'קייטנה' : 'צהרון'),
        }
      }
    } else if (result.notifyFramework?.area_code) {
      frameworkCtx = {
        area_code: result.notifyFramework.area_code,
        school: result.notifyFramework.school,
        type: result.notifyFramework.type,
      }
    }

    await createTask(supabase, {
      parentId: parent.id,
      type: result.createTask.type,
      description: result.createTask.description,
      priority: result.createTask.priority,
      framework: frameworkCtx,
    })
  }

  console.log(`[manychat] phone=${phone} intent=${result.intent} flow=${session.currentFlow ?? 'done'}`)

  // 9. תשובה ל-ManyChat — שולח בחזרה { reply }
  return NextResponse.json({ reply: result.text, intent: result.intent }, { status: 200 })
}

// ─── GET — health check ────────────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'POST /api/webhooks/manychat',
    description: 'Kids & Fun WhatsApp bot webhook (ManyChat / uchat)',
    version: '2.0.0',
  })
}
