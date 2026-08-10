'use client'

import { useState, useEffect } from 'react'
import { Parent } from '@/lib/types'

const AREAS = [
  { code: 'sharon', label: 'דרום השרון' },
  { code: 'carmel', label: 'חוף הכרמל' },
  { code: 'telaviv', label: 'תל אביב' },
]

// ─── ניהול ילדי ההורה: רשימת כל הילדים + הוספת ילד/ה נוסף/ת לאותו בית אב ───────
export function ChildrenSection({ parent, onRefresh }: { parent: Parent; onRefresh?: () => void }) {
  const children = parent.children || []
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [schools, setSchools] = useState<{ name: string; city?: string }[]>([])
  const [form, setForm] = useState({ name: '', framework: '', area: '', school: '', childClass: '' })
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  // אזור → רשימת מסגרות נפתחת
  useEffect(() => {
    if (!form.area) { setSchools([]); return }
    let cancelled = false
    fetch(`/api/schools?area=${encodeURIComponent(form.area)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setSchools(Array.isArray(d?.schools) ? d.schools : []) })
      .catch(() => { if (!cancelled) setSchools([]) })
    return () => { cancelled = true }
  }, [form.area])

  const submit = async () => {
    if (!form.name.trim()) { alert('שם ילד/ה חובה'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/children', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId: parent.id,
          name: form.name,
          childClass: form.childClass,
          framework: form.framework,
          area: form.area,
          school: form.school === '__other__' ? '' : form.school,
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert('שגיאה: ' + (data.error || '')); return }
      setForm({ name: '', framework: '', area: '', school: '', childClass: '' })
      setAdding(false)
      onRefresh?.()
    } finally { setSaving(false) }
  }

  const removeChild = async (id: string, name: string) => {
    if (children.length <= 1) { alert('לא ניתן להסיר את הילד/ה היחיד/ה. ערכי במקום זאת.'); return }
    if (!confirm(`להסיר את ${name} מההורה?`)) return
    const res = await fetch('/api/children', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) onRefresh?.()
    else alert('שגיאה בהסרה')
  }

  const inp = 'w-full rounded-xl border px-3 py-2 text-sm'
  const inpStyle = { borderColor: '#E0CCB3', background: '#fff', color: '#5E4B35' }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold" style={{ color: '#5E4B35' }}>👧 ילדים ({children.length})</p>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ background: '#e8d5e8', color: '#6D436D' }}>➕ הוסף ילד/ה</button>
        )}
      </div>

      <div className="space-y-2">
        {children.map(c => (
          <div key={c.id} className="rounded-xl p-3 flex items-center justify-between" style={{ background: '#FAF3EA' }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#5E4B35' }}>{c.name}</p>
              <p className="text-xs mt-0.5" style={{ color: '#9A7B6B' }}>
                {[c.grade || c.class_name && `כיתה ${c.grade || c.class_name}`, c.school, c.program || c.framework]
                  .filter(Boolean).join(' · ') || 'אין פרטים'}
              </p>
            </div>
            {children.length > 1 && (
              <button onClick={() => removeChild(c.id, c.name)} title="הסרה"
                className="text-xs px-2 py-1 rounded-lg hover:bg-white" style={{ color: '#a05a4f' }}>🗑</button>
            )}
          </div>
        ))}
      </div>

      {adding && (
        <div className="mt-2 rounded-xl p-3 space-y-2" style={{ background: '#fff', border: '1px solid #E0CCB3' }}>
          <input className={inp} style={inpStyle} placeholder="שם הילד/ה *" value={form.name} onChange={e => set('name', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <select className={inp} style={inpStyle} value={form.framework} onChange={e => set('framework', e.target.value)}>
              <option value="">מסגרת...</option>
              <option value="צהרון">צהרון</option>
              <option value="קייטנה">קייטנה</option>
              <option value="שניהם">צהרון + קייטנה</option>
            </select>
            <select className={inp} style={inpStyle} value={form.area} onChange={e => { set('area', e.target.value); set('school', '') }}>
              <option value="">אזור...</option>
              {AREAS.map(a => <option key={a.code} value={a.code}>{a.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {!form.area ? (
              <input className={inp} style={inpStyle} placeholder="בחרי אזור לרשימה" value={form.school} onChange={e => set('school', e.target.value)} />
            ) : schools.length > 0 ? (
              <select className={inp} style={inpStyle} value={form.school} onChange={e => set('school', e.target.value)}>
                <option value="">בית ספר / גן...</option>
                {schools.map(s => <option key={s.name} value={s.name}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>)}
              </select>
            ) : (
              <input className={inp} style={inpStyle} placeholder="בית ספר / גן" value={form.school} onChange={e => set('school', e.target.value)} />
            )}
            <input className={inp} style={inpStyle} placeholder="כיתה (א1 / גן)" value={form.childClass} onChange={e => set('childClass', e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => { setAdding(false); setForm({ name: '', framework: '', area: '', school: '', childClass: '' }) }}
              className="text-xs px-3 py-1.5 rounded-full" style={{ color: '#9A7B6B' }}>ביטול</button>
            <button onClick={submit} disabled={saving}
              className="text-xs font-semibold px-4 py-1.5 rounded-full text-white" style={{ background: '#6D436D', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'שומר...' : 'שמירה'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
