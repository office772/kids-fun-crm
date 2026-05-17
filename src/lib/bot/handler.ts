import { BotIntent, BotSession } from '@/lib/types'
import { classifyIntent } from './intent-classifier'
import {
  BotResponse,
  buildWelcomeMessage,
  buildEscalationMessage,
  handleRegistrationFlow,
  handleCancellationFlow,
  handleCampRegistrationFlow,
  handleLateCampFlow,
  handleScheduleFlow,
  handleEarlyPickupFlow,
  handlePaymentFailureParentFlow,
  handlePaymentStatusFlow,
} from './flows'

export function processMessage(session: BotSession, userMessage: string): BotResponse & { intent: BotIntent } {
  const intent = classifyIntent(userMessage)

  // אם יש מסלול פעיל — ממשיכים בו
  if (session.currentFlow) {
    return handleActiveFlow(session, userMessage, intent)
  }

  // מסלול חדש לפי כוונה
  return handleNewIntent(session, userMessage, intent)
}

function handleActiveFlow(session: BotSession, userMessage: string, intent: BotIntent): BotResponse & { intent: BotIntent } {
  const flow = session.currentFlow!

  if (flow.startsWith('register_')) {
    return { ...handleRegistrationFlow(session, userMessage), intent }
  }

  if (flow.startsWith('camp_late_')) {
    return { ...handleLateCampFlow(session, userMessage), intent }
  }

  // כוונה חדשה מפורשת — מתחילים מסלול חדש
  if (intent !== 'לא_ידוע' && intent !== 'שאלה_כללית') {
    session.currentFlow = undefined
    return handleNewIntent(session, userMessage, intent)
  }

  // הודעה לא מובנת בתוך מסלול
  return {
    text: 'לא הבנתי 😊 אפשר לנסות שוב?',
    intent,
  }
}

function handleNewIntent(session: BotSession, userMessage: string, intent: BotIntent): BotResponse & { intent: BotIntent } {
  switch (intent) {
    case 'רישום_צהרון':
      return {
        ...handleRegistrationFlow(session, userMessage),
        intent
        // nextFlow comes from handleRegistrationFlow itself: 'register_child_name'
      }

    case 'רישום_קייטנה':
      return { ...handleCampRegistrationFlow(), intent }

    case 'ביטול':
      return { ...handleCancellationFlow(session), intent }

    case 'שאלת_לוז':
      return { ...handleScheduleFlow(userMessage), intent }

    case 'איסוף_מוקדם':
      return { ...handleEarlyPickupFlow(session), intent }

    case 'כשל_תשלום':
      return { ...handlePaymentFailureParentFlow(), intent }

    case 'בדיקת_תשלום':
      return { ...handlePaymentStatusFlow(session.parentName), intent }

    case 'שאלה_כללית':
    case 'לא_ידוע':
    default:
      // אם זו הודעת פתיחה — ברכה
      const isGreeting = ['שלום', 'היי', 'הי', 'בוקר', 'ערב', 'צהריים'].some(
        g => userMessage.trim().startsWith(g)
      )

      if (isGreeting || userMessage.trim().length < 5) {
        return {
          text: buildWelcomeMessage(session.parentName),
          intent,
          isComplete: true
        }
      }

      // הסלמה לנציג כשאי אפשר לזהות
      return {
        text: buildEscalationMessage(),
        escalate: true,
        intent,
        createTask: {
          type: 'שאלה כללית',
          description: `פנייה שלא זוהתה: "${userMessage}"`,
          priority: 'רגיל'
        },
        isComplete: true
      }
  }
}
