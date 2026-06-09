'use client'

import { useState } from 'react'
import { Pencil, Grid3X3, List } from 'lucide-react'
import { Parent } from '@/lib/types'
import { ParentDetail } from './ParentDetail'
import { getParentPaymentHealthInfo, getSourceLabel } from '@/lib/payment-status'

interface Props {
  parents: Parent[]
  searchQuery: string
  onEdit?: (parent: Parent) => void
  onDelete?: (parentId: string) => void
  viewMode?: 'grid' | 'list'
  onViewModeChange?: (mode: 'grid' | 'list') => void
}

export function ParentsList({
  parents,
  searchQuery,
  onEdit,
  onDelete,
  viewMode = 'grid',
  onViewModeChange,
}: Props) {
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null)

  const filtered = parents.filter(p => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      p.name?.toLowerCase().includes(q) ||
      p.phone?.includes(q) ||
      p.children?.some(c => c.name?.toLowerCase().includes(q))
    )
  })

  const handleOpenCard = (parent: Parent) => setSelectedParent(parent)

  return (
    <>
      {/* View toggle — only shown when onViewModeChange is provided */}
      {onViewModeChange && (
        <div className="flex justify-start mb-4 gap-1">
          <button
            onClick={() => onViewModeChange('grid')}
            className="p-2 rounded-lg transition-colors"
            style={
              viewMode === 'grid'
                ? { background: 'var(--crm-primary)', color: '#fff' }
                : { color: 'var(--crm-text)', opacity: 0.5 }
            }
            title="תצוגת כרטיסים"
          >
            <Grid3X3 size={18} />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className="p-2 rounded-lg transition-colors"
            style={
              viewMode === 'list'
                ? { background: 'var(--crm-primary)', color: '#fff' }
                : { color: 'var(--crm-text)', opacity: 0.5 }
            }
            title="תצוגת רשימה"
          >
            <List size={18} />
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
              onOpen={handleOpenCard}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(parent => {
            const health = getParentPaymentHealthInfo(parent.payments)
            const hasFailedPayment = health.health === 'failed'
            const hasExpiringCard = health.health === 'expiring'
            const openTasksCount = parent.tasks?.filter(t => t.status !== 'טופל').length || 0
            const src = getSourceLabel(parent.sync_source)

            return (
              <button
                key={parent.id}
                onClick={() => handleOpenCard(parent)}
                className="w-full text-right rounded-xl p-4 border-2 transition-all hover:shadow-md"
                style={hasFailedPayment
                  ? { background: '#FAF5EE', borderColor: '#e8c4d0' }
                  : { background: '#fff', borderColor: '#f3f4f6' }
                }
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-base" style={{ color: 'var(--crm-text)' }}>
                        {parent.name || 'הורה לא מזוהה'}
                      </span>
                      <span className="text-xs rounded-full px-2 py-0.5 font-medium"
                        style={{ background: src.bg, color: src.color }}>
                        {src.icon} {src.label}
                      </span>
                      {hasFailedPayment && (
                        <span className="text-xs rounded-full px-2 py-0.5 font-semibold" style={{ background: '#f5dde5', color: '#7d2d4a' }}>
                          🔴 כשל תשלום
                        </span>
                      )}
                      {hasExpiringCard && (
                        <span className="text-xs rounded-full px-2 py-0.5 font-semibold" style={{ background: '#FEF9C3', color: '#7B6010' }}>
                          🟡 כרטיס פג תוקף
                        </span>
                      )}
                      {openTasksCount > 0 && (
                        <span className="text-xs bg-amber-500 text-white rounded-full px-2 py-0.5">
                          {openTasksCount} פניות
                        </span>
                      )}
                    </div>
                    <p className="text-stone-400 text-sm mt-0.5">📱 {parent.phone}</p>
                    {parent.children?.length ? (
                      <p className="text-stone-500 text-sm mt-1">
                        {parent.children.map(c => `${c.name} (${c.grade || c.class_name || '?'})`).join(', ')}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                      style={{ background: health.bg, color: health.color }}>
                      {health.icon} {health.label}
                    </span>
                    <span className="text-xs text-stone-400">
                      {new Date(parent.created_at).toLocaleDateString('he-IL')}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selectedParent && (
        <ParentDetail
          parentId={selectedParent.id}
          onClose={() => setSelectedParent(null)}
          onRefresh={() => {
            // close and re-open to refresh data; or parent can provide refresh callback
            setSelectedParent(null)
          }}
        />
      )}
    </>
  )
}

// ─── Individual grid card ───────────────────────────────────────────────────

interface CardProps {
  parent: Parent
  onOpen: (parent: Parent) => void
  onEdit?: (parent: Parent) => void
}

function ParentGridCard({ parent, onOpen, onEdit }: CardProps) {
  const latestPayment = parent.payments?.[0]
  const health = getParentPaymentHealthInfo(parent.payments)
  const hasFailedPayment = health.health === 'failed'
  const firstChild = parent.children?.[0]
  const src = getSourceLabel(parent.sync_source)

  const formattedDate = (() => {
    try {
      return new Date(parent.created_at).toLocaleDateString('he-IL')
    } catch {
      return ''
    }
  })()

  return (
    <div
      className="bg-white rounded-2xl shadow-sm p-5 hover:shadow-md transition-shadow border border-gray-100 relative flex flex-col"
      style={hasFailedPayment ? { borderColor: '#e8c4d0', background: '#fdf0f3' } : {}}
    >
      {/* Top row: checkbox placeholder + edit icon */}
      <div className="flex items-start justify-between mb-3">
        {/* Checkbox (visual only — selection not wired, consistent with Pantarei look) */}
        <div className="w-4 h-4 rounded border-2 border-gray-300 flex-shrink-0 mt-0.5" />

        {/* Edit button */}
        {onEdit && (
          <button
            onClick={e => {
              e.stopPropagation()
              onEdit(parent)
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100"
            style={{ color: 'var(--crm-text)', opacity: 0.55 }}
            title="עריכה"
          >
            <Pencil size={15} />
          </button>
        )}
      </div>

      {/* Name + status badge */}
      <div
        className="flex items-center gap-2 mb-2 cursor-pointer flex-wrap"
        onClick={() => onOpen(parent)}
      >
        <span
          className="font-bold text-base leading-tight"
          style={{ color: 'var(--crm-text)' }}
        >
          {parent.name || 'הורה לא מזוהה'}
        </span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ background: health.bg, color: health.color }} title={health.label}>
          {health.icon} {health.label}
        </span>
      </div>

      {/* Source label */}
      <div className="mb-2">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ background: src.bg, color: src.color }}>
          {src.icon} {src.label}
        </span>
      </div>

      {/* Details — clicking anywhere here opens the card */}
      <div
        className="space-y-1.5 text-sm flex-1 cursor-pointer"
        onClick={() => onOpen(parent)}
        style={{ color: 'var(--crm-text)', opacity: 0.75 }}
      >
        {/* Phone */}
        <p className="flex items-center gap-1.5">
          <span>📱</span>
          <span dir="ltr">{parent.phone}</span>
        </p>

        {/* First child */}
        {firstChild && (
          <p className="flex items-center gap-1.5">
            <span>👧</span>
            <span>
              {firstChild.name}
              {firstChild.class_name ? ` — ${firstChild.class_name}` : ''}
            </span>
          </p>
        )}

        {/* Payment */}
        {latestPayment && (
          <p className="flex items-center gap-1.5">
            <span>💳</span>
            <span>
              {latestPayment.status}
              {latestPayment.amount ? ` — ₪${latestPayment.amount}` : ''}
            </span>
          </p>
        )}

        {/* Date */}
        {formattedDate && (
          <p className="flex items-center gap-1.5">
            <span>📅</span>
            <span>{formattedDate}</span>
          </p>
        )}
      </div>

      {/* Divider + history link */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <button
          onClick={() => onOpen(parent)}
          className="text-sm font-medium flex items-center gap-1.5 transition-opacity hover:opacity-100"
          style={{ color: 'var(--crm-primary)', opacity: 0.7 }}
        >
          <span>📅</span>
          <span>הצג היסטוריית שיחה</span>
        </button>
      </div>
    </div>
  )
}
