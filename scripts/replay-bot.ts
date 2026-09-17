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
import { parsePickupTime, splitNameAndClass, scheduleFaqAnchors, isHolidayQuestion } from '@/lib/bot/flows'
import { parseLLMResponse, sanitizeForWhatsApp } from '@/lib/bot/llm-fallback'
import { detectMedia } from '@/lib/bot/media-handler'
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
const isWelcomeMenu   = (t: string) => t.includes('*1* — רישום לצהרון') && t.includes('*6* — איסוף מוקדם')
const isNotUnderstood = (t: string) => /לא הבנתי|לא הצלחתי להבין/.test(t)

// ─── 1. סיווג כוונה (A1) ─────────────────────────────────────────────────────
function intentCases() {
  console.log('\n── A1: סיווג כוונה ──')
  const cases: Array<{ msg: string; expect?: BotIntent; notExpect?: BotIntent }> = [
    { msg: 'העברות 17.9 תשלומי ספקים',                       notExpect: 'רישום_צהרון' },
    { msg: 'אייל בירן\nכבר רשמתי לך מקודם',                   notExpect: 'שאלת_לוז' },
    { msg: 'מה זאת אומרת כמה שנים לעידן? מה זו השאלה הזו?',   notExpect: 'בדיקת_תשלום' },
    { msg: 'מה שעות הקייטנה שבוע הבא ?',                      expect:    'שאלת_לוז' },
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
    check('"היום קר" — לא מזוהה כברכה',
      !isWelcomeMenu(r.text), `text=${JSON.stringify(r.text.slice(0, 90))}`)
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
  // אחרי handoff — שתיקה
  {
    const s = makeSession('handoff_paused')
    const r = await processMessage(s, 'תודה, אני מחכה')
    check('handoff — הודעה אחרי העברה = שתיקה', r.text === '' && r.nextFlow === 'handoff_paused',
      `text=${JSON.stringify(r.text)} nextFlow=${r.nextFlow}`)
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

async function main() {
  intentCases()
  await flowCases()
  await guardCases()
  await privacyCases()
  await humanRequestCases()
  await cancelSafetyCases()
  await switchCases()
  classifierCases()
  await flowDetailCases()
  await miscCases()
  llmParsingCases()
  console.log(`\n────────────\nעברו: ${passed} | נכשלו: ${failed}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(err => { console.error('FATAL', err); process.exit(1) })
