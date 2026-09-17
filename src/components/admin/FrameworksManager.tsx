'use client'

// ─── ניהול מסגרות (גנים ובתי"ס) ──────────────────────────────────────────────
// CRUD מלא: הוספה, עריכת שם/מחיר/קיבולת, כיבוי/הפעלה. הבוט קורא מכאן מחיר לפי
// מסגרת וקיבולת. מסגרת מכובה (is_active=false) נעלמת מהבוט אך נשמרת (היסטוריה).
import { useEffect, useState } from 'react'

interface SchoolRow {
  id: string
  name: string
  area_code: string
  area_label: string
  city: string | null
  monthly_price: number | null
  max_capacity: number | null
  is_active: boolean
  registered: number
}

interface Edit { name: string; price: string; capacity: string }

const AREAS = [
  { code: 'sharon',  label: 'דרום השרון / חוף השרון' },
  { code: 'carmel',  label: 'חוף הכרמל' },
  { code: 'telaviv', label: 'גני תל אביב' },
]

const C = { ink: '#3d2b1f', text: '#5E4B35', muted: '#9A7B6B', accent: '#6D436D', border: '#E0CCB3', ok: '#7BA05B' }

export function FrameworksManager() {
  const [rows, setRows] = useState<SchoolRow[]>([])
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', area_code: 'sharon', price: '', capacity: '' })
  const [adding, setAdding] = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/admin/schools')
      .then(r => r.json())
      .then(d => {
        if (!d.success) { setError(d.error || 'שגיאה בטעינה'); return }
        const list: SchoolRow[] = d.schools || []
        setRows(list)
        const init: Record<string, Edit> = {}
        list.forEach(s => { init[s.id] = {
          name: s.name,
          price: s.monthly_price == null ? '' : String(s.monthly_price),
          capacity: s.max_capacity == null ? '' : String(s.max_capacity),
        } })
        setEdits(init)
      })
      .catch(() => setError('שגיאה בטעינה'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const flashSaved = (id: string) => { setSaved(id); setTimeout(() => setSaved(s => s === id ? null : s), 1600) }

  const saveRow = async (s: SchoolRow) => {
    const e = edits[s.id]
    setBusy(s.id); setError('')
    try {
      const res = await fetch('/api/admin/schools', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id, name: e.name.trim(), monthly_price: e.price, max_capacity: e.capacity }),
      })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'שמירה נכשלה')
      setRows(prev => prev.map(r => r.id === s.id ? {
        ...r, name: e.name.trim(),
        monthly_price: e.price === '' ? null : Number(e.price),
        max_capacity: e.capacity === '' ? null : Number(e.capacity),
      } : r))
      flashSaved(s.id)
    } catch (err) { setError(err instanceof Error ? err.message : 'שמירה נכשלה') }
    finally { setBusy(null) }
  }

  const toggleActive = async (s: SchoolRow) => {
    setBusy(s.id); setError('')
    try {
      const res = await fetch('/api/admin/schools', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id, is_active: !s.is_active }),
      })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'עדכון נכשל')
      setRows(prev => prev.map(r => r.id === s.id ? { ...r, is_active: !s.is_active } : r))
    } catch (err) { setError(err instanceof Error ? err.message : 'עדכון נכשל') }
    finally { setBusy(null) }
  }

  const addSchool = async () => {
    if (!addForm.name.trim()) { setError('שם המסגרת נדרש'); return }
    setAdding(true); setError('')
    try {
      const res = await fetch('/api/admin/schools', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name.trim(), area_code: addForm.area_code,
          monthly_price: addForm.price, max_capacity: addForm.capacity,
        }),
      })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.error || 'הוספה נכשלה')
      setAddForm({ name: '', area_code: addForm.area_code, price: '', capacity: '' })
      setShowAdd(false)
      load()
    } catch (err) { setError(err instanceof Error ? err.message : 'הוספה נכשלה') }
    finally { setAdding(false) }
  }

  const setEdit = (id: string, k: keyof Edit, v: string) =>
    setEdits(p => ({ ...p, [id]: { ...p[id], [k]: k === 'name' ? v : v.replace(/[^\d]/g, '') } }))

  const dirty = (s: SchoolRow) => {
    const e = edits[s.id]; if (!e) return false
    return e.name.trim() !== s.name
      || e.price !== (s.monthly_price == null ? '' : String(s.monthly_price))
      || e.capacity !== (s.max_capacity == null ? '' : String(s.max_capacity))
  }

  const byArea: Record<string, { label: string; items: SchoolRow[] }> = {}
  for (const s of rows) {
    if (!byArea[s.area_code]) byArea[s.area_code] = { label: s.area_label, items: [] }
    byArea[s.area_code].items.push(s)
  }

  if (loading) return <p className="text-sm" style={{ color: C.muted }}>טוען…</p>

  return (
    <div dir="rtl">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold" style={{ color: C.ink }}>מסגרות (גנים ובתי״ס)</h2>
          <p className="text-sm mt-1" style={{ color: C.muted }}>
            הוספה, עריכת מחיר וקיבולת, וכיבוי מסגרות. הבוט מתמחר לפי המחיר שכאן.
            השאירו מחיר ריק = הבוט מפנה לנציגה לתמחור. קיבולת ריקה = ללא הגבלה ייעודית.
          </p>
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          className="text-sm font-semibold px-4 py-2 rounded-full text-white shrink-0"
          style={{ background: C.accent }}>
          {showAdd ? 'ביטול' : '+ הוספת מסגרת'}
        </button>
      </div>

      {error && <p className="text-sm mb-3 font-medium" style={{ color: '#B91C1C' }}>{error}</p>}

      {showAdd && (
        <div className="rounded-xl border p-4 mb-5" style={{ borderColor: C.border, background: '#FCF8F1' }}>
          <p className="font-bold text-sm mb-3" style={{ color: C.ink }}>מסגרת חדשה</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm" style={{ color: C.text }}>
              שם המסגרת
              <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                placeholder='למשל: גן רימון' className="fm-in mt-1" />
            </label>
            <label className="text-sm" style={{ color: C.text }}>
              אזור
              <select value={addForm.area_code} onChange={e => setAddForm(f => ({ ...f, area_code: e.target.value }))}
                className="fm-in mt-1">
                {AREAS.map(a => <option key={a.code} value={a.code}>{a.label}</option>)}
              </select>
            </label>
            <label className="text-sm" style={{ color: C.text }}>
              מחיר חודשי (₪) — אופציונלי
              <input value={addForm.price} onChange={e => setAddForm(f => ({ ...f, price: e.target.value.replace(/[^\d]/g, '') }))}
                inputMode="numeric" placeholder="ריק = נציגה מתמחרת" className="fm-in mt-1" />
            </label>
            <label className="text-sm" style={{ color: C.text }}>
              קיבולת מקסימלית — אופציונלי
              <input value={addForm.capacity} onChange={e => setAddForm(f => ({ ...f, capacity: e.target.value.replace(/[^\d]/g, '') }))}
                inputMode="numeric" placeholder="ריק = ללא הגבלה" className="fm-in mt-1" />
            </label>
          </div>
          <button onClick={addSchool} disabled={adding}
            className="mt-3 text-sm font-semibold px-5 py-2 rounded-full text-white disabled:opacity-50"
            style={{ background: C.accent }}>
            {adding ? 'מוסיף…' : 'הוספה'}
          </button>
        </div>
      )}

      {AREAS.filter(a => byArea[a.code]).map(a => (
        <div key={a.code} className="mb-6">
          <h3 className="text-sm font-bold mb-2 px-1" style={{ color: C.accent }}>{byArea[a.code].label}</h3>
          <div className="grid gap-2">
            {byArea[a.code].items.map(s => (
              <div key={s.id} className="rounded-xl border p-3" style={{ borderColor: C.border, background: s.is_active ? '#fff' : '#F5F0E8', opacity: s.is_active ? 1 : 0.7 }}>
                <div className="flex items-end gap-3 flex-wrap">
                  <label className="text-xs flex-1 min-w-[150px]" style={{ color: C.muted }}>
                    שם
                    <input value={edits[s.id]?.name ?? ''} onChange={e => setEdit(s.id, 'name', e.target.value)}
                      className="fm-in mt-0.5" style={{ fontWeight: 600, color: C.text }} />
                  </label>
                  <label className="text-xs" style={{ color: C.muted }}>
                    מחיר ₪
                    <input value={edits[s.id]?.price ?? ''} onChange={e => setEdit(s.id, 'price', e.target.value)}
                      inputMode="numeric" placeholder="נציגה" className="fm-in fm-sm mt-0.5" />
                  </label>
                  <label className="text-xs" style={{ color: C.muted }}>
                    קיבולת
                    <input value={edits[s.id]?.capacity ?? ''} onChange={e => setEdit(s.id, 'capacity', e.target.value)}
                      inputMode="numeric" placeholder="∞" className="fm-in fm-sm mt-0.5" />
                  </label>
                  <div className="flex items-center gap-2 pb-0.5">
                    <button onClick={() => saveRow(s)} disabled={!dirty(s) || busy === s.id}
                      className="text-xs font-semibold px-3 py-2 rounded-full text-white transition-opacity"
                      style={{ background: saved === s.id ? C.ok : C.accent, opacity: (!dirty(s) || busy === s.id) ? 0.45 : 1 }}>
                      {busy === s.id ? '…' : saved === s.id ? '✓ נשמר' : 'שמירה'}
                    </button>
                    <button onClick={() => toggleActive(s)} disabled={busy === s.id}
                      className="text-xs font-semibold px-3 py-2 rounded-full border transition-colors"
                      style={{ borderColor: C.border, color: s.is_active ? '#B45309' : C.ok, background: '#fff' }}>
                      {s.is_active ? 'כיבוי' : 'הפעלה'}
                    </button>
                  </div>
                </div>
                <p className="text-xs mt-1.5" style={{ color: C.muted }}>
                  רשומים בפועל: <b style={{ color: C.text }}>{s.registered}</b>
                  {s.max_capacity != null ? ` / ${s.max_capacity}` : ' · ללא הגבלה'}
                  {!s.is_active && <span style={{ color: '#B45309', fontWeight: 700 }}> · מוסתר מהבוט</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}

      <style jsx>{`
        :global(.fm-in) {
          display: block; width: 100%;
          border: 1px solid ${C.border}; border-radius: 0.6rem;
          padding: 0.45rem 0.65rem; font-size: 0.9rem; background: #fff; color: ${C.text};
        }
        :global(.fm-in.fm-sm) { width: 5.5rem; text-align: center; }
        :global(.fm-in:focus) { outline: none; border-color: ${C.accent}; }
      `}</style>
    </div>
  )
}
