'use client'

import { useState } from 'react'
import { ArchiveRestore, Archive } from 'lucide-react'
import { Parent } from '@/lib/types'

interface Props {
  archived: Parent[]
  onRefresh: () => void
}

// ארכיון לקוחות — קייטנות ואירועים חד-פעמיים. צפייה ושחזור בלבד, אין מחיקה.
export function ArchiveList({ archived, onRefresh }: Props) {
  const [search, setSearch] = useState('')
  const [reasonFilter, setReasonFilter] = useState<string>('הכל')
  const [restoring, setRestoring] = useState<string | null>(null)

  const reasons = ['הכל', ...Array.from(new Set(archived.map(p => p.archive_reason).filter((r): r is string => !!r)))]

  const filtered = archived.filter(p => {
    if (reasonFilter !== 'הכל' && p.archive_reason !== reasonFilter) return false
    if (search && !(p.name?.toLowerCase().includes(search.toLowerCase()) || p.phone?.includes(search))) return false
    return true
  })

  const handleRestore = async (id: string) => {
    if (!confirm('לשחזר לקוח זה מהארכיון אל רשימת הלקוחות הפעילה?')) return
    setRestoring(id)
    await fetch('/api/parents/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], archive: false }),
    })
    setRestoring(null)
    onRefresh()
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <Archive size={22} style={{ color: '#a8a29e' }} />
        <h2 className="text-2xl font-bold" style={{ color: 'var(--crm-text)', opacity: 0.75 }}>
          ארכיון — קייטנות ואירועים חד-פעמיים
        </h2>
      </div>
      <p className="text-sm mb-5" style={{ color: '#a8a29e' }}>
        לקוחות עבר שאינם לקוחות צהרון פעילים (קייטנה היא אירוע חד-פעמי). הנתונים נשמרים ולא נמחקים — ניתן לשחזר בכל רגע.
      </p>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            placeholder="🔍  חיפוש לפי שם או טלפון..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none bg-white text-right"
            onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
            onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
          />
        </div>

        {/* Reason filter */}
        <div className="flex items-center gap-1">
          {reasons.map(r => (
            <button
              key={r}
              onClick={() => setReasonFilter(r)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all border"
              style={reasonFilter === r
                ? { background: '#a8a29e', color: '#fff', borderColor: '#a8a29e' }
                : { background: '#fff', color: '#78716c', borderColor: '#e5e7eb' }}
            >
              {r}
            </button>
          ))}
        </div>

        <span className="text-xs mr-auto" style={{ color: '#a8a29e' }}>
          {filtered.length} מתוך {archived.length} בארכיון
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" style={{ opacity: 0.92 }}>
        <table className="w-full text-sm" dir="rtl">
          <thead>
            <tr className="border-b border-gray-100" style={{ background: '#f7f5f2' }}>
              <th className="text-right px-4 py-3 font-semibold" style={{ color: '#78716c' }}>שם</th>
              <th className="text-right px-4 py-3 font-semibold hidden sm:table-cell" style={{ color: '#78716c' }}>טלפון</th>
              <th className="text-right px-4 py-3 font-semibold" style={{ color: '#78716c' }}>סיבת ארכיון</th>
              <th className="text-right px-4 py-3 font-semibold hidden md:table-cell" style={{ color: '#78716c' }}>תשלומים</th>
              <th className="text-right px-4 py-3 font-semibold hidden md:table-cell" style={{ color: '#78716c' }}>סה״כ</th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const totalPaid = p.payments?.reduce((sum, pay) => sum + (pay.amount ?? 0), 0) ?? 0
              const isReal = !p.phone?.startsWith('gi_')
              return (
                <tr key={p.id}
                  className="border-b border-gray-50 hover:bg-[#fafaf9] transition-colors"
                  style={i % 2 !== 0 ? { background: '#fcfcfb' } : {}}>
                  <td className="px-4 py-3 font-medium" style={{ color: '#57534e' }}>
                    {p.archive_reason === 'קייטנה' ? '🏕️' : '📦'} {p.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">
                    {isReal ? p.phone : <span className="text-gray-300 italic">ללא טלפון (חשבונית ירוקה)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                      style={p.archive_reason === 'קייטנה'
                        ? { background: '#e8f0e3', color: '#5a7a4a' }
                        : { background: '#eeeae5', color: '#78716c' }}>
                      {p.archive_reason || 'אחר'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                    {p.payments?.length ?? 0}
                  </td>
                  <td className="px-4 py-3 font-semibold hidden md:table-cell" style={{ color: '#78716c' }}>
                    {totalPaid > 0 ? `₪${totalPaid.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleRestore(p.id)}
                      disabled={restoring === p.id}
                      className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-40"
                      style={{ background: '#fff', border: '1px solid #d6d3d1', color: '#78716c' }}
                      title="שחזור מהארכיון">
                      <ArchiveRestore size={12} />
                      {restoring === p.id ? 'משחזר...' : 'שחזור'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">הארכיון ריק</div>
        )}
      </div>
    </>
  )
}
