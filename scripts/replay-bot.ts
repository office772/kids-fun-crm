/**
 * replay-bot.ts — הרצה חוזרת של תרחישי בוט אמיתיים, בלי DB ובלי LLM.
 *
 * הרצה:
 *   ANTHROPIC_API_KEY=dummy npx tsx scripts/replay-bot.ts
 *
 * ⚠️ מריצים *בלי* משתני Supabase — כל קריאת DB נכשלת בשקט (try/catch בקוד),
 *    וקריאת ה-LLM מחזירה את הודעת ה-fallback הגנרית. לכן כל הבדיקות כאן
 *    בודקות *מסלול וכוונה* (intent / nextFlow / collectedData) ולא טקסט של LLM.
 *
 * כל מקרה כאן הוא תקלה אמיתית מהלוגים (09/2026) — ספרינט 1 (A1–A6).
 */

import { classifyIntent } from '@/lib/bot/intent-classifier'
import { processMessage } from '@/lib/bot/handler'
import { parsePickupTime, splitNameAndClass, scheduleFaqAnchors, isHolidayQuestion, isBusinessHours } from '@/lib/bot/flows'
import { parseLLMResponse, sanitizeForWhatsApp } from '@/lib/bot/llm-fallback'
import { detectMedia } from '@/lib/bot/media-handler'
import { buildVoicePromptBlock, isVoiceConfigured, EMPTY_VOICE } from '@/lib/bot/bot-voice'
import { getCachedSettings } from '@/lib/bot/settings-db'
import { getDefaultMonthlyFee, DEFAULT_MONTHLY_FEE } from '@/lib/bot/payment-helpers'
import { resolveMonthlyFee } from '@/lib/bot/pricing'
import { priceFromCachedSchools } from '@/lib/bot/schools-db'
import { botText, placeholdersMatch, BOT_MESSAGE_REGISTRY } from '@/lib/bot/bot-messages-db'
import { buildDidNotUnderstand, buildEscalationMessage } from '@/lib/bot/flows'
import type { BotIntent, BotSession } from '@/lib/types'

const PHONE = '+972500000000'   // מספר שלא קיים ב-DB — "הורה לא מזוהה"

function makeSession(currentFlow?: string, collectedData: Record<string, string> = {}): BotSession {
  return {
    sessionId:     't',
    phone:         PHONE,
    parentName:    'אייל בירן',
    messages:      [],
    currentFlow,
    collectedData: { ...collectedData },
  }
}

let passed = 0
let failed = 0

function check(name: string, ok: boolean, detail: string) {
  if (ok) { passed++; console.log(`✅ ${name}`) }
  else    { failed++; console.log(`❌ ${name}\n   ${detail}`) }
}

// ─── עוזרים לזיהוי תגובות "רעות" ─────────────────────────────────────────────
const isWelcomeMenu   = (t: string) => t.includes('*1* - רישום לצהרון') && t.includes('*6* - איסוף מוקדם')
const isNotUnderstood = (t: string) => /לא הבנתי|לא הצלחתי להבין/.test(t)

// ─── 1. סיווג כוונה (A1) ─────────────────────────────────────────────────────
function intentCases() {
  console.log('\n── A1: סיווג כוונה ──')
  const cases: Array<{ msg: string; expect?: BotIntent; notExpect?: BotIntent }> = [
    { msg: 'העברות 17.9 תשלומי ספקים',                       notExpect: 'רישום_צהרון' },
    { msg: 'אייל בירן\nכבר רשמתי לך מקודם',                   notExpect: 'שאלת_לוז' },
    { msg: 'מה זאת אומרת כמה שנים לעידן? מה זו השאלה הזו?',   notExpect: 'בדיקת_תשלום' },
    { msg: 'מה שעות הקייטנה שבוע הבא ?',                      expect:    'שאלת_לוז' },
    // astra חלק ב 10: נטיות "לבטל" (נבטל/תבטלו/מבטלת) — קודם סווגו כ*רישום* בגלל "רישום/הרשמה"
    { msg: 'לא, בואו נבטל את הרישום בבקשה',                   expect:    'ביטול' },
    { msg: 'תבטלו את ההרשמה של הילד שלי בבקשה',              expect:    'ביטול' },
    { msg: 'מבטלת את הצהרון של נועם',                         expect:    'ביטול' },
    { msg: 'אני רוצה להסדיר תשלום',                            expect:    'אפשרויות_תשלום' },
    { msg: 'עופרי עוז מובילה שכר של 60 ש״ח לשעה',             notExpect: 'איסוף_מוקדם' },
    { msg: '1',                                                expect:    'רישום_צהרון' },
    { msg: 'תעביר אותי לנציג אנושי',                           expect:    'בקשת_נציג' },
  ]
  for (const c of cases) {
    const got = classifyIntent(c.msg)
    const label = `"${c.msg.replace(/\n/g, ' ⏎ ')}" → ${got}`
    if (c.expect)    check(label, got === c.expect,    `ציפינו ל-${c.expect}`)
    if (c.notExpect) check(label, got !== c.notExpect, `לא ציפינו ל-${c.notExpect}`)
  }
}

// ─── 2. תרחישי שיחה מלאים ────────────────────────────────────────────────────
async function flowCases() {
  console.log('\n── A2/A3/A4/A5/A6: תרחישי שיחה ──')

  // A6/A5 — "מילאתי את הפרטים, נשמרו?" לא אמור להחזיר את תפריט הפתיחה
  {
    const s = makeSession()
    const r = await processMessage(s, 'הי, מילאתי את הפרטים אבל זה יצא לי באמצע ואני לא יודע אם הפרטים נשמרו, אתה יכול לבדוק?')
    check('שאלת "הפרטים נשמרו?" — לא מחזיר תפריט פתיחה',
      !isWelcomeMenu(r.text), `text=${JSON.stringify(r.text.slice(0, 90))}`)
  }

  // A5 — "היום קר" לא ברכה
  {
    const s = makeSession()
    const r = await processMessage(s, 'היום קר')
    // 23.9: הודעה ראשונה לא מוכרת → ה-LLM עונה לפי ההקשר *ואז* התפריט (לא תפריט לבד)
    check('"היום קר" — לא מזוהה כברכה (ה-LLM עונה קודם, התפריט מצורף אחריו)',
      !r.text.startsWith('היי') && !r.text.startsWith('שלום!') && !/^\*?1\* - רישום/.test(r.text),
      `text=${JSON.stringify(r.text.slice(0, 90))}`)
  }

  // A3 — register_area: טקסט חופשי, פעם ראשונה = רשימת אזורים, שנייה = LLM עם שמירת מסלול
  {
    const s = makeSession('register_area')
    const r1 = await processMessage(s, 'אני נמצא בגבעתיים')
    check('register_area (1) — לא "לא הבנתי"',
      !isNotUnderstood(r1.text) && r1.text.includes('מפעילים צהרונים'),
      `text=${JSON.stringify(r1.text.slice(0, 120))}`)

    s.currentFlow = r1.nextFlow ?? s.currentFlow
    const r2 = await processMessage(s, 'אני נמצא בגבעתיים')
    check('register_area (2) — LLM והמסלול נשמר',
      r2.nextFlow === 'register_area',
      `nextFlow=${r2.nextFlow} text=${JSON.stringify(r2.text.slice(0, 90))}`)
  }

  // A3 — register_area: שם בית ספר
  {
    const s = makeSession('register_area')
    const r = await processMessage(s, 'גלי עתלית')
    check('register_area — "גלי עתלית" → carmel',
      r.nextFlow === 'register_child_name' && s.collectedData.area_code === 'carmel',
      `nextFlow=${r.nextFlow} area_code=${s.collectedData.area_code}`)
  }

  // A3 — תפריט מכבד בקשת נציג
  {
    const s = makeSession('payment_status_menu')
    const r = await processMessage(s, 'תעביר אותי לנציג אנושי')
    check('payment_status_menu — בקשת נציג מסלימה',
      !!r.createTask && !isNotUnderstood(r.text) && /קורלי/.test(r.text),
      `createTask=${JSON.stringify(r.createTask)} text=${JSON.stringify(r.text.slice(0, 90))}`)
  }

  // A3 — register_existing_parent: טקסט חופשי = אפשרות 1
  {
    const s = makeSession('register_existing_parent')
    const r = await processMessage(s, 'אמרתי, אני רוצה לרשום ילד לצהרון')
    check('register_existing_parent — טקסט חופשי → אפשרות 1 (אזור)',
      r.nextFlow === 'register_area' && /לאיזה אזור/.test(r.text),
      `nextFlow=${r.nextFlow} text=${JSON.stringify(r.text.slice(0, 90))}`)
  }

  // A4 — אישור ביטול: שאלה אינה "לא"
  {
    const s = makeSession('cancel_confirm_after15', { child_name: 'נועם בירן' })
    const r = await processMessage(s, 'לא הבנתי עד מתי אני משלם בפועל , עד איזה תאריך?')
    check('cancel_confirm_after15 — שאלה לא נקראת כ"לא"',
      !r.text.includes('הביטול *לא בוצע*') && r.nextFlow === 'cancel_confirm_after15',
      `nextFlow=${r.nextFlow} text=${JSON.stringify(r.text.slice(0, 120))}`)
  }
  {
    const s = makeSession('cancel_confirm_after15', { child_name: 'נועם בירן' })
    const r = await processMessage(s, 'לא')
    check('cancel_confirm_after15 — "לא" נקי = לא מבטלים',
      r.text.includes('הביטול *לא בוצע*'), `text=${JSON.stringify(r.text.slice(0, 90))}`)
  }
  {
    const s = makeSession('cancel_confirm_after15', { child_name: 'נועם בירן' })
    const r = await processMessage(s, 'כן')
    check('cancel_confirm_after15 — "כן" נקי = מסלול הביטול',
      !isNotUnderstood(r.text) && /ביטול/.test(r.text) && r.isComplete === true,
      `text=${JSON.stringify(r.text.slice(0, 120))}`)
  }

  // A2 — שאלה באמצע מסלול לא מפילה את המסלול
  {
    const s = makeSession('register_child_name', { area_code: 'sharon' })
    const r = await processMessage(s, 'כמה זה עולה?')
    check('register_child_name — שאלה באמצע: המסלול נשמר',
      r.nextFlow === 'register_child_name',
      `nextFlow=${r.nextFlow} isComplete=${r.isComplete} text=${JSON.stringify(r.text.slice(0, 90))}`)
  }
}


// ─── 3. שומר תסכול + handoff (בקשת עינת 17.9: "לא יותר מ-2 הודעות מתסכלות") ─────
async function guardCases() {
  console.log('\n── שומר תסכול / handoff ──')
  const bot  = (text: string) => ({ role: 'bot'  as const, text, timestamp: new Date() })
  const user = (text: string) => ({ role: 'user' as const, text, timestamp: new Date() })

  // שתי "לא הבנתי" ברצף → העברה לקורלי + handoff
  {
    const s = makeSession('payment_status_menu')
    s.messages = [user('אני נמצא בגבעתיים'), bot('לא הבנתי 😊 אנא בחרו:\n*1* — סטטוס')]
    const r = await processMessage(s, 'מה זה צריך להיות')
    check('guard — non-answer אחרי non-answer → העברה לקורלי',
      /קורלי/.test(r.text) && r.nextFlow === 'handoff_paused' && !!r.createTask,
      `nextFlow=${r.nextFlow} task=${!!r.createTask} text=${JSON.stringify(r.text.slice(0, 80))}`)
  }
  // הורה כועס פעמיים → העברה
  {
    const s = makeSession()
    s.messages = [user('מה אתה מטומטם?'), bot('סליחה על הבלבול 😅 במה אפשר לעזור?')]
    const r = await processMessage(s, 'אתה רציני???? אני מאבד סבלנות')
    check('guard — שני סימני עצבים → העברה לקורלי',
      /קורלי/.test(r.text) && r.nextFlow === 'handoff_paused',
      `nextFlow=${r.nextFlow} text=${JSON.stringify(r.text.slice(0, 80))}`)
  }
  // 23.9 (עינת §9): אחרי handoff — ניסיון LLM *אחד* עם תזכורת שקורלי תחזור, אחריו שתיקה;
  //   בקשה מפורשת לנציגה → "הפנייה אצל קורלי" (בלי LLM)
  {
    const s = makeSession('handoff_paused')
    const r1 = await processMessage(s, 'ומה עם השעות של הקייטנה')
    check('handoff — שאלה אחרי העברה = ניסיון אחד + "קורלי תחזור"', r1.text !== '' && /קורלי תחזור/.test(r1.text) && r1.nextFlow === 'handoff_paused',
      `text=${JSON.stringify(r1.text.slice(0, 80))} nextFlow=${r1.nextFlow}`)
    const r2 = await processMessage(s, 'ועוד שאלה, מה עם החגים')
    check('handoff — שאלה שנייה אחרי העברה = שתיקה', r2.text === '' && r2.nextFlow === 'handoff_paused',
      `text=${JSON.stringify(r2.text)} nextFlow=${r2.nextFlow}`)
    const r3 = await processMessage(s, 'אני רוצה לדבר עם נציגה')
    check('handoff — בקשת נציגה אחרי העברה = "הפנייה אצל קורלי"', /אצל קורלי/.test(r3.text) && r3.nextFlow === 'handoff_paused',
      `text=${JSON.stringify(r3.text.slice(0, 80))}`)
    const s2 = makeSession('handoff_paused')
    const r4 = await processMessage(s2, '?')
    check('handoff — ג\'יבריש אחרי העברה = שתיקה', r4.text === '', `text=${JSON.stringify(r4.text)}`)
  }
  // "1" מוציא מה-handoff
  {
    const s = makeSession('handoff_paused')
    const r = await processMessage(s, '1')
    check('handoff — "1" חוזר לבוט', r.text.length > 0 && r.nextFlow !== 'handoff_paused',
      `text=${JSON.stringify(r.text.slice(0, 60))} nextFlow=${r.nextFlow}`)
  }
  // בלי false positive: שיחה תקינה
  {
    const s = makeSession('register_area')
    s.messages = [user('1'), bot('לאיזה אזור מבקשים רישום לצהרון?')]
    const r = await processMessage(s, '2')
    check('guard — שיחה תקינה לא מוסלמת', !/קורלי/.test(r.text) && r.nextFlow === 'register_child_name',
      `nextFlow=${r.nextFlow} text=${JSON.stringify(r.text.slice(0, 60))}`)
  }
  // עצבים פעם אחת + תשובה טובה → לא מוסלם
  {
    const s = makeSession('register_area')
    s.messages = [user('1'), bot('לאיזה אזור מבקשים רישום לצהרון?')]
    const r = await processMessage(s, 'נו כבר!!! 2')
    check('guard — עצבים פעם אחת עם תשובה תקינה → ממשיכים', r.nextFlow === 'register_child_name',
      `nextFlow=${r.nextFlow} text=${JSON.stringify(r.text.slice(0, 60))}`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ספרינט 1.5 — תיקונים מתוך שלושת סבבי האתגור (17.9)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── S1: חשיפת מידע לפי שם ילד/ה ─────────────────────────────────────────────
async function privacyCases() {
  console.log('\n── S1: פרטיות — שם ילד/ה אינו זיהוי ──')
  {
    const s = makeSession('payment_status_child_name')
    const r = await processMessage(s, 'נועם בירן')
    check('payment_status_child_name — מספר לא מזוהה לא מקבל סטטוס תשלום',
      !r.text.includes('מצאתי') && /קורלי/.test(r.text) && !!r.createTask && r.isComplete === true,
      `text=${JSON.stringify(r.text.slice(0, 100))} task=${JSON.stringify(r.createTask)} isComplete=${r.isComplete}`)
  }
}

// ─── S2 #2: בקשת נציג/ה בכל שלב ──────────────────────────────────────────────
async function humanRequestCases() {
  console.log('\n── S2: בקשת נציג/ה מכל שלב ──')
  {
    const s = makeSession('register_child_name', { area_code: 'sharon' })
    const r = await processMessage(s, 'תעבירי אותי לנציגה')
    check('register_child_name — "תעבירי אותי לנציגה" מסלימה',
      r.escalate === true && r.nextFlow === 'handoff_paused' && !!r.createTask,
      `escalate=${r.escalate} nextFlow=${r.nextFlow} text=${JSON.stringify(r.text.slice(0, 70))}`)

    const r2 = await processMessage(s, '1')
    check('אחרי handoff — "1" מחזיר את ההורה לבוט',
      r2.nextFlow !== 'handoff_paused' && r2.text.length > 0,
      `nextFlow=${r2.nextFlow} text=${JSON.stringify(r2.text.slice(0, 60))}`)
  }
  {
    const s = makeSession('pickup_time', { child_name: 'נועם בירן' })
    const r = await processMessage(s, 'אני רוצה נציגה עכשיו')
    check('pickup_time — "אני רוצה נציגה עכשיו" מסלימה',
      r.escalate === true && r.nextFlow === 'handoff_paused',
      `escalate=${r.escalate} nextFlow=${r.nextFlow}`)
  }
  {
    const s = makeSession('handoff_paused')
    const r = await processMessage(s, 'תפריט')
    check('handoff — "תפריט" מחזיר את תפריט הפתיחה',
      isWelcomeMenu(r.text), `text=${JSON.stringify(r.text.slice(0, 70))}`)
  }
}

// ─── S2 #3: בטיחות שלב האישור בביטול ─────────────────────────────────────────
async function cancelSafetyCases() {
  console.log('\n── S2: אישור ביטול — הילד/ה הנכון/ה ──')
  {
    const s = makeSession('cancel_confirm_after15', { child_name: 'אורי כספי' })
    const r = await processMessage(s, 'לא, זה לא הילד הזה')
    check('cancel_confirm — "לא זה לא הילד הזה" חוזר לשאלת השם',
      r.nextFlow === 'cancel_child' && s.collectedData.child_name === undefined,
      `nextFlow=${r.nextFlow} child_name=${s.collectedData.child_name}`)

    s.currentFlow = r.nextFlow ?? s.currentFlow
    const r2 = await processMessage(s, 'כן')
    check('cancel_child אחרי תיקון — "כן" לא מבצע ביטול',
      !/הביטול בוצע|בקשת הביטול נקלטה/.test(r2.text),
      `text=${JSON.stringify(r2.text.slice(0, 90))}`)
  }
  {
    const s = makeSession('cancel_confirm_after15', { child_name: 'אורי כספי' })
    const r = await processMessage(s, 'דניאל אבני')
    check('cancel_confirm — שם חדש מחליף את שם הילד/ה ושואל שוב',
      s.collectedData.child_name === 'דניאל אבני' && /דניאל אבני/.test(r.text) && /לאשר/.test(r.text),
      `child_name=${s.collectedData.child_name} text=${JSON.stringify(r.text.slice(0, 90))}`)
  }
  {
    // יציאה מצומת האישור (שומר התסכול) מנקה את הנתונים — "כן" מאוחר לא יבטל
    const s = makeSession('cancel_confirm_after15', { child_name: 'אורי כספי' })
    s.messages = [
      { role: 'user', text: 'מה?', timestamp: new Date() },
      { role: 'bot',  text: 'לא הצלחתי להבין, אפשר לנסח שוב?', timestamp: new Date() },
    ]
    const r = await processMessage(s, 'נמאס לי כבר!!!')
    check('cancel_confirm — יציאה לקורלי מנקה את צומת האישור',
      r.nextFlow === 'handoff_paused' && Object.keys(s.collectedData).length === 0,
      `nextFlow=${r.nextFlow} data=${JSON.stringify(s.collectedData)}`)
  }

  // ─── astra #2: אישור *מסויג* אינו מבצע ביטול (S1 — כספי) ─────────────────────
  console.log('\n── S1: אישור ביטול חד-משמעי (astra) ──')
  const qualifiedYes: Array<[string, string]> = [
    ['cancel_confirm_after15', 'כן אבל רגע'],
    ['cancel_confirm_after15', 'כן, חכה'],
    ['cancel_confirm_after15', 'כן רק שנייה'],
    ['cancel_confirm_after15', 'כן?'],
    ['cancel_confirm_after15', 'אולי כן'],
    ['cancel_confirm_before15', 'כן אבל רגע'],
    ['cancel_confirm_before15', 'בסדר'],
  ]
  for (const [flow, msg] of qualifiedYes) {
    const s = makeSession(flow, { child_name: 'נועם בירן' })
    const r = await processMessage(s, msg)
    check(`${flow} — "${msg}" לא מבצע ביטול`,
      !/הביטול בוצע|בקשת הביטול נקלטה/.test(r.text) && r.isComplete !== true,
      `isComplete=${r.isComplete} text=${JSON.stringify(r.text.slice(0, 90))}`)
  }
  // אישור נקי כן מבצע — regression guard (לא לשבור את הזרימה התקינה)
  {
    const s = makeSession('cancel_confirm_after15', { child_name: 'נועם בירן' })
    const r = await processMessage(s, 'כן')
    check('cancel_confirm_after15 — "כן" נקי כן מבצע ביטול',
      r.isComplete === true && /ביטול/.test(r.text),
      `isComplete=${r.isComplete} text=${JSON.stringify(r.text.slice(0, 90))}`)
  }
  // מסלול המתנה — "לא אבל רגע" לא מוותר על המקום; "כן אבל" לא לוקח אותו
  {
    const s = makeSession('waiting_spot_confirm', { child_name: 'נועם בירן', area_label: 'חוף הכרמל' })
    const r = await processMessage(s, 'לא אבל רגע')
    check('waiting_spot_confirm — "לא אבל רגע" לא מוותר על המקום',
      r.isComplete !== true && !/דחה הצעת מקום|waitlist_declined/.test(r.text),
      `isComplete=${r.isComplete} text=${JSON.stringify(r.text.slice(0, 90))}`)
  }

  // ─── astra R2: נרמול אישור לא מוחק תוכן משמעותי (מספר/תאריך/סימן שאלה לא-לטיני) ──
  console.log('\n── R2: אישור עם תוכן נוסף אינו "כן" ──')
  for (const msg of ['כן 15/10', 'כן؟', 'כן 20 לחודש', 'כן אבל 15']) {
    const s = makeSession('cancel_confirm_after15', { child_name: 'נועם בירן' })
    const r = await processMessage(s, msg)
    check(`R2 — "${msg}" לא מבצע ביטול`,
      !/הביטול בוצע|בקשת הביטול נקלטה/.test(r.text) && r.isComplete !== true,
      `isComplete=${r.isComplete} text=${JSON.stringify(r.text.slice(0, 80))}`)
  }
  // R2: הסתייגות (לא שאלה) → שאלת אישור *מחדש* דטרמיניסטית (לא ריק/LLM), המסלול נשמר
  {
    const s = makeSession('cancel_confirm_after15', { child_name: 'נועם בירן' })
    const r = await processMessage(s, 'כן אבל רגע')
    check('R2 — הסתייגות → אישור חוזר דטרמיניסטי',
      r.nextFlow === 'cancel_confirm_after15' && r.text.length > 0 && /לאשר|ביטול/.test(r.text) && r.isComplete !== true,
      `nextFlow=${r.nextFlow} text=${JSON.stringify(r.text.slice(0, 80))}`)
  }
  // R2: אישור נקי עם פיסוק *בטוח* עדיין עובד
  {
    const s = makeSession('cancel_confirm_after15', { child_name: 'נועם בירן' })
    const r = await processMessage(s, 'כן, בבקשה')
    check('R2 — "כן, בבקשה" עדיין מבצע ביטול', r.isComplete === true && /ביטול/.test(r.text),
      `isComplete=${r.isComplete} text=${JSON.stringify(r.text.slice(0, 80))}`)
  }
}

// ─── S2 #4: החלפת נושא מפורשת בשלב טקסט חופשי ────────────────────────────────
async function switchCases() {
  console.log('\n── S2: החלפת נושא בשלב טקסט חופשי ──')
  {
    const s = makeSession('cancel_child')
    const r = await processMessage(s, 'בעצם אני רוצה לרשום עוד ילד')
    check('cancel_child — "בעצם אני רוצה לרשום עוד ילד" מתחיל רישום',
      (r.nextFlow === 'register_area' || r.nextFlow === 'register_existing_parent') &&
      s.collectedData.child_name === undefined,
      `nextFlow=${r.nextFlow} child_name=${s.collectedData.child_name}`)
  }
  {
    const s = makeSession('cancel_child')
    const r = await processMessage(s, 'דניאל אבני')
    check('cancel_child — "דניאל אבני" נשמר כשם הילד/ה',
      s.collectedData.child_name === 'דניאל אבני' && /cancel_confirm/.test(r.nextFlow ?? ''),
      `nextFlow=${r.nextFlow} child_name=${s.collectedData.child_name}`)
  }
}

// ─── S2 #5: סיווג כוונה — תיקוני האתגור ──────────────────────────────────────
function classifierCases() {
  console.log('\n── S2: סיווג כוונה ──')
  const longSalad =
    'היי רציתי לשאול אתכם כמה שאלות חשובות לגבי הילד שלי שמתחיל אצלכם בשנה הבאה ' +
    'ואני לא בטוחה מה בדיוק צריך להביא איתו ליום הראשון וגם מה קורה אם הוא חולה ' +
    'ואם אפשר לאסוף אותו מוקדם יותר בימי שלישי ואיך משלמים ומתי מתחילים בכלל ' +
    'ואם יש הנחה לאחים ומה לגבי החגים הקרובים תודה רבה לכם על הכל באמת'
  const cases: Array<{ msg: string; expect?: BotIntent; notExpect?: BotIntent; label?: string }> = [
    { msg: 'גן חובה',                    notExpect: 'בדיקת_תשלום' },
    { msg: 'אני עובר לצהרון אחר',        expect:    'ביטול' },
    { msg: 'יש צהרון בערב ראש השנה?',    expect:    'שאלת_לוז' },
    { msg: 'רִישׁוּם לְצַהֲרוֹן',            expect:    'רישום_צהרון' },
    { msg: '١',                           expect:    'רישום_צהרון' },
    { msg: 'רישום ביטול תשלום',          expect:    'לא_ידוע' },
    { msg: longSalad,                     expect:    'לא_ידוע', label: 'הודעה ארוכה ומעורבת (60+ מילים)' },
    { msg: 'רוצה לשנות תאריך חיוב',      expect:    'כשל_תשלום' },
  ]
  for (const c of cases) {
    const got = classifyIntent(c.msg)
    const label = `"${(c.label ?? c.msg).slice(0, 40)}" → ${got}`
    if (c.expect)    check(label, got === c.expect,    `ציפינו ל-${c.expect}`)
    if (c.notExpect) check(label, got !== c.notExpect, `לא ציפינו ל-${c.notExpect}`)
  }
}

// ─── S2 #6/#12/#13: מסלולים — חגים, תיקון אזור, איסוף מוקדם ──────────────────
async function flowDetailCases() {
  console.log('\n── S2: חגים / תיקון אזור / איסוף מוקדם ──')

  check('שאלת חג מזוהה ("מה עם סוכות")',
    isHolidayQuestion('מה עם סוכות') && scheduleFaqAnchors('מה עם סוכות').includes('חג'),
    `anchors=${scheduleFaqAnchors('מה עם סוכות').join(',')}`)
  check('שאלת שעות רגילה לא נחשבת חג',
    !isHolidayQuestion('מה שעות הפעילות?') && scheduleFaqAnchors('מה שעות הפעילות?')[0] === 'שעות',
    `anchors=${scheduleFaqAnchors('מה שעות הפעילות?').join(',')}`)

  {
    const s = makeSession('register_child_name', { area_code: 'carmel' })
    const r = await processMessage(s, 'רגע טעיתי באזור, זה השרון')
    check('register_child_name — תיקון אזור באמצע הרישום',
      s.collectedData.area_code === 'sharon' && r.nextFlow === 'register_child_name',
      `area_code=${s.collectedData.area_code} nextFlow=${r.nextFlow}`)
  }
  {
    const s = makeSession('register_area')
    const r = await processMessage(s, 'אתם יכולים להסביר לי איך זה עובד?')
    check('register_area — שאלה חורגת הולכת ל-LLM והמסלול נשמר',
      r.nextFlow === 'register_area' && !/מפעילים צהרונים/.test(r.text),
      `nextFlow=${r.nextFlow} text=${JSON.stringify(r.text.slice(0, 70))}`)
  }
  {
    const split = splitNameAndClass('נועה כהן כיתה ב')
    check('שם + כיתה בהודעה אחת → פיצול',
      split?.name === 'נועה כהן' && split?.className === 'כיתה ב',
      `split=${JSON.stringify(split)}`)
    const s = makeSession('register_child_name')
    await processMessage(s, 'דני לוי גן חובה')
    check('register_child_name — "דני לוי גן חובה" נשמר כשם + כיתה',
      s.collectedData.child_name === 'דני לוי',
      `child_name=${s.collectedData.child_name}`)
  }
  {
    check('parsePickupTime — "3 וחצי" → 15:30', parsePickupTime('3 וחצי') === '15:30', `got=${parsePickupTime('3 וחצי')}`)
    check('parsePickupTime — "בשלוש" → 15:00',  parsePickupTime('בשלוש')  === '15:00', `got=${parsePickupTime('בשלוש')}`)
    check('parsePickupTime — "15:30" → 15:30',  parsePickupTime('15:30')  === '15:30', `got=${parsePickupTime('15:30')}`)
    check('parsePickupTime — "אמא של נועם" → null', parsePickupTime('אמא של נועם') === null,
      `got=${parsePickupTime('אמא של נועם')}`)
  }
  {
    const s = makeSession('pickup_time', { child_name: 'נועם בירן' })
    const r = await processMessage(s, 'אמא של נועם')
    check('pickup_time — טקסט שאינו שעה לא נשמר כשעה',
      s.collectedData.pickup_time === undefined && r.nextFlow === 'pickup_time' && /שעה/.test(r.text),
      `pickup_time=${s.collectedData.pickup_time} nextFlow=${r.nextFlow} text=${JSON.stringify(r.text.slice(0, 60))}`)

    const r2 = await processMessage(s, '3 וחצי')
    check('pickup_time — "3 וחצי" מתקבל כ-15:30',
      s.collectedData.pickup_time === '15:30' && r2.nextFlow === 'pickup_collector',
      `pickup_time=${s.collectedData.pickup_time} nextFlow=${r2.nextFlow}`)
  }
}

// ─── S2 #8/#9/#14/#15: בטיחות, תסכול, מדיה, תודה ─────────────────────────────
async function miscCases() {
  console.log('\n── S2: בטיחות / תסכול / מדיה / תודה ──')
  {
    const s = makeSession()
    const r = await processMessage(s, 'הילד חזר עם חבורה בראש')
    check('בטיחות — "חבורה בראש" פותח פנייה דחופה',
      r.createTask?.priority === 'דחוף' && r.nextFlow !== 'handoff_paused',
      `task=${JSON.stringify(r.createTask)} nextFlow=${r.nextFlow}`)
  }
  {
    const s = makeSession('register_area')
    const r = await processMessage(s, 'מישהו מציק לילד שלי בצהרון')
    check('בטיחות — גם באמצע מסלול מסלים מיד',
      r.createTask?.priority === 'דחוף', `task=${JSON.stringify(r.createTask)}`)
  }
  {
    const s = makeSession()
    s.messages = [
      { role: 'user', text: 'אני צריך משהו',            timestamp: new Date() },
      { role: 'bot',  text: 'רק שאדייק — התכוונת לרישום?', timestamp: new Date() },
    ]
    const r = await processMessage(s, 'לא יודע')
    check('תסכול — שתי בקשות הבהרה ברצף → העברה לקורלי',
      r.nextFlow === 'handoff_paused' && /קורלי/.test(r.text),
      `nextFlow=${r.nextFlow} text=${JSON.stringify(r.text.slice(0, 60))}`)
  }
  {
    const s = makeSession()
    s.messages = [
      { role: 'user', text: 'בלה בלה', timestamp: new Date() },
      { role: 'bot',  text: 'לא הבנתי 😊 אפשר לפרט?', timestamp: new Date() },
    ]
    const r = await processMessage(s, 'נו כבר אתה לא מבין!!!')
    check('תסכול — "בלה בלה" ואז כעס → העברה לקורלי',
      r.nextFlow === 'handoff_paused', `nextFlow=${r.nextFlow}`)
  }
  {
    const s = makeSession()
    const r = await processMessage(s, 'בא לי למות')
    check('מצוקה — "בא לי למות" → העברה לקורלי (דחוף), לא תשובת LLM',
      r.nextFlow === 'handoff_paused' && r.createTask?.priority === 'דחוף',
      `nextFlow=${r.nextFlow} task=${r.createTask?.priority}`)
  }
  {
    const s = makeSession('register_area')
    const r = await processMessage(s, 'תפריט')
    check('"תפריט" באמצע שלב אזור → תפריט הפתיחה, המסלול נסגר',
      isWelcomeMenu(r.text) && !r.nextFlow, `nextFlow=${r.nextFlow} text=${r.text.slice(0, 40)}`)
  }
  {
    const s = makeSession('cancel_child')
    const r = await processMessage(s, 'תפריט')
    check('"תפריט" בשלב שם ילד בביטול → תפריט הפתיחה (לא נשמר כשם)',
      isWelcomeMenu(r.text) && !r.nextFlow, `nextFlow=${r.nextFlow} text=${r.text.slice(0, 40)}`)
  }
  {
    const s = makeSession('camp_problem_desc')
    const r = await processMessage(s, 'האתר לא נותן לי לשלם')
    check('camp_problem_desc — תיאור בעיה עם "לשלם" לא קופץ לתפריט תשלומים',
      !/\*1\* - סטטוס התשלום/.test(r.text) && r.intent !== 'בדיקת_תשלום' || r.createTask != null,
      `text=${r.text.slice(0, 60)} intent=${r.intent}`)
  }
  {
    check('מדיה — קישור לחנות אינו קובץ', detectMedia('https://kidsandfun.co.il/shop/') === null,
      `got=${JSON.stringify(detectMedia('https://kidsandfun.co.il/shop/'))}`)
    check('מדיה — קובץ uChat כן מזוהה',
      detectMedia('https://uchat.com.au/media/whatsapp/abc123')?.kind === 'other',
      `got=${JSON.stringify(detectMedia('https://uchat.com.au/media/whatsapp/abc123'))}`)
    check('מדיה — PDF מזוהה', detectMedia('https://x.co/form.pdf')?.kind === 'pdf',
      `got=${JSON.stringify(detectMedia('https://x.co/form.pdf'))}`)
  }
  {
    const s = makeSession()
    const r = await processMessage(s, 'תודה רבה')
    check('"תודה רבה" — תשובה קצרה, לא תפריט מלא',
      !isWelcomeMenu(r.text) && r.text.length < 80,
      `text=${JSON.stringify(r.text.slice(0, 70))}`)
  }
}

// ─── S2 #7: פענוח תשובת ה-LLM ────────────────────────────────────────────────
function llmParsingCases() {
  console.log('\n── S2: פענוח תשובת LLM ──')
  const clean = (t?: string) => !!t && !t.includes('```') && !t.includes('"text"') && !t.trim().startsWith('{')

  {
    const r = parseLLMResponse('```json\n{"text": "היי! **שמחה** לעזור", "createTask": false}\n```')
    check('LLM — JSON בתוך גדרות קוד',
      r?.text === 'היי! *שמחה* לעזור' && clean(r?.text), `got=${JSON.stringify(r)}`)
  }
  {
    const r = parseLLMResponse('{"text": "אני בודקת עבורך ומעדכנת בהקדם', )
    check('LLM — JSON חתוך באמצע (max_tokens)',
      !!r && r.text.startsWith('אני בודקת') && clean(r.text), `got=${JSON.stringify(r)}`)
  }
  {
    const r = parseLLMResponse('שלום! אשמח לעזור לך עם כל שאלה על הצהרון 😊')
    check('LLM — טקסט חופשי נקי עובר כמו שהוא',
      !!r?.text.startsWith('שלום!') && clean(r?.text), `got=${JSON.stringify(r)}`)
  }
  {
    const r = parseLLMResponse("{'text': 'מעבירה את זה לקורלי 💛', 'createTask': True}")
    check('LLM — dict בסגנון Python',
      r?.text === 'מעבירה את זה לקורלי 💛' && r?.createTask === true, `got=${JSON.stringify(r)}`)
  }
  {
    const r = parseLLMResponse('{"foo": 1}')
    check('LLM — JSON בלי שדה text → נפילה גנרית', r === null, `got=${JSON.stringify(r)}`)
  }
  {
    const r = parseLLMResponse('{"text": "בקשה לנציגה", "createTask": true, "userWantsHuman": true}')
    check('LLM — userWantsHuman נקרא', r?.userWantsHuman === true, `got=${JSON.stringify(r)}`)
  }
  check('LLM — **מודגש** הופך ל-*מודגש*',
    sanitizeForWhatsApp('זה **חשוב** מאוד') === 'זה *חשוב* מאוד',
    `got=${sanitizeForWhatsApp('זה **חשוב** מאוד')}`)
}

// ─── קול הבוט (פאזה 1) — ריק לא משנה פרומפט, מוגדר כן ─────────────────────────
function voiceCases() {
  console.log('\n── קול הבוט ──')

  // קריטי: קול לא מוגדר → בלוק ריק → הפרומפט זהה *בדיוק* להיום.
  check('קול הבוט — ריק אינו מוגדר', isVoiceConfigured(EMPTY_VOICE) === false, 'צריך false')
  check('קול הבוט — ריק → בלוק ריק (פרומפט לא משתנה)',
    buildVoicePromptBlock(EMPTY_VOICE) === '',
    `got="${buildVoicePromptBlock(EMPTY_VOICE)}"`)

  // קול מוגדר → הבלוק נכנס ומכיל את מה שהוגדר.
  const configured = {
    ...EMPTY_VOICE,
    personaName: 'ג׳וני',
    gender: 'female' as const,
    forbiddenWords: 'בוט',
  }
  const block = buildVoicePromptBlock(configured)
  check('קול הבוט — מוגדר → בלוק לא ריק', block.length > 0, `got len=${block.length}`)
  check('קול הבוט — שם הפרסונה מופיע בפרומפט', block.includes('ג׳וני'), block.slice(0, 120))
  check('קול הבוט — מגדר נקבה מופיע בפרומפט', /נקבה/.test(block), block.slice(0, 200))
  check('קול הבוט — מילה אסורה מופיעה בפרומפט', block.includes('בוט'), block.slice(0, 200))
  check('קול הבוט — כללי הבטיחות נשמרים בבלוק',
    block.includes('לא גובר על כללי הבטיחות'), 'צריך משפט שמירת בטיחות')
}

// ─── הגדרות מ-DB (פאזה 2) — בלי cache מוזרק, נשמר ה-fallback הקשיח ────────────
function settingsFallbackCases() {
  console.log('\n── הגדרות מ-DB (fallback) ──')

  // ב-replay אין DB ולא הוזרק cache → מפה ריקה (הקוראים נופלים לקשיח).
  check('settings — cache ריק כשלא הוזרק',
    Object.keys(getCachedSettings()).length === 0, 'צריך {}')

  // מחיר ברירת מחדל ללא הגדרה → הקשיח 799.
  check('מחיר ברירת מחדל — fallback 799 בלי הגדרה',
    getDefaultMonthlyFee() === DEFAULT_MONTHLY_FEE && DEFAULT_MONTHLY_FEE === 799,
    `got=${getDefaultMonthlyFee()}`)

  // isBusinessHours רץ בלי לזרוק ומחזיר boolean (הלוגיקה עצמה תלוית-שעה).
  const bh = isBusinessHours()
  check('שעות פעילות — isBusinessHours מחזיר boolean בלי cache',
    typeof bh === 'boolean', `got=${typeof bh}`)
}

// ─── תמחור מסגרות (פאזה 3) — בלי cache, נשמר התמחור הקשיח ─────────────────────
function pricingFallbackCases() {
  console.log('\n── תמחור מסגרות (fallback) ──')

  // בלי cache (replay) → אין מחיר DB → resolveMonthlyFee נופל למודל הקשיח.
  check('מחיר מסגרת — DB ריק כשלא הוזרק', priceFromCachedSchools('גלי עתלית') === null, 'צריך null')

  check('תמחור קשיח — גלי עתלית = 1150',
    resolveMonthlyFee({ school: 'גלי עתלית' }) === 1150, `got=${resolveMonthlyFee({ school: 'גלי עתלית' })}`)
  check('תמחור קשיח — מתן כיתה ג = 1015',
    resolveMonthlyFee({ school: 'בי"ס מתן', class_name: "כיתה ג'" }) === 1015,
    `got=${resolveMonthlyFee({ school: 'בי"ס מתן', class_name: "כיתה ג'" })}`)
  check('תמחור קשיח — חצב/אלמוג = 1470',
    resolveMonthlyFee({ school: 'גן חצב' }) === 1470, `got=${resolveMonthlyFee({ school: 'גן חצב' })}`)
  check('תמחור קשיח — מסגרת לא מזוהה = null',
    resolveMonthlyFee({ school: 'גן שלא קיים בכלל' }) === null,
    `got=${resolveMonthlyFee({ school: 'גן שלא קיים בכלל' })}`)
}

// ─── טקסט הודעות (פאזה 4) — בלי cache, ברירת המחדל; משתנים נעולים ─────────────
function botMessagesCases() {
  console.log('\n── טקסט הודעות (fallback + משתנים) ──')

  // בלי cache → botText מחזיר את ברירת המחדל מהרג'יסטרי (זהה לטקסט הקשיח הישן).
  check('botText — תפריט = ברירת המחדל בלי cache',
    botText('menu') === BOT_MESSAGE_REGISTRY.menu.default, 'צריך את ברירת המחדל')
  check('buildDidNotUnderstand — עדיין מכיל "לא הצלחתי להבין" + התפריט',
    /לא הצלחתי להבין/.test(buildDidNotUnderstand()) && buildDidNotUnderstand().includes('*1* - רישום לצהרון'),
    buildDidNotUnderstand().slice(0, 40))
  check('buildEscalationMessage — מחזיר טקסט הסלמה (לפי שעה)',
    /קורלי/.test(buildEscalationMessage()), buildEscalationMessage().slice(0, 40))

  // הזרקת משתנים: {אזור} מוחלף, ואין {…} שנשאר.
  const ac = botText('area_confirmed', { 'אזור': 'חוף הכרמל' })
  check('botText — {אזור} הוזרק', ac.includes('חוף הכרמל') && !ac.includes('{אזור}'), ac.slice(0, 40))

  // נעילת משתנים: ברירת המחדל תואמת; מחיקה/הוספה של משתנה נדחית.
  check('משתנים — ברירת המחדל של area_confirmed תקינה',
    placeholdersMatch(BOT_MESSAGE_REGISTRY.area_confirmed.default, ['אזור']) === true, 'צריך true')
  check('משתנים — מחיקת {אזור} נדחית',
    placeholdersMatch('עדכנתי את האזור ✅', ['אזור']) === false, 'צריך false')
  check('משתנים — הוספת {חדש} נדחית',
    placeholdersMatch('שלום {אזור} {חדש}', ['אזור']) === false, 'צריך false')
  check('משתנים — הודעה בלי משתנים לא מקבלת {…}',
    placeholdersMatch('טקסט עם {משתנה}', []) === false, 'צריך false')

  // ⚠️ עקביות כל הרג'יסטרי: לכל הודעה, ה-{משתנים} בברירת המחדל = בדיוק vars המוצהר.
  // תופס טעות העתקה שבה default מכיל {משתנה} שלא הוצהר (או להפך) — שהיתה גורמת
  // ל-botText ליפול ל-fallback או להשאיר {…} לא-מוזרק בהודעה להורה.
  let badKeys: string[] = []
  for (const [key, def] of Object.entries(BOT_MESSAGE_REGISTRY)) {
    if (!placeholdersMatch(def.default, def.vars)) badKeys.push(key)
  }
  check(`משתנים — כל ${Object.keys(BOT_MESSAGE_REGISTRY).length} ההודעות עקביות (default ↔ vars)`,
    badKeys.length === 0, `לא עקבי: ${badKeys.join(', ')}`)

  // העדפת עינת: בלי מקפים ארוכים (— / –) בהודעות — רק מקף רגיל.
  const dashKeys = Object.entries(BOT_MESSAGE_REGISTRY)
    .filter(([, def]) => /[—–]/.test(def.default)).map(([k]) => k)
  check('סגנון — אין מקפים ארוכים בהודעות',
    dashKeys.length === 0, `מקף ארוך ב: ${dashKeys.join(', ')}`)

  // ברכת פתיחה ובטיחות — ברירת המחדל בלי cache.
  check('welcome — {ברכה}/{שם_בוט}/{תפריט} מוזרקים',
    (() => { const t = botText('welcome', { 'ברכה': 'היי דנה 😊\n\n', 'שם_בוט': 'ג׳וני', 'תפריט': 'X' })
             return t.includes('היי דנה') && t.includes('ג׳וני') && !t.includes('{') })(),
    'צריך הזרקה מלאה')
}

// ─── פאזה 3: ניתוב (astra ממצאים 4/8/5/6) ────────────────────────────────────
async function routingCases() {
  console.log('\n── פאזה 3: ניתוב (astra 4/8/5/6) ──')
  // #4 — בקשת נציגה גוברת על נושא ביטול
  {
    const got = classifyIntent('אני רוצה לדבר עם נציגה על ביטול הצהרון')
    check('#4 — "לדבר עם נציגה על ביטול הצהרון" → בקשת_נציג', got === 'בקשת_נציג', `got=${got}`)
  }
  // #8 — ספרה ערבית ٢ בשלב אזור → בחירת חוף הכרמל (לא קפיצה לקייטנה)
  {
    const s = makeSession('register_area')
    const r = await processMessage(s, '٢')
    check('#8 — "٢" בשלב אזור → בחירת חוף הכרמל',
      r.nextFlow === 'register_child_name' && s.collectedData.area_code === 'carmel',
      `nextFlow=${r.nextFlow} area=${s.collectedData.area_code}`)
  }
  // #5 — "גן" גנרי לא ממופה לתל אביב
  {
    const s = makeSession('register_area')
    await processMessage(s, 'הילד בגן בגבעתיים')
    check('#5 — "בגן בגבעתיים" לא נבחר כתל אביב', s.collectedData.area_code !== 'telaviv',
      `area=${s.collectedData.area_code}`)
  }
  // #5 — לא לשבור זיהוי גנים ספציפיים
  {
    const s = makeSession('register_area')
    await processMessage(s, 'גלי עתלית')
    check('#5 — "גלי עתלית" עדיין → carmel', s.collectedData.area_code === 'carmel',
      `area=${s.collectedData.area_code}`)
  }
  // #6 — סירוב להוראת קבע לא נבחר כהוראת קבע
  {
    const s = makeSession('payment_setup_method')
    await processMessage(s, 'אני לא רוצה הוראת קבע')
    check('#6 — "לא רוצה הוראת קבע" לא נבחר כהוראת קבע', s.collectedData.payment_method !== 'standing_order',
      `method=${s.collectedData.payment_method}`)
  }
  // astra R6 (סבב 2) — שלילה *אחרי* האמצעי + בקשה משולבת
  {
    const s = makeSession('payment_setup_method')
    await processMessage(s, 'הוראת קבע לא מתאימה לי')
    check('R6 — "הוראת קבע לא מתאימה לי" (שלילה אחרי) לא נבחר כהו"ק', s.collectedData.payment_method !== 'standing_order',
      `method=${s.collectedData.payment_method}`)
  }
  {
    const s = makeSession('payment_setup_method')
    await processMessage(s, 'הוראת קבע, לא אשראי')
    check('R6 — "הוראת קבע, לא אשראי" בוחר הו"ק (השלילה שייכת לאשראי)', s.collectedData.payment_method === 'standing_order',
      `method=${s.collectedData.payment_method}`)
  }
  // astra R6 — ניסוחי סירוב נוספים + בקשה משולבת
  for (const msg of ['לא הוראת קבע', 'אני לא מעוניין בהוראת קבע', 'בלי הוראת קבע']) {
    const s = makeSession('payment_setup_method')
    await processMessage(s, msg)
    check(`R6 — "${msg}" לא נבחר כהו"ק`, s.collectedData.payment_method !== 'standing_order',
      `method=${s.collectedData.payment_method}`)
  }
  {
    const s = makeSession('payment_setup_method')
    await processMessage(s, 'לא הוראת קבע, כן אשראי')
    check('R6 — "לא הו"ק, כן אשראי" → בוחר אשראי', s.collectedData.payment_method === 'credit',
      `method=${s.collectedData.payment_method}`)
  }
  {
    const s = makeSession('payment_setup_method')
    await processMessage(s, 'הוראת קבע')
    check('R6 — "הוראת קבע" (חיובי) עדיין נבחר', s.collectedData.payment_method === 'standing_order',
      `method=${s.collectedData.payment_method}`)
  }

  // ═══ #7 §10-11 — הוראת קבע כאופציה ראשית (חלק ב) ═══════════════════════════
  // כניסה בלי מחיר מאומת (הורה לא מזוהה) → מציעים הו"ק *בלי סכום* (astra חלק ב gap1)
  {
    const s = makeSession('payment_setup_start')
    const r = await processMessage(s, 'הסדרת תשלום')
    check('§10-11 — כניסה מציעה הו"ק ראשית (לא תפריט מלא)',
      r.nextFlow === 'payment_setup_offer' && /הוראת קבע/.test(r.text) && !/כרטיס אשראי \(PayPlus\)/.test(r.text),
      `nextFlow=${r.nextFlow} text=${JSON.stringify(r.text.slice(0, 90))}`)
    check('§10-11 gap1 — בלי מחיר מאומת: לא מבטיחים סכום (אין ₪ מספרי)',
      !/\d+\s*₪/.test(r.text), `text=${JSON.stringify(r.text)}`)
  }
  // כניסה *עם* מחיר מאומת → מוצג הסכום הנכון
  {
    const s = makeSession('payment_setup_start', { child_name: 'נועם', monthly_fee: '880', area_label: 'חוף הכרמל' })
    const r = await processMessage(s, 'הסדרת תשלום')
    check('§10-11 gap1 — עם מחיר מאומת: מוצג הסכום (880₪)',
      /880\s*₪/.test(r.text), `text=${JSON.stringify(r.text.slice(0, 120))}`)
  }
  // ── קורפוס ממצה למסווג האישור (offerVerdict) — כל קטגוריה והתוצאה הצפויה ──────
  //    מיפוי כל מרחב הקלט מראש (לא נקודה-נקודה), כדי לתפוס false-accept לפני שהוא קורה.
  const OFFER = {
    // אישור → הו"ק (זיהוי שם → לינק). **ביטויים שלמים בלבד** (לא מילים-בודדות).
    accept: ['כן', 'כן בבקשה', 'כן להסדיר', 'להסדיר', 'מאשר', 'מאשרת', 'אישור', 'מסכים',
      'הוראת קבע', 'כן הוראת קבע', 'הוראת קבע בבקשה',
      'כן אשמח', 'אשמח', 'בשמחה', 'בטח', 'כן בטח', 'בהחלט', 'לגמרי', 'מעולה', 'כן מעולה',
      'סבבה', 'אוקיי', 'בסדר', 'בסדר גמור', 'מצוין', 'מושלם', 'יאללה', 'קדימה',
      'נשמע טוב', 'אני רוצה', 'כן רוצה', 'אני רוצה הוראת קבע', 'בוא נעשה הוראת קבע', 'נעשה הוראת קבע',
      // astra חלק ב 10 (סריקה יזומה): הסכמה עם מילת שלילה / סלנג / רצף ביטויים / אנגלית
      'אין בעיה', 'לא בעיה', 'אין לי בעיה עם זה', 'בלי ספק', 'אין ספק שכן', 'אין לי התנגדות', 'לא רע בכלל, בואו נעשה',
      'בכיף', 'ברור', 'כמובן', 'נשמע מעולה', 'נראה לי טוב', 'מקובל עליי', 'סבבה אחי', 'אוקי בוא', 'נו טוב כן בטח',
      'קדימה בוא נעשה את זה', 'בסדר גמור מאשרת', 'כן מעולה בואו נתחיל', 'כן תודה', 'יאללה סגור', 'סגור עליי',
      'ok', 'OK', 'yes', 'Yes please', 'sure', 'כן!', 'כן.'],
    // שאלה/בקשת הסבר → LLM (לא אישור, לא תפריט)
    question: ['מה זה הוראת קבע', 'מה זו הוראת קבע', 'מה זה הוראת קבע?', 'כן אשמח לדעת יותר',
      'רוצה לדעת עוד', 'רוצה לדעת עוד על הוראת קבע', 'תסביר', 'תסביר לי', 'מה היתרונות?',
      'איך זה עובד?', 'זה מחייב?', 'אפשר לשלם באשראי?', 'מה המשמעות של הוראת קבע',
      // astra חלק ב 10: הסבר בלי סימן שאלה; שאלת לו"ז לא נחטפת מההצעה; "למה לא" = שאלה (לא אישור כספי)
      'איך הוראת קבע עובדת', 'לא רוצה לבטל כלום, רק תגידו לי איך הוראת קבע עובדת', 'מה שעות הצהרון?', 'למה לא', 'למה לא?'],
    // סירוב/שיטה אחרת → תפריט חלופות
    refuse: ['לא', 'לא תודה', 'לא רוצה', 'לא צריך', 'לא מעוניין', 'מעדיף להימנע',
      'מעדיף להימנע מהוראת קבע', 'מעדיף לא', 'בלי הוראת קבע', 'אפשרות אחרת',
      'אני מעדיף אפשרות אחרת', 'משהו אחר', 'חלופות',
      'אשראי', 'מזומן', 'צ׳קים', 'העברה בנקאית', 'קישור', 'כרטיס אשראי',
      // astra חלק ב 10
      'no', 'No thanks', 'לא מתאים לי', 'עדיף אשראי', 'לא מעוניינת', 'משהו אחר בבקשה'],
    // דחייה/היסוס/עמימות + **מילים-בודדות שאינן משפט אישור** → הבהרה, נשארים בהצעה
    unclear: ['רוצה לחשוב', 'אני רוצה לחשוב', 'אני צריך לחשוב', 'אני צריך לחשוב על זה',
      'תן לי לחשוב', 'אחשוב על זה', 'כן בהמשך', 'לא עכשיו', 'אחר כך', 'עוד מעט', 'מחר',
      'בהמשך', 'אולי', 'אולי אחר כך', 'תלוי', 'נראה', 'כן אבל רגע', 'רגע', 'שנייה', 'חכה',
      'אני', 'הוראת', 'קבע', 'רוצה',    // astra חלק ב 5: מילה בודדת מאוצר ≠ אישור
      // astra חלק ב 10: מילת-מילוי לבדה ≠ אישור; אמוג'י/טעות הקלדה/צד ג' → הבהרה (ברירת מחדל בטוחה)
      'בוא', 'טוב', 'אחי', 'זה', 'תודה', '👍', '✅', 'כןבבקשה', 'yes but', 'אשתי אמרה שכן',
      'אני חושבת שזה רעיון טוב ונרצה להתחיל בהוראת קבע'],
  }
  for (const msg of OFFER.accept) {
    const s = makeSession('payment_setup_offer', { child_name: 'נועם', monthly_fee: '450' })
    const r = await processMessage(s, msg)
    check(`§10-11 accept — "${msg}" → הו"ק`,
      s.collectedData.payment_method === 'standing_order' && r.nextFlow === 'payment_setup_child_name',
      `method=${s.collectedData.payment_method} nextFlow=${r.nextFlow}`)
  }
  for (const msg of OFFER.question) {
    const s = makeSession('payment_setup_offer', { child_name: 'נועם', monthly_fee: '450' })
    const r = await processMessage(s, msg)
    check(`§10-11 question — "${msg}" → לא אישור/לא תפריט`,
      s.collectedData.payment_method !== 'standing_order' && r.nextFlow !== 'payment_setup_child_name' && r.nextFlow !== 'payment_setup_method',
      `method=${s.collectedData.payment_method} nextFlow=${r.nextFlow}`)
  }
  for (const msg of OFFER.refuse) {
    const s = makeSession('payment_setup_offer', { child_name: 'נועם', monthly_fee: '450' })
    const r = await processMessage(s, msg)
    check(`§10-11 refuse — "${msg}" → תפריט חלופות`,
      r.nextFlow === 'payment_setup_method' && s.collectedData.payment_method !== 'standing_order',
      `nextFlow=${r.nextFlow} method=${s.collectedData.payment_method}`)
  }
  for (const msg of OFFER.unclear) {
    const s = makeSession('payment_setup_offer', { child_name: 'נועם', monthly_fee: '450' })
    const r = await processMessage(s, msg)
    check(`§10-11 unclear — "${msg}" → הבהרה (נשאר בהצעה)`,
      s.collectedData.payment_method !== 'standing_order' && r.nextFlow === 'payment_setup_offer',
      `method=${s.collectedData.payment_method} nextFlow=${r.nextFlow} text=${JSON.stringify(r.text.slice(0, 40))}`)
  }
  // בקשת ביטול *רישום מפורשת* (מטרת-רישום) → מסלול הביטול. astra חלק ב 5/7.
  for (const msg of ['אני רוצה לבטל את הרישום לצהרון', 'אני רוצה לבטל את הרישום', 'לבטל את הצהרון', 'לבטל את הרישום',
    // astra חלק ב 10: "לא," בפסוקית נפרדת + בקשה חיובית; נטיות הפועל; הו"ק בפסוקית הסירוב (לא במושא הביטול)
    'לא, לבטל את הרישום', 'לא, אני רוצה לבטל את הרישום לצהרון', 'תבטלו לי את הרישום', 'לא! בואו נבטל את הצהרון',
    'לא רוצה הוראת קבע, תבטלו לי את הרישום']) {
    const s = makeSession('payment_setup_offer', { child_name: 'נועם', monthly_fee: '450' })
    const r = await processMessage(s, msg)
    check(`§10-11 cancel-redirect — "${msg}" → מסלול ביטול`,
      r.nextFlow === 'cancel_child' && s.collectedData.payment_method !== 'standing_order',
      `nextFlow=${r.nextFlow} method=${s.collectedData.payment_method} text=${JSON.stringify(r.text.slice(0, 40))}`)
  }
  // ביטול *עמום* / *שתי מטרות יחד* → בירור בשלב הייעודי (astra חלק ב 7/8).
  //   "לבטל את הו"ק לצהרון" — שתי מטרות → בירור (לא ביטול-רישום כי "צהרון" גבר על "הו"ק").
  for (const msg of ['רוצה לבטל', 'לבטל', 'אני רוצה לבטל', 'לבטל את הוראת הקבע לצהרון']) {
    const s = makeSession('payment_setup_offer', { child_name: 'נועם', monthly_fee: '450' })
    const r = await processMessage(s, msg)
    check(`§10-11 cancel-ambiguous — "${msg}" → בירור (שלב ייעודי, לא מסלול ביטול)`,
      r.nextFlow === 'payment_setup_cancel_choice' && /מה תרצו לבטל/.test(r.text) && s.collectedData.payment_method !== 'standing_order',
      `nextFlow=${r.nextFlow} method=${s.collectedData.payment_method} text=${JSON.stringify(r.text.slice(0, 40))}`)
  }
  // מענה לבירור: "את הרישום" → ביטול; "אפשרות אחרת" → חלופות (astra חלק ב 8 — התשובה נקראת כמענה)
  for (const [answer, expected] of [['את הרישום', 'cancel_child'], ['הרישום', 'cancel_child'], ['צהרון', 'cancel_child'], ['אפשרות אחרת', 'payment_setup_method'], ['הוראת קבע', 'payment_setup_method'], ['את התשלום', 'payment_setup_method'],
    // astra חלק ב 10: "לא," בפסוקית נפרדת; שניהם → ביטול רישום (מבטל גם הו"ק, עם אישור); חלופה מפורשת + שלילת הו"ק
    ['לא, את הרישום', 'cancel_child'], ['שניהם', 'cancel_child'], ['הכל', 'cancel_child'], ['גם את הרישום וגם את הוראת הקבע', 'cancel_child'],
    ['משהו אחר, לא הוראת קבע', 'payment_setup_method'], ['אפשרות אחרת בבקשה', 'payment_setup_method'],
    // astra סבב 10 (P2): "גם את X" = X בלבד; "לא, שניהם" (פסיק) = שניהם; ביטוי משותף מפורש
    ['גם את התשלום', 'payment_setup_method'], ['גם את הוראת הקבע', 'payment_setup_method'], ['לא, שניהם', 'cancel_child'],
    ['את שתי האפשרויות', 'cancel_child'], ['גם את הצהרון', 'cancel_child'], ['את הרישום ואת הוראת הקבע', 'cancel_child'],
    ['רק את הרישום', 'cancel_child'], ['הרישום בלבד', 'cancel_child'], ['רק את התשלום', 'payment_setup_method'],
    ['גם את הוראת הקבע וגם את הרישום', 'cancel_child'], ['את הרישום וגם את התשלום', 'cancel_child'], ['הרישום והתשלום', 'cancel_child']]) {
    const s = makeSession('payment_setup_cancel_choice', { child_name: 'נועם', monthly_fee: '450' })
    const r = await processMessage(s, answer)
    check(`§10-11 cancel-choice — "${answer}" → ${expected}`,
      r.nextFlow === expected && s.collectedData.payment_method !== 'standing_order',
      `nextFlow=${r.nextFlow} method=${s.collectedData.payment_method}`)
  }
  // הגנות בשלב הבירור (astra חלק ב 9): שאלה → LLM; שלילה → בירור שוב — *לא* ביטול רישום.
  for (const answer of ['לא את הרישום', 'מה יקרה לרישום?', 'לא בטוח', 'מה זה אומר לגבי הרישום', 'לא את הצהרון', 'בלי לבטל את הרישום',
    // astra סבב 10 (P2): שלילת "שניהם" / שלילת התשלום אינן בחירה → נשארים בבירור (לא ביטול, לא חלופות)
    'לא שניהם', 'לא הכל', 'לא גם וגם', 'לא את התשלום',
    // astra סבב 11 (P2): שתי מילות-מטרה בלי חיבור מפורש = תיאור, לא "שניהם" → בירור (לא ביטול רישום)
    'את הוראת הקבע לצהרון', 'הוראת הקבע של הצהרון', 'התשלום לצהרון', 'לא שתי האפשרויות',
    'לא בטוח, אולי את הרישום', 'אולי הרישום', 'הרישום, אבל רגע',
    // astra סבב 12 (P2): "וגם" שמחבר שתי מסגרות / שני תיאורים כספיים אינו "רישום וגם תשלום"
    'את התשלום לצהרון וגם לקייטנה', 'את הוראת הקבע לצהרון וגם את החיוב', 'גם הרישום גם התשלום',
    // astra סבב 13 (P2): שני תשלומים עם "וגם"; שילוב רישום+תשלום שאינו משפט שלם מהרשימה → בירור
    'את התשלום לצהרון וגם את התשלום לקייטנה', 'את הצהרון וגם את התשלום', 'הצהרון וגם התשלום', 'גם את הרישום לצהרון וגם את הוראת הקבע של נועם']) {
    const s = makeSession('payment_setup_cancel_choice', { child_name: 'נועם', monthly_fee: '450' })
    const r = await processMessage(s, answer)
    check(`§10-11 cancel-choice-guard — "${answer}" → *לא* ביטול רישום`,
      r.nextFlow !== 'cancel_child' && s.collectedData.payment_method !== 'standing_order',
      `nextFlow=${r.nextFlow} method=${s.collectedData.payment_method} text=${JSON.stringify(r.text.slice(0, 40))}`)
  }
  // "לא רוצה" נשאר סירוב-להצעה (לא ביטול-רישום) → תפריט חלופות
  {
    const s = makeSession('payment_setup_offer', { child_name: 'נועם', monthly_fee: '450' })
    const r = await processMessage(s, 'לא רוצה')
    check('§10-11 — "לא רוצה" נשאר סירוב-להצעה (תפריט, לא מסלול ביטול)',
      r.nextFlow === 'payment_setup_method',
      `nextFlow=${r.nextFlow}`)
  }
  // astra חלק ב 6: אזכור "ביטול" שאינו בקשת ביטול-רישום חיובית → *לא* מסלול ביטול.
  //   שאלה → LLM; שלילה / ביטול אמצעי-תשלום → בירור (נשאר בהצעה).
  for (const msg of ['אפשר לבטל הוראת קבע בהמשך?', 'אני לא רוצה לבטל את הרישום', 'אני רוצה לבטל את הוראת הקבע',
    'לא רוצה לבטל את הצהרון', 'בלי לבטל את הרישום', 'לא לבטל את הרישום']) {
    const s = makeSession('payment_setup_offer', { child_name: 'נועם', monthly_fee: '450' })
    const r = await processMessage(s, msg)
    check(`§10-11 cancel-guard — "${msg}" → *לא* מסלול ביטול-רישום`,
      r.nextFlow !== 'cancel_child' && s.collectedData.payment_method !== 'standing_order',
      `nextFlow=${r.nextFlow} method=${s.collectedData.payment_method} text=${JSON.stringify(r.text.slice(0, 40))}`)
  }
}

// ─── 23.9: סגירת שיחה ב"תודה" — תשובה חמה, לא תפריט (עינת, בדיקה חיה: "יופי תודה" → תפריט) ──
async function thanksClosingCases() {
  console.log('\n── סגירה ב"תודה" ──')
  const isWelcome = (t: string) => t.includes('*1* - רישום לצהרון')
  for (const msg of ['יופי תודה', 'תודה', 'תודה רבה', 'מעולה תודה!', 'תודה רבה, מעולה', 'סבבה תודה 🙏', 'אוקיי תודה לך', 'תודה, יום טוב', 'thanks', 'תודה ענקית אלופה', 'הבנתי תודה']) {
    const s = makeSession(undefined, {})
    const r = await processMessage(s, msg)
    check(`thanks — "${msg}" → תשובה חמה (לא תפריט, לא LLM)`,
      !isWelcome(r.text) && /בשמחה|אני כאן/.test(r.text),
      `text=${JSON.stringify(r.text.slice(0, 60))}`)
  }
  // תודה + תוכן/שאלה — *לא* סגירה: ממשיכים לטפל בתוכן
  for (const msg of ['תודה, ומה השעות של הצהרון?', 'תודה אבל לא הבנתי מתי מחייבים', 'תודה, אני רוצה לבטל את הרישום']) {
    const s = makeSession(undefined, {})
    const r = await processMessage(s, msg)
    check(`thanks-guard — "${msg}" → לא תשובת-תודה`,
      !/^בשמחה! אם צריך/.test(r.text),
      `text=${JSON.stringify(r.text.slice(0, 60))}`)
  }
}

// ─── 23.9: סולם "בוט חכם" באמצע מסלול + סגירות/פתיחות ─────────────────────────
async function smartLadderCases() {
  console.log('\n── סולם בוט חכם: הבהרה → LLM → קורלי ──')
  const llmish = (t: string) => /נציגה שלנו תחזור/.test(t)   // בבדיקה ה-LLM כבוי → טקסט ה-fallback
  // הסדרת תשלום, בחירת שיטה: תשובה לא מזוהה ×3
  {
    const s = makeSession('payment_setup_method', { child_name: 'נועם', monthly_fee: '450' })
    const r1 = await processMessage(s, 'בלה בלה')
    check('ladder 1 — הבהרת השלב (payset_method_invalid), המסלול נשמר',
      /לא הבנתי/.test(r1.text) && r1.nextFlow === 'payment_setup_method', `text=${JSON.stringify(r1.text.slice(0, 50))} nextFlow=${r1.nextFlow}`)
    const r2 = await processMessage(s, 'בלה בלה שוב')
    check('ladder 2 — LLM עם הקשר, המסלול נשמר',
      llmish(r2.text) && r2.nextFlow === 'payment_setup_method', `text=${JSON.stringify(r2.text.slice(0, 50))} nextFlow=${r2.nextFlow}`)
    const r3 = await processMessage(s, 'בלה בלה שלישית')
    check('ladder 3 — העברה לקורלי + פנייה',
      /קורלי/.test(r3.text) && r3.nextFlow === 'handoff_paused' && !!r3.createTask, `text=${JSON.stringify(r3.text.slice(0, 50))} nextFlow=${r3.nextFlow}`)
  }
  // התקדמות מאפסת את המונה: הבהרה → תשובה תקינה → שוב הבהרה (לא LLM)
  {
    const s = makeSession('payment_setup_method', { child_name: 'נועם', monthly_fee: '450' })
    await processMessage(s, 'בלה')
    const ok = await processMessage(s, '3')                       // מזומן → מתקדם
    check('ladder reset — תשובה תקינה מתקדמת', ok.nextFlow !== 'payment_setup_method', `nextFlow=${ok.nextFlow}`)
    check('ladder reset — המונה נמחק', s.collectedData.__miss === undefined, `miss=${s.collectedData.__miss}`)
  }
  // שלב שכבר עבר ל-LLM בפעם הראשונה (תפריט סטטוס תשלום): LLM, LLM, ואז קורלי
  {
    const s = makeSession('payment_status_menu', { child_name: 'נועם' })
    const r1 = await processMessage(s, 'משהו לא קשור בכלל')
    const r2 = await processMessage(s, 'עדיין משהו לא קשור')
    const r3 = await processMessage(s, 'ושוב משהו לא קשור')
    check('ladder (שלב LLM-ראשון) — פעמיים LLM ואז קורלי',
      llmish(r1.text) && llmish(r2.text) && /קורלי/.test(r3.text) && r3.nextFlow === 'handoff_paused',
      `r1=${JSON.stringify(r1.text.slice(0, 30))} r3=${JSON.stringify(r3.text.slice(0, 40))} nextFlow=${r3.nextFlow}`)
  }
  // שלב אישור כספי בסולם: היסוס 1 → שאלת אישור מחדש · היסוס 2 → LLM + תזכורת "כן/לא" · היסוס 3 → קורלי. אף פעם לא ביטול.
  {
    const s = makeSession('cancel_confirm_after15', { child_name: 'נועם בירן' })
    const r1 = await processMessage(s, 'כן אבל רגע')
    check('confirm ladder 1 — היסוס → שאלת האישור מחדש', r1.nextFlow === 'cancel_confirm_after15' && !/הביטול בוצע/.test(r1.text), `nextFlow=${r1.nextFlow}`)
    const r2 = await processMessage(s, 'אולי')
    check('confirm ladder 2 — היסוס שני → LLM, השלב נשמר, תזכורת כן/לא, לא ביטול',
      r2.nextFlow === 'cancel_confirm_after15' && /לאישור הביטול/.test(r2.text) && !/הביטול בוצע/.test(r2.text), `nextFlow=${r2.nextFlow} text=${JSON.stringify(r2.text.slice(0, 80))}`)
    const r3 = await processMessage(s, 'לא בטוח')
    check('confirm ladder 3 — היסוס שלישי → קורלי, לא ביטול', /קורלי/.test(r3.text) && !/הביטול בוצע/.test(r3.text), `text=${JSON.stringify(r3.text.slice(0, 60))}`)
    check('confirm ladder — לעולם לא ביטול בפועל', !/הביטול בוצע|בקשת הביטול נקלטה/.test(r1.text + r2.text + r3.text), '')
  }
  // שאלה אמיתית באמצע שלב לא נספרת: 3 שאלות רצופות → עדיין בשלב, לא קורלי
  {
    const s = makeSession('waiting_spot_confirm', { child_name: 'נועם בירן' })
    const r1 = await processMessage(s, 'כמה זה עולה בדיוק?')
    check('question in confirm — "כמה זה עולה בדיוק?" → LLM, השלב נשמר', llmish(r1.text) && r1.nextFlow === 'waiting_spot_confirm', `text=${JSON.stringify(r1.text.slice(0, 40))} nextFlow=${r1.nextFlow}`)
    // (עם LLM כבוי שומר-התסכול מסלים אחרי 2 תשובות-שגיאה, לכן כאן בודקים שאלה אחת: LLM, השלב נשמר, המונה לא זז)
    const s2 = makeSession('payment_setup_method', { child_name: 'נועם', monthly_fee: '450' })
    const rq = await processMessage(s2, 'כמה זה עולה?')
    check('question in step — "כמה זה עולה?" בשלב שיטת תשלום → LLM, השלב נשמר, המונה לא זז',
      llmish(rq.text) && rq.nextFlow === 'payment_setup_method' && s2.collectedData.__miss === undefined, `text=${JSON.stringify(rq.text.slice(0, 40))} nextFlow=${rq.nextFlow} miss=${s2.collectedData.__miss}`)
  }
  // הודעה ראשונה שהיא שאלה אמיתית → LLM בלי תפריט מצורף
  {
    const s = makeSession(undefined, {})
    const r = await processMessage(s, 'תודה. לא הבנתי מתי מחייבים')
    check('first message question — LLM בלי תפריט', !r.text.includes('*1* - רישום לצהרון'), `text=${JSON.stringify(r.text.slice(0, 80))}`)
  }

  console.log('\n── סגירות / פתיחות / תודה ──')
  const isWelcome = (t: string) => t.includes('*1* - רישום לצהרון')
  for (const msg of ['לילה טוב', 'ביי', 'להתראות', 'יום טוב', 'שבוע טוב', 'שבת שלום', 'חג שמח', 'שנה טובה', 'תודה ולהתראות', 'ביי ביי', 'נתראה', 'סופש נעים', 'לילה טוב ותודה']) {
    const s = makeSession(undefined, {})
    const r = await processMessage(s, msg)
    check(`farewell — "${msg}" → פרידה חמה (לא תפריט, לא LLM)`,
      !isWelcome(r.text) && /אני כאן/.test(r.text) && !llmish(r.text), `text=${JSON.stringify(r.text.slice(0, 60))}`)
  }
  for (const msg of ['תודה על העזרה', 'תודה על הכל', 'תודה מכל הלב', 'תודה אני מסודר', 'תודה לך מאוד', 'תודהה', 'wow תודה', 'איזו תודה']) {
    const s = makeSession(undefined, {})
    const r = await processMessage(s, msg)
    check(`thanks — "${msg}" → "בשמחה" (לא תפריט)`, /^בשמחה/.test(r.text), `text=${JSON.stringify(r.text.slice(0, 60))}`)
  }
  for (const msg of ['תודה, יש לי עוד שאלה על התשלום', 'תודה אבל לא הבנתי מתי מחייבים', 'תודה, אני רוצה לבטל את הרישום']) {
    const s = makeSession(undefined, {})
    const r = await processMessage(s, msg)
    check(`thanks-guard — "${msg}" → לא "בשמחה"`, !/^בשמחה/.test(r.text), `text=${JSON.stringify(r.text.slice(0, 60))}`)
  }
  for (const msg of ['אהלן', 'הלו', 'היייי', 'שלום', 'בוקר טוב']) {
    const s = makeSession(undefined, {})
    const r = await processMessage(s, msg)
    check(`opening — "${msg}" → תפריט פתיחה`, isWelcome(r.text), `text=${JSON.stringify(r.text.slice(0, 60))}`)
  }
  // פתיחה לא מוכרת בהודעה ראשונה → LLM ואז תפריט; באמצע שיחה (יש היסטוריה) → LLM בלי תפריט
  {
    const s = makeSession(undefined, {})
    const r = await processMessage(s, 'הופה הגעתי')
    check('unknown opening (הודעה ראשונה) — LLM ואז תפריט', llmish(r.text) && isWelcome(r.text), `text=${JSON.stringify(r.text.slice(0, 80))}`)
    const s2 = makeSession(undefined, {})
    s2.messages = [{ role: 'user', content: 'מה השעות?', timestamp: new Date().toISOString() } as any, { role: 'assistant', content: 'השעות הן 13-17', timestamp: new Date().toISOString() } as any]
    const r2 = await processMessage(s2, 'יופי')
    check('reaction באמצע שיחה — LLM בלי תפריט', llmish(r2.text) && !isWelcome(r2.text), `text=${JSON.stringify(r2.text.slice(0, 80))}`)
  }
  // §5: ג'יבריש בזמן שה-LLM נופל → לא הסלמה מיידית (תור אחד)
  {
    const s = makeSession(undefined, {})
    const r = await processMessage(s, '?')
    check('§5 — "?" בודד כשה-LLM כבוי → לא הסלמה לקורלי', r.nextFlow !== 'handoff_paused', `nextFlow=${r.nextFlow} text=${JSON.stringify(r.text.slice(0, 50))}`)
  }
}

async function main() {
  intentCases()
  await flowCases()
  await guardCases()
  await thanksClosingCases()
  await smartLadderCases()
  await privacyCases()
  await humanRequestCases()
  await cancelSafetyCases()
  await switchCases()
  await routingCases()
  classifierCases()
  await flowDetailCases()
  await miscCases()
  llmParsingCases()
  voiceCases()
  settingsFallbackCases()
  pricingFallbackCases()
  botMessagesCases()
  console.log(`\n────────────\nעברו: ${passed} | נכשלו: ${failed}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(err => { console.error('FATAL', err); process.exit(1) })
