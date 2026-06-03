'use client'

import { useState, useEffect } from 'react'
import { Users, Save, Loader2, AlertCircle, CheckCircle2, TrendingUp } from 'lucide-react'

interface BranchData {
  id: string
  name: string
  area_code: string
  max_capacity: number
  form_link: string
  active: number
  waiting: number
}

export function CapacitySettings() {
  const [branches, setBranches]     = useState<BranchData[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState<string | null>(null) // area_code שנשמר כרגע
  const [saved, setSaved]           = useState<string | null>(null)
  const [error, setError]           = useState('')
  // עותק נפרד לעריכה — כך שהמשתמשת יכולה לשנות ולשמור בנפרד לכל אזור
  const [edits, setEdits]           = useState<Record<string, number>>({})

  useEffect(() => {
    fetch('/api/admin/branches')
      .then(r => r.json())
      .then((data: BranchData[]) => {
        setBranches(data)
        // אתחל edits עם הערכים הנוכחיים
        const init: Record<string, number> = {}
        data.forEach(b => { init[b.area_code] = b.max_capacity })
        setEdits(init)
      })
      .catch(() => setError('שגיאה בטעינת הנתונים'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async (area_code: string) => {
    setSaving(area_code)
    setError('')
    try {
      const res = await fetch('/api/admin/branches', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ area_code, max_capacity: edits[area_code] }),
      })
      if (!res.ok) throw new Error('שגיאת שמירה')
      // עדכן state מקומי
      setBranches(prev =>
        prev.map(b => b.area_code === area_code ? { ...b, max_capacity: edits[area_code] } : b)
      )
      setSaved(area_code)
      setTimeout(() => setSaved(null), 2500)
    } catch {
      setError(`שגיאה בשמירת ${area_code}`)
    } finally {
      setSaving(null)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-[#5c3d2e]" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* כותרת */}
      <div>
        <h2 className="text-xl font-bold text-[#3d2b1f]">ניהול קיבולת לפי אזור</h2>
        <p className="text-sm text-gray-500 mt-1">
          קבעי כמה ילדים מותר לרשום לכל אזור. הבוט והטופס בודקים את המספר הזה בזמן אמת.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl p-4 text-sm" style={{ background: '#FCEAEA', border: '1px solid #EF444433', color: '#EF4444' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* כרטיסי אזורים */}
      <div className="grid gap-4">
        {branches.map(branch => {
          const currentEdit  = edits[branch.area_code] ?? branch.max_capacity
          const pct          = branch.active > 0 && branch.max_capacity > 0
            ? Math.round((branch.active / branch.max_capacity) * 100)
            : 0
          const isFull       = branch.active >= branch.max_capacity
          const isDirty      = currentEdit !== branch.max_capacity
          const isSavingThis = saving === branch.area_code
          const isSavedThis  = saved  === branch.area_code

          return (
            <div key={branch.area_code}
              className="bg-white rounded-2xl p-6 shadow-sm border border-[#f0e0d0] space-y-4">

              {/* שורת כותרת */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#f5e6d8] flex items-center justify-center">
                    <Users size={18} className="text-[#5c3d2e]" />
                  </div>
                  <div>
                    <div className="font-bold text-[#3d2b1f]">{branch.name}</div>
                    <div className="text-xs text-gray-400">{branch.area_code}</div>
                  </div>
                </div>
                <div
                className="text-xs font-semibold px-3 py-1 rounded-full"
                style={isFull
                  ? { background: '#FCEAEA', color: '#EF4444' }
                  : { background: '#E6F4EF', color: '#297058' }}
              >
                  {isFull ? '🔴 מלא' : '🟢 יש מקום'}
                </div>
              </div>

              {/* סטטיסטיקות */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label="נרשמו" value={branch.active} color="text-[#5c3d2e]" />
                <Stat label="קיבולת נוכחית" value={branch.max_capacity} color="text-gray-500" />
                <Stat label="רשימת המתנה" value={branch.waiting} color="text-amber-600" />
              </div>

              {/* פס התקדמות */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>מילוי</span>
                  <span>{pct}%</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width:      `${Math.min(pct, 100)}%`,
                      background:  pct >= 100 ? '#EF4444' : pct >= 80 ? '#FAD980' : '#297058',
                    }}
                  />
                </div>
              </div>

              {/* עריכת קיבולת */}
              <div className="flex items-center gap-3 pt-1">
                <label className="text-sm font-medium text-[#3d2b1f] shrink-0">
                  קיבולת מקסימלית:
                </label>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={currentEdit}
                  onChange={e => setEdits(prev => ({
                    ...prev,
                    [branch.area_code]: parseInt(e.target.value) || 0,
                  }))}
                  className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-center text-base font-bold focus:outline-none focus:border-[#5c3d2e]"
                />
                <button
                  onClick={() => handleSave(branch.area_code)}
                  disabled={!isDirty || isSavingThis}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                  style={isSavedThis
                    ? { background: '#E6F4EF', color: '#297058' }
                    : isDirty
                      ? { background: '#5c3d2e', color: '#fff' }
                      : { background: '#F0F1F2', color: '#7B8794', cursor: 'not-allowed' }
                  }
                >
                  {isSavingThis ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isSavedThis ? (
                    <><CheckCircle2 size={14} /> נשמר!</>
                  ) : (
                    <><Save size={14} /> שמור</>
                  )}
                </button>
              </div>

              {isDirty && !isSavingThis && !isSavedThis && (
                <p className="text-xs flex items-center gap-1" style={{ color: '#7B6010' }}>
                  <TrendingUp size={12} /> שינוי טרם נשמר
                </p>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 text-center">
        * שינוי הקיבולת נכנס לתוקף מיידית — הבוט והטופס יתעדכנו אוטומטית
      </p>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-[#fdf6ef] rounded-xl py-2">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  )
}
