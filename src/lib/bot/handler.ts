import { BotIntent, BotSession } from '@/lib/types'
import { classifyIntent } from './intent-classifier'
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
  const intent = classifyIntent(userMessage)

  // ── FP: מסלול פעיל — ממשיכים בו ──────────────────────────────────────────
  if (session.currentFlow) {
    const fpResult = await handleActiveFlow(session, userMessage, intent)
    if (fpResult) return fpResult

    // המסלול הפעיל לא הכיר את ההודעה — LLM עם הקשר
    return await llmFallback(session, userMessage, intent)
  }

  // ── FP: כוונה ברורה → מסלול מוגדר ────────────────────────────────────────
  const fpIntent = await handleNewIntent(session, userMessage, intent)
  if (fpIntent) return fpIntent

  // ── LLM: שום FP לא תפס ────────────────────────────────────────────────────
  return await llmFallback(session, userMessage, intent)
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
    return { ...handlePaymentFailureParentFlow(session, userMessage), intent }
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
      return { ...handleScheduleFlow(userMessage), intent }

    case 'איסוף_מוקדם':
      return { ...handleEarlyPickupFlow(session, userMessage), intent }

    case 'כשל_תשלום':
    case 'כשל_תשלום_יזום':
      return { ...handlePaymentFailureParentFlow(session, userMessage), intent }

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
      // ברכות קצרות → תגובה חמה, לא LLM
      const isGreeting = ['שלום', 'היי', 'הי', 'בוקר', 'ערב', 'צהריים', 'לילה', 'תודה'].some(
        g => userMessage.trim().toLowerCase().startsWith(g)
      )
      if (isGreeting || userMessage.trim().length < 5) {
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
// llmFallback — Claude API
// ─────────────────────────────────────────────────────────────────────────────
async function llmFallback(
  session: BotSession,
  userMessage: string,
  intent: BotIntent
): Promise<BotResponse & { intent: BotIntent }> {
  const llmResult = await callLLMFallback(session, userMessage)

  // ── LLM הציע לחזור לזרימה — עדכן session ────────────────────────────────
  if (llmResult.suggestFlow) {
    session.currentFlow = llmResult.suggestFlow
  }

  return {
    text: llmResult.text,
    intent,
    isComplete: true,
    ...(llmResult.createTask
      ? {
          createTask: {
            type: 'שאלה כללית',
            description: llmResult.taskDescription || `שאלה חופשית מ-LLM: "${userMessage.slice(0, 80)}"`,
            priority: 'רגיל' as const,
          },
        }
      : {}),
  }
}
