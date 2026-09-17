import { BotIntent, BotSession } from '@/lib/types'
import { classifyIntent, matchesWholeWord } from './intent-classifier'
import {
  BotResponse,
  buildWelcomeMessage,
  buildEscalationMessage,
  buildDidNotUnderstand,
  handleRegistrationFlow,
  handleCancellationFlow,
  handleCampRegistrationFlow,
  handleCampMenuFlow,
  handleLateCampFlow,
  handleScheduleFlow,
  handleEarlyPickupFlow,
  handlePaymentFailureParentFlow,
  handlePaymentStatusFlow,
  handlePaymentStatusMenuFlow,
  handlePaymentSetupFlow,
  handleWaitingListSpotFlow,
  handleCostInfoFlow,
} from './flows'
import { callLLMFallback } from './llm-fallback'

// ─────────────────────────────────────────────────────────────────────────────
// processMessage — async
// 1. מנסה כל ה-FP (Fast Paths) בסדר עדיפות
// 2. אם שום FP לא תפס → fallback ל-Claude LLM
// ─────────────────────────────────────────────────────────────────────────────
export async function processMessage(
  session: BotSession,
  userMessage: string
): Promise<BotResponse & { intent: BotIntent }> {
  // ── קובץ/תמונה? ניתוח אמיתי במקום ניחוש כוונה מתוך URL ────────────────────
  // (לפני התיקון: קישור לקובץ נכנס ל-classifier והחזיר תפריטים אקראיים)
  const { detectMedia, handleMediaMessage } = await import('./media-handler')
  const media = detectMedia(userMessage)
  if (media) {
    const mediaResult = await handleMediaMessage(session, media)
    return { ...mediaResult, intent: 'לא_ידוע' }
  }

  const intent = classifyIntent(userMessage)

  // ── FP: מסלול פעיל — ממשיכים בו ──────────────────────────────────────────
  if (session.currentFlow) {
    const flowBefore = session.currentFlow
    const fpResult = await handleActiveFlow(session, userMessage, intent)
    // המסלול ביקש להעביר ל-LLM (המשתמש חרג — שאלה/הקשר ולא הקלט המבוקש)
    // ⚠️ keepFlow: בלעדיו כל תשובת LLM סיימה את המסלול (isComplete) והווב-הוק
    //    מחק את ה-session — ההורה נפל מהמסלול אחרי שאלה אחת (לוגים 09/2026).
    if (fpResult?.useLLM) {
      return await llmFallback(session, userMessage, intent, { keepFlow: session.currentFlow ?? flowBefore })
    }
    if (fpResult) return fpResult

    // המסלול הפעיל לא הכיר את ההודעה — LLM עם הקשר, והמסלול נשמר
    return await llmFallback(session, userMessage, intent, { keepFlow: session.currentFlow ?? flowBefore })
  }

  // ── FP: "האם נרשמתי? הפרטים נשמרו?" → תשובה ישירה מה-DB ─────────────────
  // לפני התיקון זה נפל ל-LLM שהעביר לקורלי ("אין לי גישה לנתוני הרישום").
  if (!isExplicitNumericChoice(userMessage) && asksAboutRegistrationStatus(userMessage)) {
    const { buildRegistrationStatusAnswer } = await import('./staff-info')
    const statusAnswer = await buildRegistrationStatusAnswer(session.phone)
    if (statusAnswer) {
      return { text: statusAnswer, intent, isComplete: true }
    }
    // אין רישום → ה-LLM עונה עם ההקשר "לא נמצא רישום", בלי להסלים לקורלי
    return await llmFallback(session, userMessage, intent, { suppressTask: true })
  }

  // ── שאלה אמיתית? קודם נחפש ב-FAQ של האדמין לפני שמתחילים מסלול ──────────
  // ככה שאלות מידע כמו "כמה ימים אפשר?" יקבלו תשובה ישירה במקום להיכנס לרישום.
  // יוצא דופן: שאלה על הרכזת/הצוות → ל-LLM (שמקבל את פרטי הצוות בהקשר), לא FAQ גנרי.
  const asksAboutStaff = /רכזת|מדריכה|גננת|המורה|צוות|מי אחרא|איש קשר/.test(userMessage)
  if (!asksAboutStaff && isLikelyQuestion(userMessage) && !isExplicitNumericChoice(userMessage)) {
    const { findFaqAnswer } = await import('./faq-search')
    const faqAnswer = await findFaqAnswer(userMessage)
    if (faqAnswer) {
      return { text: faqAnswer, intent, isComplete: true }
    }
  }

  // ── FP: כוונה ברורה → מסלול מוגדר ────────────────────────────────────────
  const fpIntent = await handleNewIntent(session, userMessage, intent)
  if (fpIntent) return fpIntent

  // ── LLM: שום FP לא תפס ────────────────────────────────────────────────────
  return await llmFallback(session, userMessage, intent)
}

// זיהוי אם ההודעה היא שאלת מידע (לא בקשה לפעולה כמו "רישום לצהרון")
function isLikelyQuestion(msg: string): boolean {
  const t = msg.trim()
  if (t.endsWith('?')) return true
  return /^(האם|מה|מתי|איך|כמה|איפה|למה|אילו|מי|יש|אפשר|מ?אילו)\b/i.test(t)
}

function isExplicitNumericChoice(msg: string): boolean {
  return /^[1-9]$/.test(msg.trim())
}

// "האם נרשמתי? / הפרטים נשמרו? / קיבלתם את הטופס?" — שאלה על *רישום קיים*.
// ⚠️ לא לתפוס "אני רוצה לרשום ילד" — ולכן 'רשום' נדרש בלי תחילית (לא "לרשום").
// ⚠️ אותיות סופיות: 'רשום'/'נרשם' נגמרות ב-ם (לא מ) — חייבים לפרט את כל הצורות.
const REGISTRATION_STATUS_PATTERNS: RegExp[] = [
  /(^|[^א-ת])(רשום|רשומה|רשומים|רשומות)([^א-ת]|$)/,
  /(^|[^א-ת])(נרשם|נרשמה|נרשמו|נרשמתי|נרשמנו)([^א-ת]|$)/,
  /(הרישום|הטופס|הפרטים|הפורם|ההרשמה)[\s\S]{0,40}(נשמר|נקלט|נקלטו|נשמרו|התקבל|התקבלו|עבר|עברו)/,
  /(נשמר|נקלט|התקבל)(ו|ה)?[\s\S]{0,40}(הרישום|הטופס|הפרטים|ההרשמה)/,
  /קיבלתם את הטופס/,
]

function asksAboutRegistrationStatus(msg: string): boolean {
  const t = msg.trim()
  return REGISTRATION_STATUS_PATTERNS.some(re => re.test(t))
}

// ברכה = הודעה קצרה (עד 3 מילים / 15 תווים) שמכילה מילת ברכה כמילה שלמה
const GREETING_WORDS = ['שלום', 'היי', 'הי', 'הלו', 'בוקר', 'ערב', 'צהריים', 'לילה', 'תודה', 'אהלן', 'היייי']

function isShortGreeting(msg: string): boolean {
  const t = msg.trim()
  if (!t) return false
  const words = t.split(/\s+/).filter(Boolean)
  const isShort = words.length <= 3 || t.length <= 15
  if (!isShort) return false
  return GREETING_WORDS.some(g => matchesWholeWord(t, g))
}

// ─────────────────────────────────────────────────────────────────────────────
// שלבי *בחירה* (תפריט 1-N) — רק בהם מותר לכבד כוונה חדשה לפני העיבוד.
// בשלבי איסוף טקסט חופשי (שם ילד/ה, שעת איסוף, תיאור בעיה) אסור — שם כל מילה
// עלולה להיראות ככוונה ולהפיל את המסלול.
// ─────────────────────────────────────────────────────────────────────────────
const CHOICE_STEPS = new Set([
  'register_area',
  'register_existing_parent',
  'payment_status_menu',
  'payment_setup_start',
  'payment_setup_method',
  'payment_setup_area',
  'payment_setup_school',
  'camp_menu',
  'cost_info_start',
  'payment_fail_type',
  'payment_fail_method_choice',
])

// כוונות שמצדיקות יציאה ממסלול ומעבר למסלול אחר
const SWITCHABLE_INTENTS = new Set<BotIntent>([
  'רישום_צהרון', 'רישום_קייטנה', 'ביטול', 'שאלת_לוז',
  'איסוף_מוקדם', 'בדיקת_תשלום', 'אפשרויות_תשלום', 'כשל_תשלום',
])

// כוונות ש"שייכות" לשלב עצמו — ההורה בעצם *עונה על השאלה*, לא מחליף נושא.
// בלי זה "אשראי" בתוך payment_setup_method היה מפיל את המסלול ומתחיל אותו מחדש.
const STEP_OWN_INTENTS: Record<string, BotIntent[]> = {
  register_area:              ['רישום_צהרון'],
  register_existing_parent:   ['רישום_צהרון', 'בדיקת_תשלום'],
  payment_status_menu:        ['בדיקת_תשלום', 'אפשרויות_תשלום', 'כשל_תשלום'],
  payment_setup_start:        ['בדיקת_תשלום', 'אפשרויות_תשלום'],
  payment_setup_method:       ['בדיקת_תשלום', 'אפשרויות_תשלום'],
  payment_setup_area:         ['בדיקת_תשלום', 'אפשרויות_תשלום', 'רישום_צהרון'],
  payment_setup_school:       ['בדיקת_תשלום', 'אפשרויות_תשלום', 'רישום_צהרון'],
  // 'רישום_צהרון' כאן כי "יש לי בעיה בהרשמה" (אפשרות 3) מסווג כרישום
  camp_menu:                  ['רישום_קייטנה', 'רישום_צהרון'],
  // "עלות חודשית צהרון" (אפשרות 1) מסווג כרישום_צהרון
  cost_info_start:            ['בדיקת_תשלום', 'אפשרויות_תשלום', 'רישום_קייטנה', 'רישום_צהרון'],
  // "תחזרו אלי בעוד כמה ימים" (אפשרות 4) מסווג כבקשת_נציג — אבל השלב עצמו
  // יודע לתזמן תזכורת, וזה עדיף על הסלמה
  payment_fail_type:          ['בדיקת_תשלום', 'אפשרויות_תשלום', 'כשל_תשלום', 'בקשת_נציג'],
  payment_fail_method_choice: ['בדיקת_תשלום', 'אפשרויות_תשלום', 'כשל_תשלום'],
}

// ─────────────────────────────────────────────────────────────────────────────
// handleActiveFlow — מסלול פעיל
// מחזיר null אם ההודעה לא שייכת למסלול (→ LLM יטפל)
// ─────────────────────────────────────────────────────────────────────────────
async function handleActiveFlow(
  session: BotSession,
  userMessage: string,
  intent: BotIntent
): Promise<(BotResponse & { intent: BotIntent }) | null> {
  const flow = session.currentFlow!

  // ── תפריט שמכבד כוונה ─────────────────────────────────────────────────────
  // לפני התיקון כל טקסט חופשי בתפריט קיבל "לא הבנתי, אנא בחרו" — כולל
  // "תעביר אותי לנציג אנושי" (הכוונה זוהתה ונזרקה).
  if (CHOICE_STEPS.has(flow) && !isExplicitNumericChoice(userMessage)) {
    const ownIntents = STEP_OWN_INTENTS[flow] ?? []

    if (intent === 'בקשת_נציג' && !ownIntents.includes(intent)) {
      session.currentFlow = undefined
      return {
        text: buildEscalationMessage(),
        escalate: true,
        intent,
        createTask: {
          type:        'שאלה כללית',
          description: `ביקש/ה לדבר עם נציגה תוך כדי ${flow}: "${userMessage.slice(0, 80)}"`,
          priority:    'גבוה',
        },
        isComplete: true,
      }
    }

    if (SWITCHABLE_INTENTS.has(intent) && !ownIntents.includes(intent)) {
      session.currentFlow = undefined
      const switched = await handleNewIntent(session, userMessage, intent)
      if (switched) return switched
      session.currentFlow = flow   // לא היה למה לעבור — נשארים בשלב
    }
  }

  if (flow.startsWith('register_')) {
    return { ...await handleRegistrationFlow(session, userMessage), intent }
  }
  if (flow.startsWith('cancel_')) {
    return { ...await handleCancellationFlow(session, userMessage), intent }
  }
  if (flow.startsWith('pickup_')) {
    return { ...handleEarlyPickupFlow(session, userMessage), intent }
  }
  if (flow.startsWith('payment_fail_')) {
    return { ...await handlePaymentFailureParentFlow(session, userMessage), intent }
  }
  if (flow.startsWith('payment_setup_')) {
    return { ...await handlePaymentSetupFlow(session, userMessage), intent }
  }
  if (flow.startsWith('payment_status_')) {
    const result = await handlePaymentStatusMenuFlow(session, userMessage)
    // אם הבחירה הייתה "5 — להסדיר תשלום חדש", מפנה ישירות ל-payment_setup
    if (result.text === '__redirect_payment_setup__') {
      return { ...await handlePaymentSetupFlow(session, userMessage), intent }
    }
    return { ...result, intent }
  }
  if (flow === 'cost_info_start' || flow === 'cost_info_freetext') {
    const result = await handleCostInfoFlow(session, userMessage)
    // אם handleCostInfoFlow מחזיר text ריק → LLM יטפל בטקסט חופשי
    if (result.text === '' && flow === 'cost_info_freetext') {
      return null  // → LLM
    }
    return { ...result, intent }
  }
  if (flow.startsWith('waiting_spot_')) {
    return { ...await handleWaitingListSpotFlow(session, userMessage), intent }
  }
  if (flow.startsWith('camp_late_')) {
    return { ...handleLateCampFlow(session, userMessage), intent }
  }
  if (flow.startsWith('camp_')) {
    return { ...await handleCampMenuFlow(session, userMessage), intent }
  }

  // כוונה חדשה מפורשת תוך כדי מסלול → יוצאים ומתחילים חדש
  if (intent !== 'לא_ידוע' && intent !== 'שאלה_כללית') {
    session.currentFlow = undefined
    return handleNewIntent(session, userMessage, intent) ?? null
  }

  // לא ידוע בתוך מסלול → LLM יטפל
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// handleNewIntent — FP לפי כוונה מזוהה
// מחזיר null כשהכוונה לא_ידוע (→ LLM יטפל)
// ─────────────────────────────────────────────────────────────────────────────
async function handleNewIntent(
  session: BotSession,
  userMessage: string,
  intent: BotIntent
): Promise<(BotResponse & { intent: BotIntent }) | null> {
  switch (intent) {
    case 'רישום_צהרון':
      return { ...await handleRegistrationFlow(session, userMessage), intent }

    case 'רישום_קייטנה':
      return { ...handleCampRegistrationFlow(), intent }

    case 'ביטול':
      return { ...await handleCancellationFlow(session, userMessage), intent }

    case 'שאלת_לוז':
      return { ...await handleScheduleFlow(userMessage), intent }

    case 'איסוף_מוקדם':
      return { ...handleEarlyPickupFlow(session, userMessage), intent }

    case 'כשל_תשלום':
    case 'כשל_תשלום_יזום':
      return { ...await handlePaymentFailureParentFlow(session, userMessage), intent }

    case 'בדיקת_תשלום':
      return { ...handlePaymentStatusFlow(session.parentName), intent }

    case 'אפשרויות_תשלום': {
      // כניסה ישירה לתפריט שיטות תשלום
      session.currentFlow = 'payment_setup_start'
      return { ...await handlePaymentSetupFlow(session, userMessage), intent }
    }

    case 'בקשת_נציג':
      return {
        text: buildEscalationMessage(),
        escalate: true,
        intent,
        createTask: {
          type: 'שאלה כללית',
          description: `ביקש/ה לדבר עם נציגה: "${userMessage.slice(0, 80)}"`,
          priority: 'גבוה',
        },
        isComplete: true,
      }

    case 'שאלה_כללית': {
      // ברכות קצרות → תגובה חמה, לא LLM.
      // ⚠️ startsWith('הי') החזיר את תפריט הפתיחה גם ל-"הי, מילאתי את הפרטים
      //    אבל זה יצא באמצע…" (3 פעמים ברצף לבודק מתוסכל). עכשיו: ברכה = הודעה
      //    *קצרה* שכולה ברכה, ובדיקת מילה שלמה (לא "היום").
      if (isShortGreeting(userMessage)) {
        return {
          text: buildWelcomeMessage(session.parentName),
          intent,
          isComplete: true,
        }
      }
      // שאלה כללית עם תוכן → LLM
      return null
    }

    case 'לא_ידוע':
    default:
      // → LLM
      return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// תזכורת קצרה לחזרה למסלול — נספחת לתשובת ה-LLM בשלבי אישור/בחירה,
// כדי שההורה ידע שהשאלה נענתה אבל השאלה המקורית עדיין פתוחה.
// ─────────────────────────────────────────────────────────────────────────────
const FLOW_REMINDERS: Record<string, string> = {
  cancel_confirm_before15: 'לאישור הביטול: *כן* / *לא*',
  cancel_confirm_after15:  'לאישור הביטול: *כן* / *לא*',
  waiting_spot_confirm:    'לאישור המקום: *כן* / *לא*',
  register_waiting_confirm: 'להצטרפות לרשימת ההמתנה: *כן* / *לא*',
}

// ─────────────────────────────────────────────────────────────────────────────
// llmFallback — Claude API
//
// keepFlow: שם השלב שאליו חוזרים אחרי התשובה (המסלול *לא* מסתיים).
// suppressTask: לא לפתוח פנייה לקורלי (למשל שאלת "האם נרשמתי" בלי רישום במערכת).
// ─────────────────────────────────────────────────────────────────────────────
async function llmFallback(
  session: BotSession,
  userMessage: string,
  intent: BotIntent,
  opts: { keepFlow?: string; suppressTask?: boolean } = {}
): Promise<BotResponse & { intent: BotIntent }> {
  // שאלה על הצוות/המסגרת של ההורה → ישר ל-LLM (שמקבל את פרטי הצוות בהקשר),
  // כדי לתת תשובה ספציפית עם השמות במקום תשובת FAQ גנרית ("כתבו מאיזה גן").
  const asksAboutStaff = /רכזת|מדריכה|גננת|המורה|צוות|מי אחרא|איש קשר/.test(userMessage)

  // קודם — נסה למצוא תשובה ב-FAQ של האדמין (פאנל ניהול)
  // אם נמצא — חוסך קריאת LLM ועונה מהר ובדיוק לפי הניסוח של עינת
  if (!asksAboutStaff) {
    const { findFaqAnswer } = await import('./faq-search')
    const faqAnswer = await findFaqAnswer(userMessage)
    if (faqAnswer) {
      // גם תשובת FAQ באמצע מסלול לא אמורה לסיים אותו
      return finishLLMTurn(session, faqAnswer, intent, opts, false)
    }
  }

  const llmResult = await callLLMFallback(session, userMessage)

  // ── ה-LLM הסלים לקורלי → המסלול נסגר (אין טעם לחזור לשלב) ─────────────────
  const escalated = !!llmResult.createTask && !opts.suppressTask
  if (escalated) {
    session.currentFlow = undefined
    session.collectedData = {}
    return {
      text: llmResult.text,
      intent,
      isComplete: true,
      // הבוט לא ידע לענות והעביר לקורלי → עדיפות גבוהה (מפעיל התראה + מייל לאדמין)
      createTask: {
        type: 'שאלה כללית',
        description: llmResult.taskDescription || `הבוט העביר לקורלי — שאלה שלא נענתה: "${userMessage.slice(0, 80)}"`,
        priority: 'גבוה' as const,
      },
    }
  }

  // ── שמירת המסלול: keepFlow (היינו בתוך מסלול) או suggestFlow של ה-LLM ─────
  return finishLLMTurn(session, llmResult.text, intent, opts, true, llmResult.suggestFlow)
}

// בונה את תשובת ה-LLM/FAQ עם שמירת המסלול (nextFlow) ותזכורת חזרה אם צריך
function finishLLMTurn(
  session: BotSession,
  text: string,
  intent: BotIntent,
  opts: { keepFlow?: string; suppressTask?: boolean },
  allowSuggest: boolean,
  suggestFlow?: string
): BotResponse & { intent: BotIntent } {
  const nextFlow = opts.keepFlow ?? (allowSuggest ? suggestFlow || undefined : undefined)

  if (!nextFlow) {
    session.currentFlow = undefined
    return { text, intent, isComplete: true }
  }

  session.currentFlow = nextFlow
  const reminder = FLOW_REMINDERS[nextFlow]
  return {
    text: reminder ? `${text}\n\n_${reminder}_` : text,
    intent,
    nextFlow,
    isComplete: false,
  }
}
