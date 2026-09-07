'use client'

import { useState, useEffect } from 'react'

// =========================================
// TestPhonesManager — ניהול מספרי בדיקה (מי מקבל את הבוט)
// אייל/עינת יכולים להוסיף/להסיר מספרים בקליק, בלי קוד ובלי פריסה.
// =========================================

// שמות ידועים למספרי הבסיס הקבועים (לתצוגה בלבד)
const KNOWN_LABELS: Record<string, string> = {
  '972544535688': 'עינת',
  '972546603344': 'בדיקה',
  '972546102262': 'קורלי',
  '972544487290': 'אייבי',
}

const fmt = (intl: string) => '0' + intl.replace(/^972/, '') // 972.. → 0..

export function TestPhonesManager() {
  const [base, setBase] = useState<string[]>([])
  const [extra, setExtra] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const res = await fetch('/api/admin/test-phones')
      const data = await res.json()
      if (data.success) { setBase(data.base ?? []); setExtra(data.extra ?? []) }
    } catch { /* ignore */ } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const add = async () => {
    const p = input.trim()
    if (!p) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/test-phones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: p }),
      })
      const data = await res.json()
      if (data.success) {
        setExtra(data.extra ?? [])
        setInput('')
        setMsg(`✅ ${p} נוסף — עכשיו הבוט יגיב למספר הזה.`)
      } else {
        setMsg(`❌ ${data.error || 'שגיאה'}`)
      }
    } catch {
      setMsg('❌ שגיאת תקשורת — נסי שוב')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (intl: string) => {
    if (!confirm(`להסיר את ${fmt(intl)} מרשימת הבדיקה?\n\nאחרי ההסרה הבוט יפסיק להגיב למספר הזה (הוא ייחשב "הורה אמיתי" והבוט ישתוק).`)) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/test-phones', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: intl }),
      })
      const data = await res.json()
      if (data.success) { setExtra(data.extra ?? []); setMsg(`המספר ${fmt(intl)} הוסר.`) }
      else setMsg(`❌ ${data.error || 'שגיאה'}`)
    } catch {
      setMsg('❌ שגיאת תקשורת — נסי שוב')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-crm-surface rounded-crm border-2 p-6" style={{ borderColor: '#bbe0bb' }}>
      <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--crm-primary)' }}>📱 מספרי בדיקה — מי מקבל את הבוט</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--crm-text)', opacity: 0.75 }}>
        רק מספרים ברשימה הזו מקבלים תשובה מהבוט. כל מספר אחר — הבוט <b>שותק</b> בכוונה (הגנה על הורים אמיתיים בשלב הבדיקות).
        כדי לתת למישהו לבדוק את הבוט — הוסיפי כאן את המספר שלו.
      </p>

      {/* הוספה */}
      <div className="flex gap-2 mb-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="מספר להוספה (למשל 0501234567)"
          className="flex-1 px-4 py-2.5 rounded-xl border border-crm-border text-sm focus:outline-none focus:border-[var(--crm-primary)]"
          dir="rtl"
          inputMode="tel"
        />
        <button
          onClick={add}
          disabled={busy || !input.trim()}
          className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: 'var(--crm-primary)' }}
        >
          {busy ? '…' : '+ הוסף מספר'}
        </button>
      </div>
      {msg && <p className="text-sm mb-3 font-medium" style={{ color: 'var(--crm-text)' }}>{msg}</p>}

      {/* רשימה */}
      {loading ? (
        <p className="text-sm mt-3" style={{ color: 'var(--crm-text-muted)' }}>טוען…</p>
      ) : (
        <div className="space-y-2 mt-3">
          {base.map(p => (
            <div key={p} className="flex items-center justify-between px-4 py-2.5 rounded-xl" style={{ background: 'var(--crm-surface-soft)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--crm-text)' }}>
                {fmt(p)}{KNOWN_LABELS[p] ? ` · ${KNOWN_LABELS[p]}` : ''}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: '#eceae4', color: '#8a8a8a' }} title="מספר קבוע בקוד — לא ניתן להסרה מכאן">קבוע 🔒</span>
            </div>
          ))}
          {extra.map(p => (
            <div key={p} className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-crm-border">
              <span className="text-sm font-medium" style={{ color: 'var(--crm-text)' }}>{fmt(p)}</span>
              <button
                onClick={() => remove(p)}
                disabled={busy}
                className="text-xs px-3 py-1 rounded-full font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ background: '#fde2e2', color: '#b91c1c' }}
              >
                הסר
              </button>
            </div>
          ))}
          {extra.length === 0 && (
            <p className="text-xs text-center py-2" style={{ color: 'var(--crm-text-muted)' }}>
              אין מספרים נוספים — רק הקבועים למעלה. הוסיפי מספר בשדה שלמעלה.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
