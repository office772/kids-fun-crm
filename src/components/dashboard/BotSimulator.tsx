'use client'

import { useState, useEffect, useRef } from 'react'

// =========================================
// TesterReset — איפוס פונה לבדיקה (לבודק, דרך הפרונטהנד)
// =========================================
const RESET_KNOWN_LABELS: Record<string, string> = {
  '972544535688': 'עינת',
  '972546603344': 'בדיקה',
  '972546102262': 'קורלי',
  '972544487290': 'אייבי',
}

export function TesterReset() {
  // רשימת מספרי הבדיקה נטענת מ-API (base קבוע + extra שנוספו בדשבורד) —
  // אותו מקור אמת כמו הבוט, כדי שמספר שאייל מוסיף יופיע גם כאן לאיפוס.
  const [testNumbers, setTestNumbers] = useState<{ phone: string; label: string }[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  // ברירת מחדל: רק שיחות — לא מוחק בטעות רישום שמולא בטופס
  const [scope, setScope] = useState<'conversations' | 'full'>('conversations')

  useEffect(() => {
    fetch('/api/admin/test-phones')
      .then(r => r.json())
      .then(d => {
        if (!d.success) return
        const all = [...(d.base ?? []), ...(d.extra ?? [])] as string[]
        setTestNumbers(all.map(intl => ({
          phone: '0' + intl.replace(/^972/, ''),
          label: RESET_KNOWN_LABELS[intl] ?? 'מספר בדיקה',
        })))
      })
      .catch(() => { /* ignore */ })
  }, [])

  const reset = async (phone: string, label: string) => {
    const msg = scope === 'conversations'
      ? `לאפס את השיחה של ${label}?\n\nזה ימחק רק את שיחת הבוט (הבוט "ישכח" את ההתכתבות), אבל ישמור הורה, ילד ורישום שמולא בטופס.`
      : `איפוס מלא של ${label}?\n\n⚠️ זה ימחק את כל הרשומות של המספר הזה — הורה, ילד, רישום, פניות ותשלומים — כאילו הורה חדש לגמרי.`
    if (!confirm(msg)) return
    setBusy(phone); setDone(null)
    try {
      const res = await fetch('/api/admin/reset-tester', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, scope }),
      })
      const data = await res.json()
      setDone(data.success
        ? (scope === 'conversations'
            ? `✅ השיחה של ${label} אופסה! הרישום מהטופס נשמר. אפשר להתחיל שיחה חדשה.`
            : `✅ ${label} אופס לגמרי! אפשר להתחיל בדיקה חדשה מהוואטסאפ.`)
        : `❌ לא הצלחתי: ${data.error || 'שגיאה'}`)
    } catch {
      setDone('❌ שגיאת תקשורת — נסי שוב')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bg-crm-surface rounded-crm border-2 p-6" style={{ borderColor: '#FDE047' }}>
      <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--crm-primary)' }}>🧪 איפוס פונה לבדיקה</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--crm-text)', opacity: 0.7 }}>
        אחרי כל בדיקה — לחצי כאן כדי "לנקות" את מספר הבדיקה. בחרי קודם מה לאפס:
      </p>

      <div className="mb-4 flex flex-col gap-2">
        <label className="flex items-start gap-2 cursor-pointer text-sm" style={{ color: 'var(--crm-text)' }}>
          <input type="radio" name="reset-scope" className="mt-1" checked={scope === 'conversations'}
            onChange={() => setScope('conversations')} />
          <span><b>רק שיחת הבוט</b> — הבוט "שוכח" את ההתכתבות, אבל רישום שמולא בטופס <b>נשמר</b>.</span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer text-sm" style={{ color: 'var(--crm-text)' }}>
          <input type="radio" name="reset-scope" className="mt-1" checked={scope === 'full'}
            onChange={() => setScope('full')} />
          <span><b>הכל</b> — מוחק גם הורה, ילד, רישום ותשלומים (הורה חדש לגמרי).</span>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        {testNumbers.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--crm-text-muted)' }}>טוען מספרי בדיקה…</p>
        )}
        {testNumbers.map(n => (
          <button
            key={n.phone}
            onClick={() => reset(n.phone, n.label)}
            disabled={busy === n.phone}
            className="px-4 py-2.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: '#FEF9C3', color: '#7B6010' }}
          >
            {busy === n.phone ? 'מאפס…' : `${scope === 'full' ? '🗑️' : '🔄'} ${n.label} (${n.phone})`}
          </button>
        ))}
      </div>
      {done && <p className="mt-4 text-sm font-medium" style={{ color: 'var(--crm-text)' }}>{done}</p>}
    </div>
  )
}

// =========================================
// BotSimulator
// =========================================
const FLOW_LABELS: Record<string, { label: string; emoji: string; steps: string[] }> = {
  // ── רישום לצהרון ──
  register_child_name:    { label: 'רישום לצהרון',     emoji: '🎒', steps: ['שם ילד/ה', 'כיתה', 'מסגרת'] },
  register_class:         { label: 'רישום לצהרון',     emoji: '🎒', steps: ['שם ✓', 'כיתה', 'מסגרת'] },
  register_framework:     { label: 'רישום לצהרון',     emoji: '🎒', steps: ['שם ✓', 'כיתה ✓', 'מסגרת'] },
  register_waiting_confirm: { label: 'רשימת המתנה',   emoji: '⏳', steps: ['אישור המתנה'] },
  // ── ביטול ──
  cancel_child:              { label: 'ביטול',          emoji: '❌', steps: ['שם ילד/ה', 'אישור'] },
  cancel_confirm_before15:   { label: 'ביטול (לפני 15)', emoji: '❌', steps: ['אישור'] },
  cancel_confirm_after15:    { label: 'ביטול (אחרי 15)', emoji: '❌', steps: ['אישור תקנון'] },
  // ── קייטנה ──
  camp_menu:             { label: 'קייטנה',             emoji: '🏕️', steps: ['בחירת תרחיש'] },
  camp_check_name:       { label: 'בדיקת רישום קייטנה', emoji: '🔍', steps: ['שם ילד/ה', 'ת"ז'] },
  camp_check_id:         { label: 'בדיקת רישום קייטנה', emoji: '🔍', steps: ['שם ✓', 'ת"ז'] },
  camp_problem_desc:     { label: 'בעיה בהרשמה',        emoji: '⚠️', steps: ['תיאור הבעיה'] },
  camp_late_name:        { label: 'קייטנה (אחרי סגירה)', emoji: '🏕️', steps: ['שם ילד/ה', 'כיתה'] },
  camp_late_class:       { label: 'קייטנה (אחרי סגירה)', emoji: '🏕️', steps: ['שם ✓', 'כיתה'] },
  // ── איסוף מוקדם ──
  pickup_child:          { label: 'איסוף מוקדם',        emoji: '🚗', steps: ['שם ילד/ה', 'שעה', 'אוסף/ת'] },
  pickup_time:           { label: 'איסוף מוקדם',        emoji: '🚗', steps: ['שם ✓', 'שעה', 'אוסף/ת'] },
  pickup_collector:      { label: 'איסוף מוקדם',        emoji: '🚗', steps: ['שם ✓', 'שעה ✓', 'אוסף/ת'] },
  // ── כשל תשלום ──
  payment_fail_type:          { label: 'כשל תשלום',        emoji: '💳', steps: ['בחירת סוג', 'פרטים'] },
  payment_fail_schedule_call: { label: 'תיאום שיחה',        emoji: '📞', steps: ['זמן מועדף'] },
  payment_fail_method_choice: { label: 'שינוי אמצעי תשלום', emoji: '💳', steps: ['בחירת אמצעי'] },
  payment_fail_new_date:      { label: 'שינוי תאריך חיוב',  emoji: '📅', steps: ['תאריך חדש'] },
  payment_fail_remind_when:   { label: 'תזכורת לחזרה',      emoji: '🔔', steps: ['מתי לחזור'] },
  payment_fail_describe:      { label: 'בעיית תשלום',        emoji: '💳', steps: ['תיאור הבעיה'] },
}

const INTENT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  'רישום_צהרון':    { label: 'רישום צהרון',    color: '#6D436D', bg: '#e8d5e8' },
  'רישום_קייטנה':  { label: 'רישום קייטנה',   color: '#2A6B6B', bg: '#d5e8e8' },
  'ביטול':          { label: 'ביטול',           color: '#7d2d4a', bg: '#f5dde5' },
  'שאלת_לוז':       { label: 'שאלת לו"ז',       color: '#b45309', bg: '#fef3c7' },
  'בדיקת_תשלום':   { label: 'תשלום',            color: '#a05a4f', bg: '#fce9e6' },
  'כשל_תשלום':     { label: 'כשל תשלום',        color: '#7d2d4a', bg: '#f5dde5' },
  'כשל_תשלום_יזום':{ label: 'כשל תשלום (יזום)', color: '#7d2d4a', bg: '#f5dde5' },
  'איסוף_מוקדם':   { label: 'איסוף מוקדם',      color: '#854d0e', bg: '#fef9c3' },
  'בקשת_נציג':     { label: 'בקשת נציגה',       color: '#1d4ed8', bg: '#dbeafe' },
  'רשימת_המתנה':   { label: 'רשימת המתנה',       color: '#6b7280', bg: '#f3f4f6' },
  'שאלה_כללית':    { label: 'ברכה כללית',        color: '#78716c', bg: '#f5f5f4' },
  'לא_ידוע':       { label: 'לא זוהה',           color: '#9ca3af', bg: '#f9fafb' },
}

const QUICK_TESTS = [
  { label: '1 — רישום צהרון',  msg: '1' },
  { label: '2 — קייטנה',       msg: '2' },
  { label: '3 — ביטול',        msg: '3' },
  { label: '4 — שעות',         msg: '4' },
  { label: '5 — תשלום',        msg: '5' },
  { label: '6 — איסוף מוקדם', msg: '6' },
  { label: 'כשל תשלום',        msg: 'יש לי בעיה עם התשלום' },
  { label: 'כרטיס נכשל',       msg: 'הכרטיס שלי לא עבר' },
  { label: 'שאלת חגים',        msg: 'אילו חגים יש השנה?' },
  { label: 'לדבר עם נציגה',   msg: 'אני רוצה לדבר עם נציגה' },
]

interface SimMessage {
  role: 'user' | 'bot'
  text: string
  intent?: string
  isComplete?: boolean
  createdTask?: boolean
}

const WELCOME_MSG: SimMessage = {
  role: 'bot',
  text: 'שלום! 😊 כאן Kids & Fun!\n\n*1* — רישום לצהרון\n*2* — רישום לקייטנה\n*3* — ביטול\n*4* — שעות ולוח זמנים\n*5* — תשלומים\n*6* — איסוף מוקדם\n\nאו פשוט כתוב/י מה צריך 💬',
}
const SIM_STORAGE_KEY = 'kf_sim_state'

function loadSimState() {
  try {
    const raw = localStorage.getItem(SIM_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as {
      messages: SimMessage[]
      currentFlow: string | null
      collectedData: Record<string, string>
      lastIntent: string | null
      msgCount: number
      sessionId: string
      testPhone?: string
    }
  } catch { return null }
}

export function BotSimulator() {
  const saved = typeof window !== 'undefined' ? loadSimState() : null

  const [messages, setMessages] = useState<SimMessage[]>(saved?.messages ?? [WELCOME_MSG])
  const [input, setInput] = useState('')
  const [botLoading, setBotLoading] = useState(false)
  const [currentFlow, setCurrentFlow] = useState<string | null>(saved?.currentFlow ?? null)
  const [collectedData, setCollectedData] = useState<Record<string, string>>(saved?.collectedData ?? {})
  const [lastIntent, setLastIntent] = useState<string | null>(saved?.lastIntent ?? null)
  const [msgCount, setMsgCount] = useState(saved?.msgCount ?? 0)
  const chatRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef(saved?.sessionId ?? ('sim_' + Date.now()))
  // טלפון לבדיקה — מאפשר לדמות זיהוי הורה אמיתי בסימולטור (כמו בוואטסאפ)
  const [testPhone, setTestPhone] = useState<string>(saved?.testPhone ?? '')

  // persist state to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(SIM_STORAGE_KEY, JSON.stringify({
        messages, currentFlow, collectedData, lastIntent, msgCount,
        sessionId: sessionIdRef.current,
        testPhone,
      }))
    } catch { /* storage full or private mode */ }
  }, [messages, currentFlow, collectedData, lastIntent, msgCount, testPhone])

  // auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [messages, botLoading])

  const reset = () => {
    setMessages([WELCOME_MSG])
    setCurrentFlow(null)
    setCollectedData({})
    setLastIntent(null)
    setMsgCount(0)
    sessionIdRef.current = 'sim_' + Date.now()
    try { localStorage.removeItem(SIM_STORAGE_KEY) } catch { /* ignore */ }
    fetch('/api/bot/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '__reset__', sessionId: sessionIdRef.current, reset: true }),
    }).catch(() => {})
  }

  const sendMessage = async (text?: string) => {
    const userMsg = (text ?? input).trim()
    if (!userMsg || botLoading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setMsgCount(n => n + 1)
    setBotLoading(true)

    try {
      const res = await fetch('/api/bot/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          sessionId: sessionIdRef.current,
          // טלפון לבדיקה — מאפשר זיהוי הורה אמיתי בסימולטור (כמו בוואטסאפ)
          testPhone: testPhone || undefined,
          // מצב מהדפדפן — מאפשר לשרת לשחזר את ה-session אחרי רענון
          // (ב-Vercel הזיכרון של השרת מתאפס בין קריאות)
          clientState: {
            currentFlow,
            collectedData,
            messages: messages.slice(-10).map(m => ({ role: m.role, text: m.text })),
          },
        }),
      })
      const data = await res.json() as {
        reply?: string
        intent?: string
        currentFlow?: string | null
        collectedData?: Record<string, string>
        isComplete?: boolean
        createTask?: object | null
        escalate?: boolean
      }
      setMessages(prev => [...prev, {
        role: 'bot',
        text: data.reply || 'שגיאה בתשובה',
        intent: data.intent,
        isComplete: data.isComplete,
        createdTask: !!data.createTask,
      }])
      setCurrentFlow(data.currentFlow ?? null)
      setCollectedData(data.collectedData ?? {})
      if (data.intent) setLastIntent(data.intent)
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: 'שגיאה בחיבור לשרת' }])
    } finally {
      setBotLoading(false)
    }
  }

  const flowInfo = currentFlow ? FLOW_LABELS[currentFlow] : null
  const intentInfo = lastIntent ? INTENT_LABELS[lastIntent] : null
  const collectedEntries = Object.entries(collectedData).filter(([, v]) => v)

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:min-h-[580px]" dir="rtl">

      {/* ── Chat window ── */}
      <div className="flex-1 min-w-0 flex flex-col">

        {/* Header row */}
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-semibold" style={{ color: 'var(--crm-text)' }}>בוט פעיל</span>
            {msgCount > 0 && (
              <span className="text-xs rounded-full px-2 py-0.5" style={{ background: 'var(--crm-surface-soft)', color: 'var(--crm-text-muted)' }}>
                {msgCount} הודעות
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              placeholder="טלפון לבדיקה (אופציונלי)"
              className="text-xs px-3 py-1.5 rounded-full border border-crm-border w-44 focus:outline-none focus:border-[var(--crm-primary)]"
              title="הקלידי טלפון של הורה אמיתי כדי לדמות זיהוי בוואטסאפ (למשל 0546164546)"
            />
            <button
              onClick={reset}
              className="text-xs px-3 py-1.5 rounded-full font-medium hover:opacity-80 transition-opacity"
              style={{ background: 'var(--crm-surface-soft)', color: 'var(--crm-text-muted)' }}
            >
              🔄 התחל שיחה חדשה
            </button>
          </div>
        </div>

        {/* WhatsApp chat area */}
        <div className="flex-1 rounded-2xl overflow-hidden flex flex-col bg-[#E5DDD5]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23C4B9B0' fill-opacity='0.2'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>

          {/* WA header */}
          <div className="bg-[#128C7E] text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-green-600 flex items-center justify-center">🌟</div>
            <div>
              <p className="font-bold text-sm">Kids &amp; Fun</p>
              <p className="text-green-200 text-xs">{currentFlow ? `מסלול: ${flowInfo?.label ?? currentFlow}` : 'ממתין להודעה'}</p>
            </div>
          </div>

          {/* Messages */}
          <div ref={chatRef} className="flex-1 p-4 overflow-y-auto space-y-3" style={{ minHeight: 0, maxHeight: '420px' }}>
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm text-sm whitespace-pre-line ${
                    msg.role === 'user'
                      ? 'bg-[#DCF8C6] text-stone-800 rounded-tl-sm'
                      : 'bg-white text-stone-800 rounded-tr-sm'
                  }`}
                >
                  {msg.text}
                </div>
                {/* Intent tag on bot messages */}
                {msg.role === 'bot' && msg.intent && INTENT_LABELS[msg.intent] && (
                  <div className="flex items-center gap-1.5 mt-1 mx-1">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: INTENT_LABELS[msg.intent].bg, color: INTENT_LABELS[msg.intent].color }}
                    >
                      {INTENT_LABELS[msg.intent].label}
                    </span>
                    {msg.isComplete && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#dcfce7', color: '#15803d' }}>
                        ✓ מסלול הסתיים
                      </span>
                    )}
                    {msg.createdTask && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#fef3c7', color: '#b45309' }}>
                        📋 נוצרה משימה
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {botLoading && (
              <div className="flex justify-start">
                <div className="bg-white rounded-2xl px-4 py-3 shadow-sm text-stone-400 text-sm animate-pulse">מקלידה...</div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="bg-[#F0F0F0] p-3 flex items-center gap-2 flex-shrink-0">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="כתוב הודעה..."
              className="flex-1 bg-white rounded-full px-4 py-2.5 text-sm focus:outline-none text-right"
              dir="rtl"
            />
            <button
              onClick={() => sendMessage()}
              disabled={botLoading || !input.trim()}
              className="bg-[#128C7E] hover:bg-[#0e7268] disabled:opacity-50 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Quick test chips */}
        <div className="mt-3">
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--crm-text)', opacity: 0.5 }}>בדיקות מהירות:</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_TESTS.map(t => (
              <button
                key={t.label}
                onClick={() => sendMessage(t.msg)}
                disabled={botLoading}
                className="text-xs px-3 py-1.5 rounded-full font-medium border transition-all hover:opacity-80 disabled:opacity-40"
                style={{ background: '#FAF5EE', color: 'var(--crm-text)', borderColor: '#e8c4d0' }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Debug / Status panel ── */}
      <div className="w-full lg:w-64 flex-shrink-0 space-y-4">

        {/* Current flow */}
        <div className="rounded-2xl border border-crm-border p-4" style={{ background: 'var(--crm-surface)' }}>
          <p className="text-xs font-bold mb-3 uppercase tracking-wide" style={{ color: 'var(--crm-text-muted)' }}>מסלול נוכחי</p>
          {currentFlow && flowInfo ? (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{flowInfo.emoji}</span>
                <span className="text-sm font-bold" style={{ color: 'var(--crm-primary)' }}>{flowInfo.label}</span>
              </div>
              <div className="space-y-1.5">
                {flowInfo.steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs" style={{ color: step.includes('✓') ? '#15803d' : 'var(--crm-text-muted)' }}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${step.includes('✓') ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                      {step.includes('✓') ? '✓' : i + 1}
                    </span>
                    {step.replace(' ✓', '')}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-3">
              <div className="text-2xl mb-1">💬</div>
              <p className="text-xs" style={{ color: 'var(--crm-text-muted)' }}>אין מסלול פעיל</p>
            </div>
          )}
        </div>

        {/* Collected data */}
        <div className="rounded-2xl border border-crm-border p-4" style={{ background: 'var(--crm-surface)' }}>
          <p className="text-xs font-bold mb-3 uppercase tracking-wide" style={{ color: 'var(--crm-text-muted)' }}>נתונים שנאספו</p>
          {collectedEntries.length > 0 ? (
            <div className="space-y-2">
              {collectedEntries.map(([key, val]) => (
                <div key={key} className="flex flex-col">
                  <span className="text-xs" style={{ color: 'var(--crm-text-muted)' }}>
                    {key === 'child_name' ? 'שם ילד/ה' : key === 'class_name' ? 'כיתה' : key === 'parent_phone' ? 'טלפון' : key}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--crm-text)' }}>{val}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-center py-2" style={{ color: 'var(--crm-text-muted)' }}>עדיין לא נאספו נתונים</p>
          )}
        </div>

        {/* Intent */}
        {intentInfo && (
          <div className="rounded-2xl border border-crm-border p-4" style={{ background: 'var(--crm-surface)' }}>
            <p className="text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: 'var(--crm-text-muted)' }}>כוונה אחרונה</p>
            <span
              className="text-xs px-3 py-1 rounded-full font-semibold"
              style={{ background: intentInfo.bg, color: intentInfo.color }}
            >
              {intentInfo.label}
            </span>
          </div>
        )}

        {/* Flow map */}
        <div className="rounded-2xl border p-4" style={{ background: '#FAF5EE', borderColor: '#e8c4d0' }}>
          <p className="text-xs font-bold mb-3 uppercase tracking-wide" style={{ color: 'var(--crm-text-muted)' }}>מסלולים זמינים</p>
          <div className="space-y-1.5 text-xs" style={{ color: 'var(--crm-text-muted)' }}>
            {[
              { e: '🎒', t: 'רישום לצהרון', k: '1' },
              { e: '🏕️', t: 'רישום לקייטנה', k: '2' },
              { e: '❌', t: 'ביטול', k: '3' },
              { e: '📅', t: 'שעות ולו"ז', k: '4' },
              { e: '💳', t: 'תשלום / כשל', k: '5' },
              { e: '🚗', t: 'איסוף מוקדם', k: '6' },
            ].map(f => (
              <div key={f.k} className="flex items-center gap-2">
                <span>{f.e}</span>
                <span>{f.t}</span>
                <span className="mr-auto font-mono opacity-50">{f.k}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
