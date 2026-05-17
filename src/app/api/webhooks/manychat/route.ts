import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/webhooks/manychat
 *
 * Receives incoming events from ManyChat / uchat.
 * Each message arrives as JSON with at minimum:
 *   { phone, message, subscriber_id?, first_name?, last_name? }
 *
 * Flow:
 *  1. Validate the shared secret header
 *  2. Identify the parent by phone (or create a new lead record)
 *  3. Run intent classification
 *  4. Run the matching flow handler
 *  5. Log the conversation to Supabase (demo: in-memory store)
 *  6. Return { reply } — ManyChat sends this text back to the user
 */

// ─── Shared secret validation ─────────────────────────────────────────────────
const WEBHOOK_SECRET = process.env.MANYCHAT_WEBHOOK_SECRET ?? 'dev-secret'

function isAuthorized(req: NextRequest): boolean {
  const header =
    req.headers.get('x-webhook-secret') ||
    req.headers.get('x-manychat-secret') ||
    req.headers.get('authorization')?.replace('Bearer ', '')
  if (WEBHOOK_SECRET === 'dev-secret') return true
  return header === WEBHOOK_SECRET
}

// ─── In-memory session store (replaced by Supabase later) ────────────────────
interface Session {
  phone: string
  currentFlow: string | null
  step: number
  collectedData: Record<string, string>
  lastActivity: number
}

const sessions = new Map<string, Session>()

function getSession(phone: string): Session {
  const existing = sessions.get(phone)
  if (existing) {
    existing.lastActivity = Date.now()
    return existing
  }
  const fresh: Session = {
    phone,
    currentFlow: null,
    step: 0,
    collectedData: {},
    lastActivity: Date.now(),
  }
  sessions.set(phone, fresh)
  return fresh
}

function clearSession(phone: string) {
  sessions.delete(phone)
}

// ─── Intent classifier ────────────────────────────────────────────────────────
type BotIntent =
  | 'רישום_צהרון'
  | 'רישום_קייטנה'
  | 'ביטול'
  | 'שאלת_לוז'
  | 'איסוף_מוקדם'
  | 'בדיקת_תשלום'
  | 'כשל_תשלום'
  | 'רשימת_המתנה'
  | 'שאלה_כללית'
  | 'לא_ידוע'

function classifyIntent(text: string): BotIntent {
  const t = text.trim()

  if (/^1$/.test(t)) return 'רישום_צהרון'
  if (/^2$/.test(t)) return 'רישום_קייטנה'
  if (/^3$/.test(t)) return 'ביטול'
  if (/^4$/.test(t)) return 'שאלת_לוז'
  if (/^5$/.test(t)) return 'בדיקת_תשלום'
  if (/^6$/.test(t)) return 'איסוף_מוקדם'

  if (/רישום|להירשם|הרשמה/i.test(t) && /צהרון/i.test(t)) return 'רישום_צהרון'
  if (/קייטנה|summer|camp/i.test(t)) return 'רישום_קייטנה'
  if (/ביטול|לבטל/i.test(t)) return 'ביטול'
  if (/שעות|לוח זמנים|לוז|חגים|סגור|פתוח|מתי/i.test(t)) return 'שאלת_לוז'
  if (/איסוף מוקדם|לאסוף מוקדם/i.test(t)) return 'איסוף_מוקדם'
  if (/כשל|נכשל|דחיית|חיוב נדחה|בנק/i.test(t)) return 'כשל_תשלום'
  if (/תשלום|לשלם|חשבונית|חוב/i.test(t)) return 'בדיקת_תשלום'
  if (/המתנה|תור|מקום/i.test(t)) return 'רשימת_המתנה'
  if (/שלום|היי|הי|בוקר|ערב|עזרה|help/i.test(t)) return 'שאלה_כללית'

  return 'לא_ידוע'
}

// ─── Flow handlers ────────────────────────────────────────────────────────────

function handleGreeting(): string {
  return (
    'שלום! 😊 כאן Kids & Fun!\n\n' +
    'במה אפשר לעזור?\n\n' +
    '*1* — רישום לצהרון\n' +
    '*2* — רישום לקייטנה\n' +
    '*3* — ביטול\n' +
    '*4* — שעות ולוח זמנים\n' +
    '*5* — בדיקת תשלום\n' +
    '*6* — איסוף מוקדם\n\n' +
    'או פשוט כתוב/י מה צריך 💬'
  )
}

function handleRegistrationAfternoon(session: Session, text: string): string {
  switch (session.step) {
    case 0:
      session.step = 1
      session.currentFlow = 'רישום_צהרון'
      return 'מעולה! 🎉 בשמחה נעזור ברישום לצהרון.\n\nמה שם הילד/ה?'
    case 1:
      session.collectedData.child_name = text
      session.step = 2
      return `נהדר! ${text} נשמע/ת מקסים/ה 😊\n\nבאיזו כיתה?`
    case 2:
      session.collectedData.class_name = text
      session.step = 3
      return 'מה מספר הטלפון שלך?'
    case 3: {
      session.collectedData.parent_phone = text
      const summary =
        `תודה! סיכום:\n👧 ילד/ה: ${session.collectedData.child_name}\n` +
        `📚 כיתה: ${session.collectedData.class_name}\n📱 טלפון: ${text}\n\n` +
        'לסיום הרישום, יש למלא את הטופס:\n👉 https://forms.example.com/register\n\n' +
        'לאחר מילוי הטופס ניצור קשר לאישור 🌟'
      clearSession(session.phone)
      return summary
    }
    default:
      clearSession(session.phone)
      return handleGreeting()
  }
}

function handleCancellation(session: Session, text: string): string {
  switch (session.step) {
    case 0:
      session.step = 1
      session.currentFlow = 'ביטול'
      return (
        'מצטערים לשמוע 😔\n\n' +
        'לפי התקנון:\n' +
        '• ביטול עד ה-15 לחודש — זיכוי מלא\n' +
        '• ביטול אחרי ה-15 — זיכוי חצי חודש הבא\n\n' +
        'מה שם הילד/ה שברצונך לבטל?'
      )
    case 1:
      session.collectedData.child_name = text
      session.step = 2
      return `מה סיבת הביטול של ${text}? (לא חובה 🙏)`
    case 2: {
      const childName = session.collectedData.child_name
      clearSession(session.phone)
      return (
        'קיבלנו את הבקשה ✅\n\n' +
        `ביטול עבור: ${childName}\n` +
        'נציג יצור קשר תוך יום עסקים לאישור הסופי.\n\n' +
        'אם יש שינוי — תמיד שמחים לראות אתכם! 💛'
      )
    }
    default:
      clearSession(session.phone)
      return handleGreeting()
  }
}

function handleScheduleQuestion(): string {
  return (
    '📅 לוח זמנים — קיץ 2025\n\n' +
    '• ראשון–חמישי: 07:00–18:00\n' +
    '• שישי: סגור\n\n' +
    '🏖️ חופשות קרובות:\n' +
    '• ל"ג בעומר: 16.5\n' +
    '• שבועות: 1–3.6\n\n' +
    'לשאלות: 052-000-0000 📞'
  )
}

function handlePaymentCheck(session: Session, text: string): string {
  switch (session.step) {
    case 0:
      session.step = 1
      session.currentFlow = 'בדיקת_תשלום'
      return 'בשמחה! 💳\n\nמה שם ההורה או מספר הטלפון הרשום?'
    case 1:
      clearSession(session.phone)
      return (
        `✅ בדקנו את החשבון עבור: ${text}\n\n` +
        'תשלום אחרון: שולם ב-01.05.2025\n' +
        'תשלום הבא: 01.06.2025\n\n' +
        'לעדכון פרטי תשלום: 052-000-0000 📞'
      )
    default:
      clearSession(session.phone)
      return handleGreeting()
  }
}

function handlePaymentFailure(firstName?: string): string {
  const name = firstName || 'שלום'
  return (
    `היי ${name}! 😊\n\n` +
    'שמנו לב שהחיוב האחרון לא עבר.\n' +
    'זה קורה — אין דאגות!\n\n' +
    'לעדכון פרטי תשלום:\n' +
    '👉 https://pay.example.com/update\n\n' +
    'או: 052-000-0000 📞\n\n' +
    'נשמח לעזור לסדר את זה מהר 💛'
  )
}

function handleEarlyPickup(session: Session, text: string): string {
  switch (session.step) {
    case 0:
      session.step = 1
      session.currentFlow = 'איסוף_מוקדם'
      return '🚗 איסוף מוקדם — בשמחה!\n\nמה שם הילד/ה ושעת האיסוף המבוקשת?'
    case 1:
      clearSession(session.phone)
      return (
        `רשמנו ✅\n${text}\n\n` +
        'הצוות יתאם את האיסוף.\n' +
        'אם יש שינוי — אנא עדכני שעה מראש 🙏'
      )
    default:
      clearSession(session.phone)
      return handleGreeting()
  }
}

// ─── Main router ──────────────────────────────────────────────────────────────

function routeMessage(
  text: string,
  session: Session,
  firstName?: string
): { reply: string; intent: BotIntent } {
  if (session.currentFlow) {
    switch (session.currentFlow) {
      case 'רישום_צהרון':
        return { reply: handleRegistrationAfternoon(session, text), intent: 'רישום_צהרון' }
      case 'ביטול':
        return { reply: handleCancellation(session, text), intent: 'ביטול' }
      case 'בדיקת_תשלום':
        return { reply: handlePaymentCheck(session, text), intent: 'בדיקת_תשלום' }
      case 'איסוף_מוקדם':
        return { reply: handleEarlyPickup(session, text), intent: 'איסוף_מוקדם' }
    }
  }

  const intent = classifyIntent(text)

  switch (intent) {
    case 'רישום_צהרון':
      return { reply: handleRegistrationAfternoon(session, text), intent }
    case 'רישום_קייטנה':
      return {
        reply:
          'רישום לקייטנה ☀️\n\nשלחי פרטים:\n• שם ילד/ה\n• כיתה\n• מספר טלפון\n\nהצוות יחזור אליך תוך יום עסקים 🌟',
        intent,
      }
    case 'ביטול':
      return { reply: handleCancellation(session, text), intent }
    case 'שאלת_לוז':
      return { reply: handleScheduleQuestion(), intent }
    case 'בדיקת_תשלום':
      return { reply: handlePaymentCheck(session, text), intent }
    case 'כשל_תשלום':
      return { reply: handlePaymentFailure(firstName), intent }
    case 'איסוף_מוקדם':
      return { reply: handleEarlyPickup(session, text), intent }
    case 'רשימת_המתנה':
      return {
        reply:
          'רשימת המתנה 📋\n\nהכניסינו אותך לרשימה!\nברגע שיתפנה מקום — תקבלי הודעה.\n\nשאלות: 052-000-0000 📞',
        intent,
      }
    default:
      return { reply: handleGreeting(), intent: 'שאלה_כללית' }
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

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

  const phone = (body.phone as string) || (body.subscriber_phone as string) || ''
  const messageText = (body.message as string) || (body.text as string) || ''
  const firstName = (body.first_name as string) || undefined

  if (!phone || !messageText) {
    return NextResponse.json({ error: 'Missing phone or message' }, { status: 400 })
  }

  const session = getSession(phone)
  const { reply, intent } = routeMessage(messageText, session, firstName)

  // TODO: log to Supabase
  // await supabase.from('conversations').insert({
  //   phone, platform: 'whatsapp', direction: 'נכנס',
  //   message_text: messageText, intent, handled_by: 'בוט',
  // })

  console.log(`[manychat-webhook] phone=${phone} intent=${intent}`)

  return NextResponse.json({ reply, intent }, { status: 200 })
}

// ─── GET — health check ───────────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'POST /api/webhooks/manychat',
    description: 'Kids & Fun WhatsApp bot webhook (ManyChat / uchat)',
    version: '1.0.0',
  })
}
