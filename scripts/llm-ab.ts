/**
 * llm-ab.ts — השוואת מודלים על הפרומפט האמיתי של ה-fallback (זמן תגובה + איכות).
 * הרצה: npx tsx scripts/llm-ab.ts   (טוען .env.local בעצמו)
 */
import fs from 'fs'
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
import type { BotSession } from '@/lib/types'

const MODELS = (process.env.AB_MODELS || 'claude-haiku-4-5,claude-sonnet-5,claude-opus-5').split(',')
const cases: Array<{ name: string; msg: string; flow?: string; data?: Record<string, string> }> = [
  { name: 'מחיר באמצע רישום', msg: 'כמה זה עולה?', flow: 'register_child_name', data: { area_code: 'carmel' } },
  { name: 'האם נועם רשום (הורה מוכר)', msg: 'אתה יכול לבדוק אם נועם רשום?' },
  { name: 'שאלה בצומת אישור ביטול', msg: 'לא הבנתי עד מתי אני משלם בפועל, עד איזה תאריך?', flow: 'cancel_confirm_after15', data: { child_name: 'נועם בירן' } },
  { name: 'שם ילד בתוך משפט', msg: 'אני אייל בירן, הבן שלי נועם בירן, ועכשיו אני רוצה לרשום את עידן. נחש מה שם המשפחה שלו', flow: 'register_child_name', data: { area_code: 'carmel' } },
]
;(async () => {
  // import דינמי — אחרי טעינת .env.local (import סטטי מורם לפני ההשמה של process.env)
  const { callLLMFallback } = await import('@/lib/bot/llm-fallback')
  for (const model of MODELS) {
    process.env.BOT_LLM_MODEL = model
    console.log(`\n══════ ${model} ══════`)
    for (const c of cases) {
      const s: BotSession = { sessionId: 'ab', phone: '+972547580548', parentName: 'אייל בירן', messages: [], currentFlow: c.flow, collectedData: { ...(c.data ?? {}) } }
      const t0 = Date.now()
      const r = await callLLMFallback(s, c.msg)
      const ms = Date.now() - t0
      console.log(`\n▸ ${c.name} — ${ms} ms | task=${!!r.createTask} | wantsHuman=${!!r.userWantsHuman}\n  ${r.text.replace(/\n+/g, ' ⏎ ').slice(0, 260)}`)
    }
  }
})()
