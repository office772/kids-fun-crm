import { BotIntent, BotSession } from '@/lib/types'
import { classifyIntent, matchesWholeWord, normalizeMessage } from './intent-classifier'
import {
  BotResponse,
  buildWelcomeMessage,
  buildEscalationMessage,
  buildDidNotUnderstand,
  looksLikeChildName,
  isHolidayQuestion,
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
import { botText } from './bot-messages-db'
import { callLLMFallback } from './llm-fallback'

// ─────────────────────────────────────────────────────────────────────────────
// processMessage — async
// 1. מנסה כל ה-FP (Fast Paths) בסדר עדיפות
// 2. אם שום FP לא תפס → fallback ל-Claude LLM
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// שומר תסכול (בקשת עינת 17.9): "לא יותר מ-2 הודעות מתסכלות" — אחרי שתי הודעות
// שלא קיבלו מענה אמיתי (או שני סימני עצבים) הבוט מפסיק להתעקש ומעביר לקורלי.
// אחרי ההעברה הבוט שותק 30 דקות (bank #13 — המשך כתיבה אחרי handoff), אלא אם
// ההורה מבקש במפורש לחזור לתפריט (ספרה / "תפריט" / "בוט").
// ─────────────────────────────────────────────────────────────────────────────
export const HANDOFF_FLOW = 'handoff_paused'

const FRUSTRATION_PATTERNS: RegExp[] = [
  /אתה רציני|את רצינית|רציני\?|רצינית\?/,
  /מטומטם|דפוק|טיפש|אידיוט|מפגר|חסר תועלת|לא שווה/,
  /רובוט|בוט מטומטם|בוט דפוק/,
  /לא הבנת אותי|לא מבין אותי|לא מבינה אותי|לא מקשיב|מתעלם|מתעלמת/,
  /נמאס|די כבר|נו כבר|מספיק כבר|תפסיק|עזוב אותי|עזבי אותי/,
  /בא לי למות|אני מתעצבן|מעצבן|מתסכל|מרגיז/,
  /לא עוזר|לא עוזרת|לא עונה לי|לא מגיב|מה הקשר/,
  /כבר אמרתי|אמרתי לך|אמרתי כבר|כמה פעמים|פעם שלישית|שוב פעם/,
  /!{3,}|\?{3,}|נו{3,}/,
]

function looksFrustrated(msg: string): boolean {
  const t = (msg || '').trim()
  if (!t) return false
  return FRUSTRATION_PATTERNS.some(re => re.test(t))
}

// ניסוחי "לא הבנתי" של ה-LLM — גם כשהם מנוסחים יפה, ההורה לא קיבל תשובה.
// (אתגור 17.9: הבוט ביקש "אפשר לפרט?" שלוש פעמים ברצף וההורה התפוצץ.)
const LLM_REPHRASE_RE =
  /לא הבנתי|לא הצלחתי (להבין|לזהות)|(לא|אינ[הו])[^.!?]{0,14}(ברור|ברורה) לי|כתוב\/?י שוב|תכתבי שוב|נסה שוב|נסי שוב|בעיה בהקלדה|תוכל\/?י לפרט|אפשר לפרט|אשמח שתפרט|אשמח שתסביר|לא בטוח(ה)? שהבנתי|רק שאדייק|נראה שהודעת|בוא(י|ו)? נתחיל מחדש|מה בדיוק (אתה|את|אתם|תרצ)/

const LLM_ERROR_MARKER = 'נציגה שלנו תחזור אליך בהקדם 💛'   // buildLLMErrorFallback
function isNonAnswer(text: string): boolean {
  const t = (text || '').trim()
  if (!t) return false
  return LLM_REPHRASE_RE.test(t) ||
    t.includes(LLM_ERROR_MARKER)
}

// הודעה שאין בה תוכן ממשי ("...", "?", "asdf") — גם היא "תור שלא התקדם".
// ⚠️ תשובות קצרות תקינות (כן/לא/אוקי/תודה) *אינן* ג'יבריש.
const SHORT_VALID_RE = /^(כן|לא|ok|okay|אוקי|אוקיי|טוב|בסדר|תודה|היי|הי|שלום|יש|אין|סבבה|מעולה)[!.?]*$/i

function isGibberish(msg: string): boolean {
  const t = (msg || '').trim()
  if (!t) return false
  if (/^[?.!…\s]+$/.test(t)) return true              // "?" / "..." / "…"
  if (SHORT_VALID_RE.test(t)) return false
  const hasHebrewWord = /[א-ת]{3,}/.test(t)
  const hasDigit      = /\d/.test(t)
  return !hasHebrewWord && !hasDigit
}

// ─── יציאה ממצב handoff ──────────────────────────────────────────────────────
function wantsMenuBack(msg: string): boolean {
  const t = normalizeMessage(msg).trim()
  return /^[1-6]$/.test(t) || isMenuWord(t)
}

function isMenuWord(msg: string): boolean {
  return /^(תפריט|בוט|חזרה לבוט|התחלה|start|menu)$/i.test(msg.trim())
}

// ─── הודעות שנוגעות לשלום הילד/ה — קורלי מקבלת התראה מיידית ─────────────────
// ⚠️ ה-\b של JS לא עובד ליד עברית — לכן גבול מילה ידני משני הצדדים.
const SAFETY_WORDS = [
  'פצע', 'פצעים', 'פציעה', 'נפצע', 'נפצעה', 'חבורה', 'חבורות',
  'נפל', 'נפלה', 'תאונה', 'תאונת', 'אלימות', 'אלים', 'אלימה',
  'הכה', 'הכו', 'הכתה', 'נעלם', 'נעלמה', 'מציק', 'מציקה', 'מציקים',
  'בוכה', 'אמבולנס', 'נחנק', 'נחנקה', 'נשך', 'נשכה', 'נשכו',
]
const SAFETY_PHRASES = ['לא חזר', 'לא חזרה', 'חולה בבית']

// ─── ביטויי מצוקה של ההורה עצמו ("בא לי למות") ──────────────────────────────
// בדיקת עשן 17.9: ה-LLM ענה בעצמו עם "קווי סיוע" ומספרים מומצאים (1221, 101).
// זה לא תפקיד הבוט — מעבירים מיד לקורלי (דחוף) ושותקים, כמו בקשת נציג.
const DISTRESS_RE = /בא לי למות|רוצה למות|אין לי כוח לחיות|לא רוצה לחיות|להתאבד|מתאבד/
function isDistress(msg: string): boolean {
  return DISTRESS_RE.test((msg || '').trim())
}

function isSafetyCritical(msg: string): boolean {
  const t = (msg || '').trim()
  if (!t) return false
  if (SAFETY_PHRASES.some(p => t.includes(p))) return true
  return SAFETY_WORDS.some(w => new RegExp(`(^|[^א-ת])[ולבהכמש]{0,2}${w}([^א-ת]|$)`).test(t))
}

export async function processMessage(
  session: BotSession,
  userMessage: string
): Promise<BotResponse & { intent: BotIntent }> {
  // ── אחרי העברה לקורלי — שתיקה (עד פקיעת ה-session), אלא אם מבקשים תפריט ──
  if (session.currentFlow === HANDOFF_FLOW) {
    if (!wantsMenuBack(userMessage)) {
      // 23.9 (עינת): אחרי "אני מעביר לקורלי" לא משאירים הורה מול קיר.
      //   בקשה מפורשת לנציגה/מענה אנושי → "הפנייה אצלה" (בלי LLM, בלי ויכוח).
      //   שאלה אחרת → ניסיון LLM *אחד* עם תזכורת שקורלי תחזור; אחריו שתיקה עד שקורלי מחזירה את הבוט
      //   (כדי לא לנהל דו-שיח כפול מולה). ג'יבריש/אמוג'י → שתיקה.
      if (classifyIntent(userMessage) === 'בקשת_נציג') {
        return { text: botText('handoff_still_open'), intent: 'בקשת_נציג', nextFlow: HANDOFF_FLOW, isComplete: false }
      }
      if (session.collectedData.__handoff_llm !== '1' && !isGibberish(userMessage)) {
        session.collectedData.__handoff_llm = '1'
        const r = await llmFallback(session, userMessage, 'לא_ידוע', { keepFlow: HANDOFF_FLOW, suppressTask: true })
        session.currentFlow = HANDOFF_FLOW
        return { ...r, text: r.text ? `${r.text}\n\n${botText('handoff_llm_note')}` : '', nextFlow: HANDOFF_FLOW, isComplete: false }
      }
      return { text: '', intent: 'לא_ידוע', nextFlow: HANDOFF_FLOW, isComplete: false }
    }
    session.currentFlow = undefined
    session.collectedData = {}
    // "תפריט" / "בוט" (לא ספרה) → מחזירים את התפריט מיד, בלי לסווג כוונה
    if (isMenuWord(normalizeMessage(userMessage))) {
      return { text: buildWelcomeMessage(session.parentName), intent: 'שאלה_כללית', isComplete: true }
    }
  }

  // ההיסטוריה נטענת *לפני* רישום ההודעה הנוכחית — לכן "אחרון" = התור הקודם
  const history = session.messages || []
  const lastBot  = [...history].reverse().find(m => m.role === 'bot')?.text ?? ''
  const lastUser = [...history].reverse().find(m => m.role === 'user')?.text ?? ''

  const result = await processMessageCore(session, userMessage)

  // בקשת נציג מפורשת (escalate) → מעבר למצב handoff. הסלמה "רכה" של ה-LLM
  // ("מעבירה לקורלי את שאלת המחיר") פותחת פנייה אבל *לא* משתיקה את הבוט.
  if (result.escalate) {
    session.currentFlow = HANDOFF_FLOW
    session.collectedData = {}
    return { ...result, nextFlow: HANDOFF_FLOW, isComplete: false }
  }

  // 23.9 (עינת, §5): כשה-LLM עצמו נפל (טקסט השגיאה הגנרי), לא סופרים גם את ההודעה הנוכחית כ"תסכול" -
  //   אחרת "?" בודד בזמן תקלת API הסלים לקורלי מיד. הסלמה רק אחרי שני תורים אמיתיים.
  const llmDown = (result.text || '').includes(LLM_ERROR_MARKER)
  const strikes =
    ((looksFrustrated(lastUser) || isGibberish(lastUser)) ? 1 : 0) +
    (isNonAnswer(lastBot) ? 1 : 0) +
    ((!llmDown && (looksFrustrated(userMessage) || isGibberish(userMessage))) ? 1 : 0) +
    ((isNonAnswer(result.text) || (!!result.text && result.text === lastBot)) ? 1 : 0)

  if (strikes >= 2) {
    console.log(`[frustration-guard] strikes=${strikes} → handoff to Corli (flow=${session.currentFlow ?? '-'})`)
    session.currentFlow = HANDOFF_FLOW
    session.collectedData = {}
    return {
      text: buildEscalationMessage(),
      intent: result.intent,
      escalate: true,
      nextFlow: HANDOFF_FLOW,
      isComplete: false,
      createTask: {
        type: 'שאלה כללית',
        description: `הורה מתוסכל — הבוט לא הצליח לענות פעמיים. ההודעה האחרונה: "${userMessage.slice(0, 80)}" | התשובה שנחסמה: "${(result.text || '').replace(/\n/g, ' ').slice(0, 60)}"`,
        priority: 'גבוה',
      },
    }
  }

  return result
}

async function processMessageCore(
  session: BotSession,
  userMessage: string
): Promise<BotResponse & { intent: BotIntent }> {
  // astra #8: נרמול פעם אחת בכניסה (ניקוד + ספרות ערביות/פרסיות → ASCII), כך
  // שהסיווג, בחירת התפריט (isExplicitNumericChoice) והשלב הפעיל מסכימים. קודם
  // "٢" בשלב אזור נורמל רק למסווג (→ קייטנה) ונחשב "החלפת נושא" במקום בחירה.
  userMessage = normalizeMessage(userMessage)

  // ── קובץ/תמונה? ניתוח אמיתי במקום ניחוש כוונה מתוך URL ────────────────────
  // (לפני התיקון: קישור לקובץ נכנס ל-classifier והחזיר תפריטים אקראיים)
  const { detectMedia, handleMediaMessage } = await import('./media-handler')
  const media = detectMedia(userMessage)
  if (media) {
    const mediaResult = await handleMediaMessage(session, media)
    return { ...mediaResult, intent: 'לא_ידוע' }
  }

  const intent = classifyIntent(userMessage)

  // ── שלום הילד/ה קודם לכל מסלול ────────────────────────────────────────────
  // "הילד חזר עם חבורה בראש" / "מישהו מציק לו" — לא שאלה לבוט. פנייה *דחופה*
  // לקורלי מיד, מכל שלב, ובלי להשתיק את הבוט (ההורה עדיין יכול לכתוב).
  if (isSafetyCritical(userMessage)) {
    console.log('[safety] escalating immediately (דחוף)')
    session.currentFlow = undefined
    session.collectedData = {}
    return {
      text: botText('safety_escalation'),
      intent,
      isComplete: true,
      createTask: {
        type:        'שאלה כללית',
        description: `⚠️ פנייה דחופה מהורה (שלום/בטיחות הילד/ה): "${userMessage.slice(0, 120)}" | טלפון: ${session.phone}`,
        priority:    'דחוף',
      },
    }
  }

  // ── ביטוי מצוקה של ההורה → העברה מיידית לקורלי (דחוף) ושתיקה ─────────────
  if (isDistress(userMessage)) {
    console.log('[safety] distress phrase → handoff to Corli (דחוף)')
    session.currentFlow = undefined
    session.collectedData = {}
    return {
      text: buildEscalationMessage(),
      intent,
      escalate: true,
      isComplete: true,
      createTask: {
        type:        'שאלה כללית',
        description: `⚠️ ביטוי מצוקה מהורה — לחזור אליו/ה אישית: "${userMessage.slice(0, 120)}" | טלפון: ${session.phone}`,
        priority:    'דחוף',
      },
    }
  }

  // ── FP: מסלול פעיל — ממשיכים בו ──────────────────────────────────────────
  if (session.currentFlow) {
    const flowBefore = session.currentFlow
    // "נדבר מחר" / "אחזור אחר כך" באמצע מסלול → ההורה דוחה. מסיימים את המסלול (בלי לבצע דבר) ומחכים.
    //   לא בשלבי תיאור חופשי (שם ההודעה היא תוכן), ולא אחרי הפניה לקורלי.
    if (!DESCRIPTION_STEPS.has(flowBefore) && !isExplicitNumericChoice(userMessage) && isDeferral(userMessage)) {
      session.currentFlow = undefined
      session.collectedData = {}
      return { text: botText('defer_reply'), intent, isComplete: true }
    }
    const fpResult = await handleActiveFlow(session, userMessage, intent)
    // 23.9 (עינת) - סולם "בוט חכם" לתשובה שהשלב לא מזהה, אחיד לכל המסלולים:
    //   פעם 1: הבהרת השלב (המסלול המהיר) · פעם 2: LLM עם הקשר, המסלול נשמר · פעם 3: העברה לקורלי.
    //   "תקיעות" = השלב החזיר notUnderstood בלי להתקדם, או ביקש LLM (useLLM), או לא הכיר את ההודעה (null).
    //   התקדמות אמיתית מאפסת את המונה. שלבי אישור כספי לא מסמנים notUnderstood - הם נשארים דטרמיניסטיים.
    const stuck = !fpResult || !!fpResult.useLLM || (!!fpResult.notUnderstood && fpResult.nextFlow === flowBefore)
    if (!stuck) { clearMiss(session); return fpResult! }
    // שאלה אמיתית באמצע שלב ("כמה זה עולה?") אינה "תקיעות" - ה-LLM עונה והמונה לא זז
    //   (3 שאלות לגיטימיות לא אמורות להעביר לקורלי; כשל LLM חוזר נתפס ע"י שומר התסכול).
    //   חל גם על שלבים שלא מזהים שאלות בעצמם (מחזירים "לא הבנתי" על "כמה זה עולה?").
    if (isLikelyQuestion(userMessage)) {
      return await llmFallback(session, userMessage, intent, { keepFlow: session.currentFlow ?? flowBefore })
    }
    const miss = bumpMiss(session, flowBefore)
    if (miss >= 3) {
      clearMiss(session)
      return {
        text: buildEscalationMessage(),
        intent,
        escalate: true,
        isComplete: true,
        createTask: {
          type:        'שאלה כללית',
          description: `ההורה נתקע 3 פעמים בשלב ${flowBefore} - הבוט העביר לקורלי. ההודעה האחרונה: "${userMessage.slice(0, 80)}"`,
          priority:    'גבוה',
        },
      }
    }
    if (fpResult?.notUnderstood && miss === 1) return fpResult          // הבהרת השלב, פעם אחת
    // ⚠️ keepFlow: בלעדיו כל תשובת LLM סיימה את המסלול (isComplete) והווב-הוק
    //    מחק את ה-session — ההורה נפל מהמסלול אחרי שאלה אחת (לוגים 09/2026).
    return await llmFallback(session, userMessage, intent, { keepFlow: session.currentFlow ?? flowBefore })
  }

  // ── 23.9: רגעים אנושיים בלי מסלול - סגירה/תודה/פתיחה (לפני FAQ וכוונה) ──────────
  //   סגירה ותודה → תשובה חמה קבועה (עריכה בדשבורד). פתיחה מוכרת → תפריט.
  //   כל השאר (תגובה קצרה, שיחת חולין, פתיחה לא מוכרת) → LLM עם ההקשר; בהודעה *ראשונה* בשיחה
  //   התפריט מצורף אחרי תשובת ה-LLM ("LLM להבהרה לפי ההקשר ואז תפריט").
  if (!isExplicitNumericChoice(userMessage)) {
    if (isThanksClosing(userMessage)) return { text: botText('thanks_reply'), intent: 'שאלה_כללית', isComplete: true }
    if (isFarewell(userMessage) || FAREWELL_START_RE.test(normalizeMessage(userMessage).trim())) {
      return { text: botText('farewell_reply'), intent: 'שאלה_כללית', isComplete: true }
    }
    if (isDeferral(userMessage))      return { text: botText('defer_reply'), intent: 'שאלה_כללית', isComplete: true }
    if (isShortGreeting(userMessage)) return { text: buildWelcomeMessage(session.parentName), intent: 'שאלה_כללית', isComplete: true }
  }

  // ── FP: "האם נרשמתי? הפרטים נשמרו?" → תשובה ישירה מה-DB ─────────────────
  // לפני התיקון זה נפל ל-LLM שהעביר לקורלי ("אין לי גישה לנתוני הרישום").
  if (!isExplicitNumericChoice(userMessage) && asksAboutRegistrationStatus(userMessage)) {
    const { buildRegistrationStatusAnswer } = await import('./staff-info')
    // ההודעה עוברת הלאה — "נרשמתי לקייטנה?" חייב להיענות על *קייטנה*, לא על הצהרון
    const statusAnswer = await buildRegistrationStatusAnswer(session.phone, userMessage)
    if (statusAnswer) {
      return { text: statusAnswer, intent, isComplete: true }
    }
    // אין רישום → ה-LLM עונה עם ההקשר "לא נמצא רישום", בלי להסלים לקורלי
    return await llmFallback(session, userMessage, intent, { suppressTask: true })
  }

  // ── שאלה אמיתית? קודם נחפש ב-FAQ של האדמין לפני שמתחילים מסלול ──────────
  // ככה שאלות מידע כמו "כמה ימים אפשר?" יקבלו תשובה ישירה במקום להיכנס לרישום.
  // יוצא דופן: שאלה על הרכזת/הצוות → ל-LLM (שמקבל את פרטי הצוות בהקשר), לא FAQ גנרי.
  // יוצא דופן נוסף: שאלת *חג/חופשה* → למסלול הלו"ז, שיודע לבחור את ה-FAQ של
  // החגים. חיפוש ה-fuzzy כאן החזיר לה את שעות הפעילות הרגילות (אתגור 17.9).
  const asksAboutStaff = /רכזת|מדריכה|גננת|המורה|צוות|מי אחרא|איש קשר/.test(userMessage)
  if (!asksAboutStaff && !isHolidayQuestion(userMessage) &&
      isLikelyQuestion(userMessage) && !isExplicitNumericChoice(userMessage)) {
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
  const llmReply = await llmFallback(session, userMessage, intent)
  // 23.9: פתיחת שיחה לא מוכרת ("אהלן וסהלן", "מה נשמע") - ה-LLM מבהיר לפי ההקשר ואז מוצג התפריט.
  //   רק כשאין היסטוריה (הודעה ראשונה) ואין מסלול/הסלמה - אחרת "יופי"/"מעולה" באמצע שיחה היו מקבלים תפריט.
  //   ורק להודעה קצרה שאינה שאלה - שאלה אמיתית בהודעה ראשונה מקבלת תשובה בלי תפריט מיותר.
  const firstMessage = (session.messages || []).length === 0
  const shortOpening = userMessage.trim().split(/\s+/).filter(Boolean).length <= 3 && !isLikelyQuestion(userMessage)
  if (firstMessage && shortOpening && !llmReply.escalate && !llmReply.nextFlow && llmReply.text && !llmReply.text.includes('*1* - רישום לצהרון')) {
    return { ...llmReply, text: `${llmReply.text}\n\n${botText('menu')}` }
  }
  return llmReply
}

// זיהוי אם ההודעה היא שאלת מידע (לא בקשה לפעולה כמו "רישום לצהרון")
function isLikelyQuestion(msg: string): boolean {
  const t = msg.trim()
  if (t.includes('?')) return true
  // ⚠️ ה-\b של JS לא עובד ליד עברית — הגרסה הקודמת עם \b לא תפסה *כלום*.
  return /^(האם|מה|מתי|איך|כמה|איפה|למה|אילו|מי|יש|אפשר)([^א-תA-Za-z0-9]|$)/i.test(t)
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

// ─── מונה "תקיעות" בשלב (סולם בוט חכם) ─────────────────────────────────────
const MISS_KEY = '__miss'
function bumpMiss(session: BotSession, flow: string): number {
  const [f, n] = String(session.collectedData[MISS_KEY] ?? '').split(':')
  const count = f === flow ? (Number(n) || 0) + 1 : 1
  session.collectedData[MISS_KEY] = `${flow}:${count}`
  return count
}
function clearMiss(session: BotSession): void { delete session.collectedData[MISS_KEY] }

// ברכת *פתיחה* = הודעה קצרה (עד 3 מילים / 15 תווים) שמכילה מילת פתיחה כמילה שלמה → תפריט.
//   23.9: "תודה"/"לילה"/"ערב" הוצאו מכאן - סגירה ("לילה טוב", "תודה על הכל") אינה פתיחה.
const GREETING_WORDS = ['שלום', 'היי', 'הי', 'הלו', 'בוקר', 'צהריים', 'ערב', 'אהלן', 'היייי', 'אהלאן', 'הלואו', 'יו']
// ברכת *סיום* - אוצר סגור עם עוגן חובה (מילה שמסמנת פרידה), כל שאר המילים מהאוצר → farewell_reply.
const FAREWELL_ANCHORS = ['לילה', 'ביי', 'להתראות', 'ולהתראות', 'נתראה', 'שבת', 'חג', 'שנה', 'סופש', 'שבוע', 'בהצלחה', 'bye', 'goodbye']
const FAREWELL_FILLERS = ['טוב', 'טובה', 'נעים', 'נעימה', 'נהדר', 'שלום', 'ומבורך', 'שמח', 'לכולם', 'ומתוקה', 'לכם', 'לך', 'תודה', 'ותודה', 'בקרוב', 'יום', 'המשך', 'מקסים', 'רבה', 'ערב', 'בוקר', 'good', 'night']
// פרידות בלי מילת-עוגן ייחודית ("יום טוב") - ביטויים שלמים בלבד
const FAREWELL_PHRASES = ['יום טוב', 'יום נעים', 'המשך יום טוב', 'המשך יום נעים', 'יום מקסים', 'המשך יום מקסים', 'ערב טוב ותודה', 'ערב נעים']
// 23.9 (עינת): "ביי, אני אחזור מחר לרשום" התחיל רישום (המסווג תפס "לרשום"). ההורה *עוזב* או *דוחה* -
//   לא מתחילים מסלול. (א) פרידה בראש ההודעה → farewell; (ב) כוונה דחויה (פועל-חזרה + זמן) → defer_reply.
const FAREWELL_START_RE = /^(ביי|להתראות|לילה טוב|שבת שלום|נתראה|יאללה ביי|טוב ביי)([^א-ת]|$)/
const DEFER_INTENT_RE = /(אחזור|נחזור|אדבר|נדבר|אמשיך|נמשיך|אשלים|נשלים|אעשה|נעשה|ארשום|נרשום)\s+(את זה\s+)?(מחר|אחר כך|אחכ|בהמשך|יותר מאוחר|מאוחר יותר|בערב|בשבוע הבא|בהזדמנות)|(מחר|אחר כך|בהמשך|יותר מאוחר|מאוחר יותר|בערב)\s+(אני\s+)?(אחזור|נחזור|אדבר|נדבר|אמשיך|נמשיך|אשלים|נשלים|ארשום|נרשום)/
function isDeferral(msg: string): boolean {
  const t = normalizeMessage(msg).trim()
  return !/[?؟]/.test(t) && DEFER_INTENT_RE.test(t)
}
function isFarewell(msg: string): boolean {
  const raw = msg.trim()
  if (!raw || /[?؟]/.test(raw)) return false
  const words = normalizeMessage(raw).toLowerCase().replace(/[^א-תa-z\s]+/g, ' ').split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 6) return false
  if (FAREWELL_PHRASES.includes(words.join(' '))) return true
  return words.some(w => FAREWELL_ANCHORS.includes(w)) &&
    words.every(w => FAREWELL_ANCHORS.includes(w) || FAREWELL_FILLERS.includes(w))
}

// 23.9 (עינת, בדיקה חיה): "יופי תודה" אחרי סיום מסלול החזיר את *תפריט הפתיחה* - כלל ה"תודה" תפס רק
//   הודעה שמתחילה ב"תודה", והמילה "תודה" נחשבה ברכה קצרה → תפריט. עכשיו: הודעת סגירה = כל המילים
//   מאוצר סגור (תודה + מילות סגירה/הערכה), בלי סימן שאלה ובלי תוכן אחר → תשובה חמה, לא תפריט.
const THANKS_CORE = ['תודה', 'תודה', 'ותודה', 'thanks', 'thank', 'you', 'תנקס', 'טנקס']
// 23.9 (עינת): "תודה על העזרה"/"תודה מכל הלב"/"תודה אני מסודר" נפלו לתפריט. במקום רשימת-מילוי שגדלה
//   דוגמה-דוגמה: הודעה קצרה עם "תודה", בלי סימן שאלה, בלי מילת שאלה/ניגוד/בקשה, ובלי כוונה ממשית
//   (המסווג לא זיהה מסלול) = סגירה. הצד הבטוח כאן הוא לא-כספי: טעות = תשובה חמה במקום LLM.
const THANKS_BLOCKERS = ['אבל', 'למה', 'מה', 'מתי', 'איך', 'כמה', 'האם', 'איפה', 'אפשר', 'רוצה', 'צריך', 'צריכה', 'לא', 'אין', 'עוד', 'גם', 'שאלה', 'בעיה']
function isThanksClosing(msg: string): boolean {
  const raw = msg.trim()
  if (!raw || /[?؟]/.test(raw)) return false
  const words = normalizeMessage(raw).toLowerCase().replace(/[^א-תa-z\s]+/g, ' ').split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 7) return false
  const hasThanks = words.some(w => THANKS_CORE.includes(w) || /^ו?תודה+$/.test(w))
  if (!hasThanks || words.some(w => THANKS_BLOCKERS.includes(w))) return false
  const intent = classifyIntent(raw)
  return intent === 'שאלה_כללית' || intent === 'לא_ידוע'
}

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
  'payment_setup_offer',
  'payment_setup_cancel_choice',
  'payment_setup_method',
  'payment_setup_area',
  'payment_setup_school',
  'camp_menu',
  'cost_info_start',
  'payment_fail_type',
  'payment_fail_method_choice',
])

// שלבי *תיאור חופשי* — ההורה מתאר בעיה/מועד, וכל מילה עלולה להיראות ככוונה.
// D2 17.9: "האתר לא נותן לי לשלם" בתיאור בעיית קייטנה קפץ לתפריט התשלומים.
// בשלבים האלה לא מחליפים מסלול (רק בקשת נציג / "תפריט" מכובדות).
const DESCRIPTION_STEPS = new Set([
  'camp_problem_desc',
  'payment_fail_describe',
  'payment_fail_remind_when',
  'cost_info_freetext',
  'pickup_collector',
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
  // 'ביטול' כאן: בשלב הצעת הו"ק "לא רוצה" הוא סירוב *להצעה*, לא בקשה לבטל רישום —
  //   כדי שלא ייחטף למסלול הביטול (הבלבול שהלקוח דיווח עליו). offerVerdict מטפל בו.
  //   astra חלק ב' (10): גם 'שאלת_לוז' — "יאללה סגור"/"סגור עליי" סווגו כשאלת שעות ("סגור") ונחטפו
  //   מההצעה ל-LLM על שעות פעילות; שאלת לו"ז אמיתית בשלב הזה ממילא נענית ב-LLM (question) בלי לאבד את ההצעה.
  payment_setup_offer:        ['בדיקת_תשלום', 'אפשרויות_תשלום', 'ביטול', 'שאלת_לוז'],
  // שלב הבירור "מה לבטל" — התשובה ("את הרישום"/"צהרון") אסור שתיחטף לרישום/כוונה חדשה.
  payment_setup_cancel_choice: ['בדיקת_תשלום', 'אפשרויות_תשלום', 'ביטול', 'רישום_צהרון', 'רישום_קייטנה'],
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
  // ── שלבי טקסט חופשי: הכוונה של המסלול עצמו אינה "החלפת נושא" ──────────────
  register_child_name:        ['רישום_צהרון'],
  register_class:             ['רישום_צהרון'],
  register_waiting_confirm:   ['רישום_צהרון'],
  cancel_child:               ['ביטול'],
  cancel_confirm_before15:    ['ביטול'],
  cancel_confirm_after15:     ['ביטול'],
  camp_check_name:            ['רישום_קייטנה'],
  camp_late_name:             ['רישום_קייטנה'],
  pickup_child:               ['איסוף_מוקדם'],
  pickup_time:                ['איסוף_מוקדם'],
  pickup_collector:           ['איסוף_מוקדם'],
  payment_status_child_name:  ['בדיקת_תשלום'],
  payment_fail_child_name:    ['בדיקת_תשלום', 'כשל_תשלום'],
  payment_fail_new_date:      ['בדיקת_תשלום', 'כשל_תשלום'],
  payment_fail_remind_when:   ['בדיקת_תשלום', 'כשל_תשלום'],
  payment_setup_child_name:   ['בדיקת_תשלום', 'אפשרויות_תשלום'],
}

// ─── שלבי אישור ──────────────────────────────────────────────────────────────
// בשלבים האלה "כן" מבצע פעולה כספית/בלתי הפיכה. אם השיחה יצאה מהם (הסלמה),
// אסור להחזיר אליהם את ההורה — "כן" מאוחר לא יבצע ביטול שההורה כבר נטש.
const CONFIRM_STEPS = new Set([
  'cancel_confirm_before15',
  'cancel_confirm_after15',
  'register_waiting_confirm',
  'waiting_spot_confirm',
  'payment_fail_confirm_child',
])


// ─── החלפת נושא מפורשת בשלב *טקסט חופשי* ────────────────────────────────────
// בשלב איסוף טקסט (שם ילד/ה, שעה, תיאור) כל מילה עלולה להיראות ככוונה, ולכן
// מחליפים מסלול רק כשההודעה באמת נשמעת כמו בקשה חדשה: לפחות 3 מילים,
// ולא משהו שנראה כמו שם ילד/ה ("דניאל אבני" נשאר שם, "בעצם אני רוצה לרשום
// עוד ילד" מתחיל רישום).
function canSwitchFromFreeText(msg: string): boolean {
  const t = msg.trim()
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length < 3) return false
  // *שאלה* אינה החלפת נושא — "כמה זה עולה?" באמצע רישום נשאר רישום,
  // וה-LLM עונה על השאלה בלי להפיל את המסלול.
  if (isLikelyQuestion(t)) return false
  return !looksLikeChildName(t)
}

// הודעה קצרה (עד 3 מילים) שמכילה ספרה בודדת אחת → הספרה היא הבחירה מהתפריט.
// "יש לי 2 ילדים" (4 מילים) לא נתפס — בכוונה.
function shortDigitChoice(msg: string): string | null {
  const words = msg.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 3) return null
  const digits = words.map(w => w.replace(/[.!?,]+$/g, '')).filter(w => /^[1-9]$/.test(w))
  return digits.length === 1 ? digits[0] : null
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
  const ownIntents = STEP_OWN_INTENTS[flow] ?? []

  // ── ספרה בתוך הודעה קצרה = בחירה ("נו כבר!!! 2", "אפשרות 2", "2 בבקשה") ──────
  if (CHOICE_STEPS.has(flow) && !isExplicitNumericChoice(userMessage)) {
    const digit = shortDigitChoice(userMessage)
    if (digit) userMessage = digit
  }

  // ── "תפריט" / "בוט" באמצע כל שלב → תפריט הפתיחה ─────────────────────────────
  // בדיקת עשן 17.9: "תפריט" בשלב האזור נקרא כשם אזור ("לא הצלחתי לזהות את האזור").
  if (isMenuWord(normalizeMessage(userMessage)) && !flow.startsWith('admin')) {
    session.currentFlow = undefined
    session.collectedData = {}
    return { text: buildWelcomeMessage(session.parentName), intent: 'שאלה_כללית', isComplete: true }
  }

  // ── בקשת נציג מכובדת בכל שלב, לא רק בתפריטים ─────────────────────────────
  // אתגור 17.9 (S2): "תעבירי אותי לנציגה" בשלב שם-הילד נשמר כשם הילד/ה,
  // ובשלב שעת האיסוף נבלע. עכשיו: בקשה מפורשת לנציג/ה מסלימה מכל שלב —
  // למעט שלבים שהכוונה הזו *שייכת* להם (payment_fail_type = "תחזרו אלי").
  if (!isExplicitNumericChoice(userMessage) && intent === 'בקשת_נציג' && !ownIntents.includes(intent)) {
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

  // ── תפריט שמכבד כוונה ─────────────────────────────────────────────────────
  // לפני התיקון כל טקסט חופשי בתפריט קיבל "לא הבנתי, אנא בחרו".
  if (!isExplicitNumericChoice(userMessage) &&
      SWITCHABLE_INTENTS.has(intent) && !ownIntents.includes(intent) &&
      !DESCRIPTION_STEPS.has(flow) &&
      (CHOICE_STEPS.has(flow) || canSwitchFromFreeText(userMessage))) {
    session.currentFlow = undefined
    const switched = await handleNewIntent(session, userMessage, intent)
    if (switched) return switched
    session.currentFlow = flow   // לא היה למה לעבור — נשארים בשלב
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
      // 23.9: ברכה/תודה/סיום מטופלים מרכזית ב-processMessageCore לפני הכוונות. כאן: תוכן → LLM
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
      return finishLLMTurn(session, faqAnswer, intent, opts)
    }
  }

  const llmResult = await callLLMFallback(session, userMessage)

  // ── ה-LLM זיהה בקשה מפורשת לנציג/ה → הסלמה מלאה (הבוט נכנס ל-handoff) ────
  if (llmResult.userWantsHuman) {
    session.collectedData = {}
    return {
      text: buildEscalationMessage(),
      intent,
      escalate: true,
      isComplete: true,
      createTask: {
        type:        'שאלה כללית',
        description: llmResult.taskDescription || `ביקש/ה לדבר עם נציגה: "${userMessage.slice(0, 80)}"`,
        priority:    'גבוה' as const,
      },
    }
  }

  // ── ה-LLM הסלים לקורלי → פנייה נפתחת; אם היינו באמצע מסלול — המסלול נשמר
  //    (שאלת מחיר באמצע רישום לא אמורה להפיל את הרישום), אחרת השיחה מסתיימת.
  //    ⚠️ יוצא דופן: שלב *אישור*. אם השיחה יצאה ממנו — מסיימים אותו, אחרת
  //    "כן" שיגיע אחר כך היה מבצע ביטול שההורה כבר זנח (אתגור 17.9, S2).
  const escalated = !!llmResult.createTask && !opts.suppressTask
  if (escalated) {
    const keep = opts.keepFlow && !CONFIRM_STEPS.has(opts.keepFlow) ? opts.keepFlow : undefined
    if (!keep) { session.currentFlow = undefined; session.collectedData = {} }
    else session.currentFlow = keep
    const reminder = keep ? FLOW_REMINDERS[keep] : undefined
    return {
      text: reminder ? `${llmResult.text}\n\n_${reminder}_` : llmResult.text,
      intent,
      isComplete: !keep,
      ...(keep ? { nextFlow: keep } : {}),
      // הבוט לא ידע לענות והעביר לקורלי → עדיפות גבוהה (מפעיל התראה + מייל לאדמין)
      createTask: {
        type: 'שאלה כללית',
        description: llmResult.taskDescription || `הבוט העביר לקורלי — שאלה שלא נענתה: "${userMessage.slice(0, 80)}"`,
        priority: 'גבוה' as const,
      },
    }
  }

  // ── שמירת המסלול: רק keepFlow (היינו בתוך מסלול) ──────────────────────────
  // ⚠️ אין יותר suggestFlow: ה-LLM לא מתחיל מסלול ולא "קופץ" לשלב פנימי —
  //    זה הכניס הורים לאמצע מסלולים שלא ביקשו (אתגור 17.9).
  return finishLLMTurn(session, llmResult.text, intent, opts)
}

// בונה את תשובת ה-LLM/FAQ עם שמירת המסלול (nextFlow) ותזכורת חזרה אם צריך
function finishLLMTurn(
  session: BotSession,
  text: string,
  intent: BotIntent,
  opts: { keepFlow?: string; suppressTask?: boolean }
): BotResponse & { intent: BotIntent } {
  const nextFlow = opts.keepFlow

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
