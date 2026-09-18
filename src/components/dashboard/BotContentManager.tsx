'use client'

// ─── עריכת טקסט הודעות הבוט (טקסט בלבד, משתנים נעולים) ────────────────────────
// עריכה אמיתית של ההודעות הקבועות. המשתנים ({שם}, {אזור}...) נעולים — הבוט ממלא
// אותם. שמירה ל-/api/admin/bot-messages (עם ולידציית משתנים בצד השרת גם כן).
import { useEffect, useState } from 'react'
import { Info, Check, Loader2, RotateCcw } from 'lucide-react'

interface Message {
  key: string; label: string; category: string; vars: string[]
  default: string; text: string; is_active: boolean; overridden: boolean
}

// חילוץ {משתנים} מטקסט (מראה בצד לקוח את מה שהשרת אוכף).
function placeholders(text: string): string[] {
  const out: string[] = []
  const re = /\{([^}]+)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text || '')) !== null) {
    const t = m[1].trim()
    if (!out.includes(t)) out.push(t)
  }
  return out
}
function varsOk(text: string, required: string[]): boolean {
  const found = placeholders(text)
  return found.length === required.length && required.every(v => found.includes(v))
}

export function BotContentManager() {
  const [messages, setMessages] = useState<Message[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    fetch('/api/admin/bot-messages')
      .then(r => r.json())
      .then(d => {
        if (!d.success) { setError(d.error || 'שגיאה בטעינה'); return }
        const list: Message[] = d.messages || []
        setMessages(list)
        setDrafts(Object.fromEntries(list.map(m => [m.key, m.text])))
      })
      .catch(() => setError('שגיאה בטעינה'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const save = async (m: Message) => {
    const text = drafts[m.key] ?? ''
    if (!varsOk(text, m.vars)) {
      setError(m.vars.length
        ? `בהודעה "${m.label}" חובה לשמור בדיוק את המשתנים: ${m.vars.map(v => `{${v}}`).join(' ')}.`
        : `בהודעה "${m.label}" אין משתנים — אל תוסיפו {…}.`)
      return
    }
    setBusy(m.key); setError('')
    try {
      const res = await fetch('/api/admin/bot-messages', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: m.key, text, is_active: true }),
      })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'שמירה נכשלה')
      setMessages(d.messages || messages)
      setSaved(m.key); setTimeout(() => setSaved(s => s === m.key ? null : s), 1600)
    } catch (err) { setError(err instanceof Error ? err.message : 'שמירה נכשלה') }
    finally { setBusy(null) }
  }

  const resetToDefault = (m: Message) => {
    setDrafts(p => ({ ...p, [m.key]: m.default }))
    setError('')
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 justify-center" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
        <Loader2 size={18} className="animate-spin" /> טוען…
      </div>
    )
  }

  const categories = Array.from(new Set(messages.map(m => m.category)))

  return (
    <div className="space-y-5">
      <div className="rounded-xl border p-4 flex items-start gap-3" style={{ background: '#EEF6FF', borderColor: '#BBD8F5' }}>
        <Info size={20} color="#1E5A9E" className="flex-shrink-0 mt-0.5" />
        <div className="text-sm leading-relaxed" style={{ color: '#1E3A5F' }}>
          <p className="font-bold mb-0.5">עריכת הודעות הבוט</p>
          <p>
            ערכו את <b>הטקסט</b> של ההודעות שהבוט שולח. את <b>המשתנים בסוגריים מסולסלים</b> (כמו
            <span className="mx-1 px-1.5 py-0.5 rounded font-mono text-xs" style={{ background: '#DCEAFB' }}>{'{אזור}'}</span>)
            הבוט ממלא לבד — השאירו אותם בדיוק כמו שהם. שינוי/מחיקה של משתנה לא יישמר.
          </p>
        </div>
      </div>

      {error && <p className="text-sm font-medium" style={{ color: '#B91C1C' }}>{error}</p>}

      {categories.map(cat => (
        <div key={cat}>
          <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--crm-primary)' }}>{cat}</h3>
          <div className="space-y-3">
            {messages.filter(m => m.category === cat).map(m => {
              const text = drafts[m.key] ?? ''
              const dirty = text !== m.text
              const invalid = !varsOk(text, m.vars)
              return (
                <div key={m.key} className="rounded-xl border p-4" style={{ background: '#fff', borderColor: '#f0e9e0' }}>
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <p className="font-semibold text-sm" style={{ color: 'var(--crm-text)' }}>{m.label}</p>
                    {m.vars.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs" style={{ color: 'var(--crm-text)', opacity: 0.5 }}>משתנים נעולים:</span>
                        {m.vars.map(v => (
                          <span key={v} className="px-1.5 py-0.5 rounded font-mono text-xs" style={{ background: '#F1EAF1', color: '#6D436D' }}>{`{${v}}`}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <textarea
                    value={text}
                    onChange={e => { setDrafts(p => ({ ...p, [m.key]: e.target.value })); setError('') }}
                    rows={Math.min(8, Math.max(2, text.split('\n').length))}
                    dir="rtl"
                    className="w-full rounded-lg border px-3 py-2 text-sm leading-relaxed"
                    style={{ borderColor: invalid ? '#E4B4B4' : '#e5e7eb', color: 'var(--crm-text)', fontFamily: 'inherit' }}
                  />
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <button onClick={() => save(m)} disabled={busy === m.key || !dirty || invalid}
                      className="px-4 py-1.5 rounded-full text-sm font-bold text-white transition-all flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed"
                      style={{ background: saved === m.key ? '#15803D' : 'var(--crm-primary)' }}>
                      {busy === m.key ? <Loader2 size={14} className="animate-spin" /> : saved === m.key ? <Check size={14} /> : null}
                      {busy === m.key ? 'שומר…' : saved === m.key ? 'נשמר' : 'שמירה'}
                    </button>
                    {text !== m.default && (
                      <button onClick={() => resetToDefault(m)}
                        className="text-xs flex items-center gap-1 transition-colors" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
                        <RotateCcw size={13} /> שחזור לברירת מחדל
                      </button>
                    )}
                    {invalid && <span className="text-xs font-medium" style={{ color: '#B91C1C' }}>המשתנים לא תואמים — לא ניתן לשמור</span>}
                    {dirty && !invalid && busy !== m.key && saved !== m.key && (
                      <span className="text-xs" style={{ color: 'var(--crm-text)', opacity: 0.5 }}>שינוי לא שמור</span>
                    )}
                    {m.overridden && !dirty && (
                      <span className="text-xs" style={{ color: 'var(--crm-text)', opacity: 0.45 }}>· ערוך (שונה מברירת המחדל)</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <p className="text-xs pt-2" style={{ color: 'var(--crm-text)', opacity: 0.5 }}>
        כאן כל הודעות הבוט הקבועות, מקובצות לפי נושא. תשובות פתוחות (חופשיות) נשלטות דרך "קול הבוט" בהגדרות.
      </p>
    </div>
  )
}
