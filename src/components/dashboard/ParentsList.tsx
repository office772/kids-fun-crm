'use client'

import { useState } from 'react'
import { Pencil, Trash2, Grid3X3, List } from 'lucide-react'
import { Parent } from '@/lib/types'
import { ParentDetail } from './ParentDetail'
import { getParentPaymentHealthInfo, getSourceLabel } from '@/lib/payment-status'

interface Props {
  parents: Parent[]
  searchQuery: string
  onEdit?: (parent: Parent) => void
  onDelete?: (parentId: string) => void
  onBulkDelete?: (ids: string[]) => void
  viewMode?: 'grid' | 'list'
  onViewModeChange?: (mode: 'grid' | 'list') => void
}

export function ParentsList({
  parents,
  searchQuery,
  onEdit,
  onDelete,
  onBulkDelete,
  viewMode = 'grid',
  onViewModeChange,
}: Props) {
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filtered = parents.filter(p => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      p.name?.toLowerCase().includes(q) ||
      p.phone?.includes(q) ||
      p.children?.some(c => c.name?.toLowerCase().includes(q))
    )
  })

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev)
      if (s.has(id)) { s.delete(id) } else { s.add(id) }
      return s
    })
  }

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(p => p.id)))
    }
  }

  const handleBulkDelete = () => {
    if (!onBulkDelete || selected.size === 0) return
    if (!confirm(`למחוק ${selected.size} הורים? פעולה זו אינה הפיכה.`)) return
    onBulkDelete(Array.from(selected))
    setSelected(new Set())
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!onDelete) return
    if (!confirm('למחוק הורה זה?')) return
    onDelete(id)
  }

  return (
    <>
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl mb-3 text-sm font-medium"
          style={{ background: '#fce9e6', border: '1px solid #f5c6b8' }}>
          <input type="checkbox" checked={selected.size === filtered.length} onChange={toggleAll}
            className="w-4 h-4 accent-[var(--crm-primary)] cursor-pointer" />
          <span style={{ color: '#a05a4f' }}>{selected.size} נבחרו</span>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors hover:opacity-80 mr-auto"
            style={{ background: '#c0392b', color: '#fff' }}
          >
            <Trash2 size={12} />
            מחק נבחרים
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs underline" style={{ color: '#a8a29e' }}>
            בטל בחירה
          </button>
        </div>
      )}

      {/* View toggle */}
      {onViewModeChange && selected.size === 0 && (
        <div className="flex justify-start mb-4 gap-1">
          <button onClick={() => onViewModeChange('grid')} className="p-2 rounded-lg transition-colors"
            style={viewMode === 'grid' ? { background: 'var(--crm-primary)', color: '#fff' } : { color: 'var(--crm-text)', opacity: 0.5 }}
            title="תצוגת כרטיסים">
            <Grid3X3 size={18} />
          </button>
          <button onClick={() => onViewModeChange('list')} className="p-2 rounded-lg transition-colors"
            style={viewMode === 'list' ? { background: 'var(--crm-primary)', color: '#fff' } : { color: 'var(--crm-text)', opacity: 0.5 }}
            title="תצוגת רשימה">
            <List size={18} />
          </button>
        </div>
      )}

      {/* Select-all row when items exist */}
      {filtered.length > 0 && selected.size === 0 && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <button onClick={toggleAll} className="text-xs flex items-center gap-1.5 transition-opacity hover:opacity-80"
            style={{ color: '#a8a29e' }}>
            <input type="checkbox" readOnly checked={false}
              className="w-3.5 h-3.5 accent-[var(--crm-primary)] cursor-pointer" />
            בחר הכל ({filtered.length})
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-stone-400">
          <div className="text-4xl mb-2">🔍</div>
          <p>לא נמצאו תוצאות</p>
        </div>
      )}

      {/* GRID VIEW */}
      {viewMode === 'grid' && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(parent => (
            <ParentGridCard
              key={parent.id}
              parent={parent}
              selected={selected.has(parent.id)}
              onSelect={() => toggleSelect(parent.id)}
              onOpen={() => setSelectedParent(parent)}
              onEdit={onEdit}
              onDelete={onDelete ? (e) => handleDelete(e, parent.id) : undefined}
            />
          ))}
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && filtered.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr style={{ background: '#fdf6ef' }} className="border-b border-gray-100">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll} className="w-4 h-4 accent-[var(--crm-primary)] cursor-pointer" />
                </th>
                <th className="text-right px-3 py-3 font-semibold" style={{ color: 'var(--crm-primary)' }}>שם</th>
                <th className="text-right px-3 py-3 font-semibold hidden sm:table-cell" style={{ color: 'var(--crm-primary)' }}>טלפון</th>
                <th className="text-right px-3 py-3 font-semibold hidden md:table-cell" style={{ color: 'var(--crm-primary)' }}>ילד/ה</th>
                <th className="text-right px-3 py-3 font-semibold" style={{ color: 'var(--crm-primary)' }}>סטטוס</th>
                <th className="text-right px-3 py-3 font-semibold hidden lg:table-cell" style={{ color: 'var(--crm-primary)' }}>מקור</th>
                <th className="px-3 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((parent, i) => {
                const health = getParentPaymentHealthInfo(parent.payments)
                const src = getSourceLabel(parent.sync_source)
                const child = parent.children?.[0]
                return (
                  <tr key={parent.id}
                    onClick={() => setSelectedParent(parent)}
                    className="border-b border-gray-50 hover:bg-[#fdf9f5] transition-colors cursor-pointer"
                    style={i % 2 !== 0 ? { background: '#fafaf9' } : {}}>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(parent.id)}
                        onChange={() => toggleSelect(parent.id)}
                        className="w-4 h-4 accent-[var(--crm-primary)] cursor-pointer" />
                    </td>
                    <td className="px-3 py-3 font-medium" style={{ color: 'var(--crm-text)' }}>
                      {parent.name || 'הורה לא מזוהה'}
                    </td>
                    <td className="px-3 py-3 text-gray-500 hidden sm:table-cell" dir="ltr">{parent.phone}</td>
                    <td className="px-3 py-3 text-gray-500 hidden md:table-cell">
                      {child ? `${child.name}${child.class_name ? ` (${child.class_name})` : ''}` : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: health.bg, color: health.color }}>
                        {health.icon} {health.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: src.bg, color: src.color }}>
                        {src.icon} {src.label}
                      </span>
                    </td>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        {onEdit && (
                          <button onClick={() => onEdit(parent)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                            style={{ color: '#a8a29e' }} title="עריכה">
                            <Pencil size={13} />
                          </button>
                        )}
                        {onDelete && (
                          <button onClick={(e) => handleDelete(e, parent.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                            style={{ color: '#e57373' }} title="מחיקה">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedParent && (
        <ParentDetail
          parentId={selectedParent.id}
          onClose={() => setSelectedParent(null)}
          onRefresh={() => setSelectedParent(null)}
        />
      )}
    </>
  )
}

// ─── Individual grid card ──────────────────────────────────────────────────────

interface CardProps {
  parent: Parent
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  onEdit?: (parent: Parent) => void
  onDelete?: (e: React.MouseEvent) => void
}

function ParentGridCard({ parent, selected, onSelect, onOpen, onEdit, onDelete }: CardProps) {
  const health = getParentPaymentHealthInfo(parent.payments)
  const hasFailedPayment = health.health === 'failed'
  const firstChild = parent.children?.[0]
  const latestPayment = parent.payments?.[0]
  const src = getSourceLabel(parent.sync_source)

  const formattedDate = (() => {
    try { return new Date(parent.created_at).toLocaleDateString('he-IL') }
    catch { return '' }
  })()

  return (
    <div
      className="bg-white rounded-2xl shadow-sm p-5 hover:shadow-md transition-all border border-gray-100 relative flex flex-col"
      style={
        selected
          ? { borderColor: 'var(--crm-primary)', background: '#fdf6ef', boxShadow: '0 0 0 2px var(--crm-primary)' }
          : hasFailedPayment
          ? { borderColor: '#e8c4d0', background: '#fdf0f3' }
          : {}
      }
    >
      {/* Top row: checkbox + edit/delete icons */}
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 cursor-pointer flex items-center justify-center transition-colors"
          style={selected
            ? { background: 'var(--crm-primary)', borderColor: 'var(--crm-primary)' }
            : { borderColor: '#d1d5db' }}
          onClick={e => { e.stopPropagation(); onSelect() }}
        >
          {selected && <span className="text-white text-xs font-bold leading-none">✓</span>}
        </div>

        <div className="flex items-center gap-1">
          {onEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit(parent) }}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100"
              style={{ color: 'var(--crm-text)', opacity: 0.55 }}
              title="עריכה"
            >
              <Pencil size={13} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-red-50"
              style={{ color: '#e57373' }}
              title="מחיקה"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Name + status badge */}
      <div className="flex items-center gap-2 mb-2 cursor-pointer flex-wrap" onClick={onOpen}>
        <span className="font-bold text-base leading-tight" style={{ color: 'var(--crm-text)' }}>
          {parent.name || 'הורה לא מזוהה'}
        </span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ background: health.bg, color: health.color }}>
          {health.icon} {health.label}
        </span>
      </div>

      {/* Source label */}
      <div className="mb-2">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: src.bg, color: src.color }}>
          {src.icon} {src.label}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-1.5 text-sm flex-1 cursor-pointer" onClick={onOpen}
        style={{ color: 'var(--crm-text)', opacity: 0.75 }}>
        <p className="flex items-center gap-1.5">
          <span>📱</span>
          <span dir="ltr">{parent.phone}</span>
        </p>
        {firstChild && (
          <p className="flex items-center gap-1.5">
            <span>👧</span>
            <span>{firstChild.name}{firstChild.class_name ? ` — ${firstChild.class_name}` : ''}</span>
          </p>
        )}
        {latestPayment && (
          <p className="flex items-center gap-1.5">
            <span>💳</span>
            <span>{latestPayment.status}{latestPayment.amount ? ` — ₪${latestPayment.amount}` : ''}</span>
          </p>
        )}
        {formattedDate && (
          <p className="flex items-center gap-1.5">
            <span>📅</span>
            <span>{formattedDate}</span>
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <button onClick={onOpen}
          className="text-sm font-medium flex items-center gap-1.5 transition-opacity hover:opacity-100"
          style={{ color: 'var(--crm-primary)', opacity: 0.7 }}>
          <span>📅</span>
          <span>הצג היסטוריית שיחה</span>
        </button>
      </div>
    </div>
  )
}
