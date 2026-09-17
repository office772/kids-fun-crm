'use client'

// ─── הגדרות מערכת (עריכה אמיתית) ──────────────────────────────────────────────
// מציג *רק* הגדרות שהבוט באמת קורא (שעות פעילות + מחיר ברירת מחדל), עם שמירה
// אמיתית ל-/api/admin/settings. אין כאן שדות מדומים או סודות — מפתחות סליקה חיים
// ב-env, וניסוחי הבוט/מסגרות נערכים בלשוניות/מסכים הייעודיים.
import { useEffect, useState } from 'react'
import { Info, Check, Loader2 } from 'lucide-react'

const DAYS = [
  { n: 0, label: 'ראשון' }, { n: 1, label: 'שני' }, { n: 2, label: 'שלישי' },
  { n: 3, label: 'רביעי' }, { n: 4, label: 'חמישי' }, { n: 5, label: 'שישי' },
  { n: 6, label: 'שבת' },
]

// ברירות מחדל = בדיוק הקשיח בקוד (א-ה, 8-17, 799) — כך המסך משקף את מצב הבוט.
const FALLBACK = { start: '8', end: '17', days: '0,1,2,3,4', fee: '799' }

interface State { start: string; end: string; days: string; fee: string }

export function SystemSettings() {
  const [values, setValues]   = useState<State>(FALLBACK)
  const [initial, setInitial] = useState<State>(FALLBACK)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res  = await fetch('/api/admin/settings')
        const json = await res.json()
        if (cancelled) return
        const s = (json?.settings || {}) as Record<string, string>
        const next: State = {
          start: s.business_hours_start || FALLBACK.start,
          end:   s.business_hours_end   || FALLBACK.end,
          days:  s.business_days        || FALLBACK.days,
          fee:   s.default_monthly_fee  || FALLBACK.fee,
        }
        setValues(next)
        setInitial(next)
      } catch {
        if (!cancelled) setError('לא הצלחנו לטעון את ההגדרות. רעננו את הדף ונסו שוב.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const dirty = (Object.keys(values) as (keyof State)[]).some(k => values[k] !== initial[k])

  const activeDays = values.days.split(',').map(d => parseInt(d.trim(), 10)).filter(n => !isNaN(n))
  const toggleDay = (n: number) => {
    const has = activeDays.includes(n)
    const next = (has ? activeDays.filter(d => d !== n) : [...activeDays, n]).sort((a, b) => a - b)
    setValues(prev => ({ ...prev, days: next.join(',') }))
    setSaved(false)
  }
  const setNum = (k: 'start' | 'end' | 'fee', v: string) => {
    setValues(prev => ({ ...prev, [k]: v.replace(/[^\d]/g, '') }))
    setSaved(false)
  }

  const save = async () => {
    setSaving(true); setError(''); setSaved(false)

    // ולידציה קלה: שעות 0-23, פתיחה < סגירה, לפחות יום אחד, מחיר > 0.
    const start = parseInt(values.start, 10), end = parseInt(values.end, 10), fee = parseInt(values.fee, 10)
    if (isNaN(start) || isNaN(end) || start < 0 || start > 23 || end < 0 || end > 24 || start >= end) {
      setSaving(false); setError('שעות לא תקינות — הפתיחה חייבת להיות קטנה מהסגירה (0–24).'); return
    }
    if (!activeDays.length) { setSaving(false); setError('בחרו לפחות יום פעילות אחד.'); return }
    if (isNaN(fee) || fee <= 0) { setSaving(false); setError('מחיר ברירת מחדל חייב להיות מספר חיובי.'); return }

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: {
          business_hours_start: values.start,
          business_hours_end:   values.end,
          business_days:        values.days,
          default_monthly_fee:  values.fee,
        } }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'שמירה נכשלה')
      setInitial(values); setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 justify-center" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
        <Loader2 size={18} className="animate-spin" /> טוען…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border p-4 flex items-start gap-3" style={{ background: '#EEF6FF', borderColor: '#BBD8F5' }}>
        <Info size={20} color="#1E5A9E" className="flex-shrink-0 mt-0.5" />
        <div className="text-sm leading-relaxed" style={{ color: '#1E3A5F' }}>
          <p className="font-bold mb-0.5">מה נשמר כאן משפיע ישירות על הבוט</p>
          <p>
            <b>שעות ימי הפעילות</b> קובעות מתי הבוט מפנה לנציגה מחוץ לשעות.
            <b> מחיר ברירת המחדל</b> משמש רק כשאי אפשר לתמחר לפי מסגרת (כמעט אף פעם).
            מחירים לפי גן/בי״ס, מסגרות וניסוחי הודעות נערכים במסכים הייעודיים.
          </p>
        </div>
      </div>

      {/* שעות פעילות */}
      <div>
        <label className="block font-bold text-sm mb-1" style={{ color: 'var(--crm-text)' }}>שעות פעילות</label>
        <p className="text-xs mb-2" style={{ color: 'var(--crm-text)', opacity: 0.55 }}>
          השעות בהן נציגה זמינה. מחוץ להן הבוט מודיע שנחזור בשעות הפעילות.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--crm-text)', opacity: 0.7 }}>משעה</span>
            <input type="text" inputMode="numeric" value={values.start} onChange={e => setNum('start', e.target.value)} className="crm-input-sm" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--crm-text)', opacity: 0.7 }}>עד שעה</span>
            <input type="text" inputMode="numeric" value={values.end} onChange={e => setNum('end', e.target.value)} className="crm-input-sm" />
          </div>
          <span className="text-xs" style={{ color: 'var(--crm-text)', opacity: 0.5 }}>(בפורמט 24 שעות, למשל 8 עד 17)</span>
        </div>
      </div>

      {/* ימי פעילות */}
      <div>
        <label className="block font-bold text-sm mb-1" style={{ color: 'var(--crm-text)' }}>ימי פעילות</label>
        <p className="text-xs mb-2" style={{ color: 'var(--crm-text)', opacity: 0.55 }}>בחרו את הימים בהם הצהרון פעיל.</p>
        <div className="flex gap-2 flex-wrap">
          {DAYS.map(d => {
            const on = activeDays.includes(d.n)
            return (
              <button
                key={d.n} onClick={() => toggleDay(d.n)}
                className="px-3 py-1.5 rounded-full text-sm font-semibold transition-all"
                style={on
                  ? { background: 'var(--crm-primary)', color: '#fff' }
                  : { background: '#fff', color: 'var(--crm-text)', border: '1px solid var(--crm-border)', opacity: 0.7 }}
              >
                {d.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* מחיר ברירת מחדל */}
      <div>
        <label className="block font-bold text-sm mb-1" style={{ color: 'var(--crm-text)' }}>מחיר צהרון — ברירת מחדל (₪)</label>
        <p className="text-xs mb-2" style={{ color: 'var(--crm-text)', opacity: 0.55 }}>
          נפילה אחרונה בלבד — כשאי אפשר לתמחר לפי המסגרת. המחיר הרגיל נקבע לפי הגן/בי״ס.
        </p>
        <input type="text" inputMode="numeric" value={values.fee} onChange={e => setNum('fee', e.target.value)} className="crm-input-sm" style={{ width: '8rem' }} />
      </div>

      {error && <p className="text-sm font-medium" style={{ color: '#B91C1C' }}>{error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save} disabled={saving || !dirty}
          className="px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--crm-primary)', color: '#fff' }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          {saving ? 'שומר…' : 'שמירה'}
        </button>
        {saved && !dirty && (
          <span className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#15803D' }}>
            <Check size={16} /> נשמר בהצלחה
          </span>
        )}
        {dirty && !saving && (
          <span className="text-sm" style={{ color: 'var(--crm-text)', opacity: 0.55 }}>יש שינויים שלא נשמרו</span>
        )}
      </div>

      <style jsx>{`
        :global(.crm-input-sm) {
          border: 1px solid var(--crm-border, #e5e7eb);
          border-radius: 0.6rem;
          padding: 0.45rem 0.7rem;
          font-size: 0.95rem;
          background: #fff;
          color: var(--crm-text, #1f2937);
          width: 5rem;
          text-align: center;
        }
        :global(.crm-input-sm:focus) { outline: none; border-color: var(--crm-primary, #d97706); }
      `}</style>
    </div>
  )
}
