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

async function main() {
  intentCases()
  await flowCases()
  await guardCases()
  console.log(`\n────────────\nעברו: ${passed} | נכשלו: ${failed}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(err => { console.error('FATAL', err); process.exit(1) })
