'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Users, Save, X } from 'lucide-react'

interface StaffMember {
  id: string
  framework_id: string
  name: string
  phone: string | null
  email: string | null
  role: string | null
  sort_order: number
  is_active: boolean
}

interface Framework {
  id: string
  name: string
  area_code: string
  type: 'צהרון' | 'קייטנה'
  is_active: boolean
  notes: string | null
  staff: StaffMember[]
}

const AREA_LABELS: Record<string, string> = {
  carmel:  'חוף הכרמל',
  sharon:  'דרום השרון / חוף השרון',
  telaviv: 'תל אביב',
}

const ROLES = ['רכזת', 'גננת', 'סייעת', 'מנהל/ת', 'אחר']

export function FrameworkStaffManager() {
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [loading, setLoading] = useState(true)
  const [editingStaff, setEditingStaff] = useState<Partial<StaffMember> & { framework_id: string } | null>(null)
  const [addingFramework, setAddingFramework] = useState(false)
  const [newFramework, setNewFramework] = useState({ name: '', area_code: 'sharon', type: 'קייטנה' as 'צהרון' | 'קייטנה' })

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/frameworks')
    const data = await res.json()
    if (Array.isArray(data)) setFrameworks(data)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const saveStaff = async () => {
    if (!editingStaff?.name?.trim()) { alert('שם הוא שדה חובה'); return }
    const isNew = !editingStaff.id
    const url = isNew ? '/api/frameworks/staff' : `/api/frameworks/staff/${editingStaff.id}`
    const method = isNew ? 'POST' : 'PATCH'
    await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        framework_id: editingStaff.framework_id,
        name:  editingStaff.name?.trim(),
        phone: editingStaff.phone?.trim() || null,
        email: editingStaff.email?.trim() || null,
        role:  editingStaff.role || null,
      }),
    })
    setEditingStaff(null)
    await load()
  }

  const deleteStaff = async (id: string) => {
    if (!confirm('למחוק איש צוות זה?')) return
    await fetch(`/api/frameworks/staff/${id}`, { method: 'DELETE' })
    await load()
  }

  const addFramework = async () => {
    if (!newFramework.name.trim()) { alert('שם המסגרת חובה'); return }
    await fetch('/api/frameworks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newFramework),
    })
    setAddingFramework(false)
    setNewFramework({ name: '', area_code: 'sharon', type: 'קייטנה' })
    await load()
  }

  const deleteFramework = async (id: string, name: string) => {
    if (!confirm(`למחוק את המסגרת "${name}" וכל אנשי הצוות שלה?`)) return
    await fetch(`/api/frameworks/${id}`, { method: 'DELETE' })
    await load()
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-400">טוען מסגרות...</div>
  }

  // קיבוץ לפי אזור ואז סוג
  const grouped: Record<string, Framework[]> = {}
  for (const f of frameworks) {
    const key = `${f.area_code}|${f.type}`
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(f)
  }
  const sortedKeys = Object.keys(grouped).sort((a, b) => {
    const [areaA, typeA] = a.split('|')
    const [areaB, typeB] = b.split('|')
    if (areaA !== areaB) return areaA.localeCompare(areaB)
    return typeA === 'צהרון' ? -1 : 1
  })

  return (
    <>
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-5xl font-bold leading-none mb-1"
            style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}>
            צוותי מסגרות
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
            רכזות, גננות וצוות לכל בי&quot;ס/גן/קייטנה. הודעות איסוף מוקדם וחולים יישלחו לצוות המסגרת הרלוונטית (+ עותק לאדמין).
          </p>
        </div>
        <button onClick={() => setAddingFramework(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm transition-all hover:opacity-80"
          style={{ background: 'var(--crm-primary)', color: '#fff' }}>
          <Plus size={16} /> הוסף מסגרת
        </button>
      </div>

      {/* Add framework form */}
      {addingFramework && (
        <div className="bg-white rounded-2xl p-5 mb-6 shadow-sm border border-gray-100">
          <h3 className="font-bold mb-3" style={{ color: 'var(--crm-text)' }}>מסגרת חדשה</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-xs block mb-1" style={{ color: '#78716c' }}>שם המסגרת</label>
              <input type="text" value={newFramework.name}
                onChange={e => setNewFramework(v => ({ ...v, name: e.target.value }))}
                placeholder='לדוגמה: קייטנת אדוות גיא'
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: '#78716c' }}>אזור</label>
              <select value={newFramework.area_code}
                onChange={e => setNewFramework(v => ({ ...v, area_code: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="carmel">חוף הכרמל</option>
                <option value="sharon">דרום השרון</option>
                <option value="telaviv">תל אביב</option>
              </select>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: '#78716c' }}>סוג</label>
              <select value={newFramework.type}
                onChange={e => setNewFramework(v => ({ ...v, type: e.target.value as 'צהרון'|'קייטנה' }))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="צהרון">צהרון</option>
                <option value="קייטנה">קייטנה</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={addFramework}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--crm-primary)', color: '#fff' }}>
                שמור
              </button>
              <button onClick={() => setAddingFramework(false)}
                className="px-4 py-2 rounded-lg text-sm" style={{ background: '#f5f5f4', color: '#78716c' }}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Frameworks grouped by area + type */}
      <div className="space-y-6">
        {sortedKeys.map(key => {
          const [areaCode, type] = key.split('|')
          const list = grouped[key]
          return (
            <div key={key}>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2"
                style={{ color: 'var(--crm-primary)' }}>
                {type === 'קייטנה' ? '🏕️' : '🏫'} {AREA_LABELS[areaCode] ?? areaCode} — {type}
                <span className="text-xs font-normal" style={{ color: '#a8a29e' }}>({list.length})</span>
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {list.map(fw => (
                  <div key={fw.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-bold" style={{ color: 'var(--crm-text)' }}>{fw.name}</h3>
                      <div className="flex gap-1">
                        <button onClick={() => setEditingStaff({ framework_id: fw.id, name: '', phone: '', email: '', role: 'רכזת' })}
                          className="text-xs px-2 py-1 rounded-full hover:bg-gray-100" style={{ color: 'var(--crm-primary)' }}>
                          <Plus size={12} className="inline" /> איש צוות
                        </button>
                        {fw.type === 'קייטנה' && (
                          <button onClick={() => deleteFramework(fw.id, fw.name)}
                            className="p-1 rounded-full hover:bg-red-50" style={{ color: '#e57373' }} title="מחיקת מסגרת (קייטנה)">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {fw.staff?.length > 0 ? (
                      <div className="space-y-2">
                        {fw.staff.map(s => (
                          <div key={s.id} className="flex items-center justify-between bg-[#fdf6ef] rounded-lg p-2 text-sm">
                            {editingStaff?.id === s.id ? (
                              <StaffEditRow staff={editingStaff} setStaff={setEditingStaff} onSave={saveStaff} onCancel={() => setEditingStaff(null)} />
                            ) : (
                              <>
                                <div className="flex-1">
                                  <div className="font-medium" style={{ color: 'var(--crm-text)' }}>
                                    {s.name} {s.role && <span className="text-xs" style={{ color: '#a8a29e' }}>({s.role})</span>}
                                  </div>
                                  <div className="text-xs flex gap-3 mt-0.5" style={{ color: '#78716c' }}>
                                    {s.phone && <span>📞 {s.phone}</span>}
                                    {s.email && <span>✉️ {s.email}</span>}
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <button onClick={() => setEditingStaff({ ...s })}
                                    className="p-1 rounded-full hover:bg-white" style={{ color: '#78716c' }}>
                                    <Pencil size={11} />
                                  </button>
                                  <button onClick={() => deleteStaff(s.id)}
                                    className="p-1 rounded-full hover:bg-red-50" style={{ color: '#e57373' }}>
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs italic" style={{ color: '#a8a29e' }}>אין צוות עדיין — לחצי על &quot;+ איש צוות&quot;</p>
                    )}

                    {editingStaff?.framework_id === fw.id && !editingStaff.id && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <StaffEditRow staff={editingStaff} setStaff={setEditingStaff} onSave={saveStaff} onCancel={() => setEditingStaff(null)} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {frameworks.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          אין עדיין מסגרות — לחצי על &quot;הוסף מסגרת&quot;
        </div>
      )}
    </>
  )
}

// תת-קומפוננטה: שורת עריכה
function StaffEditRow({ staff, setStaff, onSave, onCancel }: {
  staff: Partial<StaffMember> & { framework_id: string }
  setStaff: (s: Partial<StaffMember> & { framework_id: string }) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-2 items-center">
      <input type="text" placeholder="שם *" value={staff.name ?? ''}
        onChange={e => setStaff({ ...staff, name: e.target.value })}
        className="border rounded px-2 py-1 text-xs col-span-2 md:col-span-1" />
      <input type="text" placeholder="טלפון" value={staff.phone ?? ''}
        onChange={e => setStaff({ ...staff, phone: e.target.value })}
        className="border rounded px-2 py-1 text-xs" />
      <input type="email" placeholder="מייל" value={staff.email ?? ''}
        onChange={e => setStaff({ ...staff, email: e.target.value })}
        className="border rounded px-2 py-1 text-xs col-span-2 md:col-span-1" />
      <select value={staff.role ?? ''}
        onChange={e => setStaff({ ...staff, role: e.target.value })}
        className="border rounded px-2 py-1 text-xs">
        <option value="">תפקיד</option>
        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <div className="flex gap-1">
        <button onClick={onSave} className="p-1 rounded hover:bg-green-50" style={{ color: '#5c8a4e' }} title="שמירה">
          <Save size={12} />
        </button>
        <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100" style={{ color: '#78716c' }} title="ביטול">
          <X size={12} />
        </button>
      </div>
    </div>
  )
}
