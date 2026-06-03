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
  const { data } = await supabase
    .from('bot_sessions')
    .select('session_data, last_activity')
    .eq('phone', phone)
    .single()

  if (!data) return null

  // פג תוקף אחרי 30 דקות של חוסר פעילות
  const lastActivity = new Date(data.last_activity).getTime()
  if (Date.now() - lastActivity > 30 * 60 * 1000) return null

  return data.session_data as BotSession
}

async function saveSession(
  supabase: ReturnType<typeof createServiceClient>,
  session: BotSession
) {
  await supabase.from('bot_sessions').upsert(
    {
      phone: session.phone,
      session_data: session,
      last_activity: new Date().toISOString(),
    },
    { onConflict: 'phone' }
  )
}

async function clearSession(
  supabase: ReturnType<typeof createServiceClient>,
  phone: string
) {
  await supabase.from('bot_sessions').delete().eq('phone', phone)
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
  }
) {
  await supabase.from('tasks').insert({
    parent_id: opts.parentId ?? null,
    type: toTaskType(opts.type),
    description: opts.description,
    priority: opts.priority,
    status: 'פתוח',
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

  if (!phone || !messageText) {
    return NextResponse.json({ error: 'Missing phone or message' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 1. טעינת הורה
  const parent = await getOrCreateParent(supabase, phone, firstName, lastName)

  // 2. טעינת session או יצירה חדשה
  let session = await loadSession(supabase, phone)
  if (!session) {
    session = makeNewSession(phone, parent.id, parent.name)
  } else {
    // עדכן parentId + parentName בכל מקרה
    session.parentId = parent.id
    session.parentName = session.parentName || parent.name
  }

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

  // 8. יצירת task אם נדרש
  if (result.createTask) {
    await createTask(supabase, {
      parentId: parent.id,
      type: result.createTask.type,
      description: result.createTask.description,
      priority: result.createTask.priority,
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
