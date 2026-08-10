'use client'

import { useEffect, useState } from 'react'

interface SchoolRow {
  id: string
  name: string
  area_code: string
  area_label: string
  max_capacity: number | null
  registered: number
}

// ─── קיבולת לפי מסגרת/גן ─────────────────────────────────────────────────────
// פירוט לכל בי"ס/גן: כמה רשומים בפועל, וכמה מקסימום מותר. ריק = ללא הגבלה ייעודית.
export function SchoolCapacitySettings() {
  const [rows, setRows] = useState<SchoolRow[]>([])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/admin/school-capacity')
      .then(r => r.json())
      .then(d => {
        const list: SchoolRow[] = d.schools || []
        setRows(list)
        const init: Record<string, string> = {}
        list.forEach(s => { init[s.id] = s.max_capacity == null ? '' : String(s.max_capacity) })
        setEdits(init)
      })
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const save = async (id: string) => {
    setSaving(id)
    try {
      const raw = edits[id]
      const res = await fetch('/api/admin/school-capacity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, max_capacity: raw === '' ? null : Number(raw) }),
      })
      if (!res.ok) { alert('שגיאה בשמירה'); return }
      setRows(prev => prev.map(s => s.id === id ? { ...s, max_capacity: raw === '' ? null : Number(raw) } : s))
      setSaved(id); setTimeout(() => setSaved(null), 1500)
    } finally { setSaving(null) }
  }

  // קיבוץ לפי אזור
  const byArea: Record<string, { label: string; items: SchoolRow[] }> = {}
  for (const s of rows) {
    if (!byArea[s.area_code]) byArea[s.area_code] = { label: s.area_label, items: [] }
    byArea[s.area_code].items.push(s)
  }

  if (loading) return <p className="text-sm" style={{ color: '#9A7B6B' }}>טוען…</p>

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h2 className="text-xl font-bold" style={{ color: '#3d2b1f' }}>קיבולת לפי מסגרת / גן</h2>
        <p className="text-sm mt-1" style={{ color: '#9A7B6B' }}>
          קבעי מקסימום נרשמים לכל בי"ס/גן. השאירי ריק = ללא הגבלה ייעודית (חלה מגבלת האזור בלבד).
        </p>
      </div>

      {Object.entries(byArea).map(([code, group]) => (
        <div key={code} className="mb-6">
          <h3 className="text-sm font-bold mb-2 px-1" style={{ color: '#6D436D' }}>{group.label}</h3>
          <div className="grid gap-2">
            {group.items.map(s => {
              const max = s.max_capacity
              const pct = max && max > 0 ? Math.min(100, Math.round((s.registered / max) * 100)) : 0
              const isFull = max != null && s.registered >= max
              const dirty = (edits[s.id] ?? '') !== (max == null ? '' : String(max))
              const barColor = isFull ? '#C98A2B' : pct >= 80 ? '#D29486' : '#6D436D'
              return (
                <div key={s.id} className="rounded-xl border p-3" style={{ borderColor: '#E0CCB3', background: '#fff' }}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-[140px]">
                      <p className="text-sm font-semibold" style={{ color: '#5E4B35' }}>{s.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#9A7B6B' }}>
                        רשומים: <b style={{ color: '#5E4B35' }}>{s.registered}</b>
                        {max != null ? ` / ${max}` : ' · ללא הגבלה'}
                        {isFull && <span style={{ color: '#C98A2B', fontWeight: 700 }}> · מלא</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} placeholder="∞"
                        value={edits[s.id] ?? ''} onChange={e => setEdits(p => ({ ...p, [s.id]: e.target.value }))}
                        className="w-20 rounded-lg border px-2 py-1.5 text-sm text-center"
                        style={{ borderColor: '#E0CCB3', color: '#5E4B35' }} />
                      <button onClick={() => save(s.id)} disabled={!dirty || saving === s.id}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full text-white transition-opacity"
                        style={{ background: saved === s.id ? '#7BA05B' : '#6D436D', opacity: !dirty || saving === s.id ? 0.45 : 1 }}>
                        {saving === s.id ? '...' : saved === s.id ? '✓ נשמר' : 'שמירה'}
                      </button>
                    </div>
                  </div>
                  {max != null && (
                    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: '#F0E6D6' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
