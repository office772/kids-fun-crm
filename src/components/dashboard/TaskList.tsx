'use client'

import { useState, useRef, useEffect } from 'react'
import { Task, TaskStatus, TaskPriority, TaskType } from '@/lib/types'
import { ChevronDown, Check, User, Clock, Trash2, Grid3X3, List, Search } from 'lucide-react'

interface Props {
  tasks: Task[]
  onStatusChange: (id: string, status: string) => void
  onDelete?: (id: string) => void
  onBulkDelete?: (ids: string[]) => void
}

// ─── Style maps ────────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<TaskStatus, { bg: string; color: string; dot: string }> = {
  'פתוח':   { bg: '#fce9e6', color: '#a05a4f', dot: '#D29486' },
  'בטיפול': { bg: '#6D436D', color: '#ffffff', dot: '#d4a8d4' },
  'טופל':   { bg: '#dcfce7', color: '#15803d', dot: '#16a34a' },
}

const PRIORITY_STYLE: Record<TaskPriority, { bg: string; color: string }> = {
  'דחוף': { bg: '#f5dde5', color: '#7d2d4a' },
  'גבוה': { bg: '#fce9e6', color: '#a05a4f' },
  'רגיל': { bg: '#f5f5f4', color: '#78716c' },
}

const TYPE_STYLE: Record<TaskType, { emoji: string; bg: string; color: string }> = {
  'כשל תשלום':  { emoji: '💳', bg: '#fce9e6', color: '#a05a4f' },
  'ביטול חריג': { emoji: '❌', bg: '#f5dde5', color: '#7d2d4a' },
  'רישום מאוחר':{ emoji: '📋', bg: '#FAF5EE', color: '#8B6914' },
  'שאלה כללית': { emoji: '💬', bg: '#eef2ff', color: '#4338ca' },
  'רשימת המתנה':{ emoji: '⏳', bg: '#fef3c7', color: '#b45309' },
  'תלונה':      { emoji: '⚠️', bg: '#f5dde5', color: '#7d2d4a' },
  'אחר':        { emoji: '📌', bg: '#f5f5f4', color: '#78716c' },
}

const ALL_STATUSES: TaskStatus[] = ['פתוח', 'בטיפול', 'טופל']

// ─── Status Selector ──────────────────────────────────────────────────────────
function StatusSelector({ status, taskId, onSelect }: { status: TaskStatus; taskId: string; onSelect: (s: TaskStatus) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const s = STATUS_STYLE[status]
  return (
    <div ref={ref} className="relative inline-block" dir="rtl">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-80 select-none"
        style={{ background: s.bg, color: s.color }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
        {status}
        <ChevronDown size={10} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 bg-white rounded-xl border shadow-xl z-50 overflow-hidden"
          style={{ borderColor: '#f0ebe8', minWidth: '110px', right: 0 }}>
          {ALL_STATUSES.map(opt => {
            const os = STATUS_STYLE[opt]
            return (
              <button key={opt} onClick={() => { onSelect(opt); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium hover:bg-stone-50 transition-colors"
                style={{ color: os.color }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: os.dot }} />
                <span>{opt}</span>
                {opt === status && <Check size={11} className="mr-auto opacity-70" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── TaskList ─────────────────────────────────────────────────────────────────
export function TaskList({ tasks, onStatusChange, onDelete, onBulkDelete }: Props) {
  const [filter, setFilter] = useState<TaskStatus | 'הכל'>('הכל')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const afterStatus = filter === 'הכל' ? tasks : tasks.filter(t => t.status === filter)
  const filtered = search.trim()
    ? afterStatus.filter(t =>
        t.description?.toLowerCase().includes(search.toLowerCase()) ||
        t.parent?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : afterStatus

  const counts = {
    הכל: tasks.length,
    פתוח: tasks.filter(t => t.status === 'פתוח').length,
    בטיפול: tasks.filter(t => t.status === 'בטיפול').length,
    טופל: tasks.filter(t => t.status === 'טופל').length,
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => { const s = new Set(prev); if (s.has(id)) { s.delete(id) } else { s.add(id) } return s })
  }
  const toggleAll = () => {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(t => t.id)))
  }

  const handleDelete = (id: string) => {
    if (!onDelete) return
    if (!confirm('למחוק פנייה זו?')) return
    onDelete(id)
    setSelected(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  const handleBulkDelete = () => {
    if (!onBulkDelete || selected.size === 0) return
    if (!confirm(`למחוק ${selected.size} פניות?`)) return
    onBulkDelete(Array.from(selected))
    setSelected(new Set())
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: '#a8a29e' }}>
        <div className="text-4xl mb-2">✅</div>
        <p className="font-medium">אין פניות</p>
      </div>
    )
  }

  return (
    <div dir="rtl">
      {/* Toolbar: filters + search + view toggle */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Status filter pills */}
        <div className="flex gap-1.5 flex-wrap">
          {(['הכל', 'פתוח', 'בטיפול', 'טופל'] as const).map(f => {
            const isActive = filter === f
            const baseStyle = f === 'הכל'
              ? { background: 'var(--crm-primary)', color: '#fff' }
              : { background: STATUS_STYLE[f as TaskStatus].bg, color: STATUS_STYLE[f as TaskStatus].color }
            return (
              <button key={f} onClick={() => setFilter(f)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={isActive ? baseStyle : { background: '#fff', color: '#78716c', border: '1px solid #e5e7eb' }}>
                {f}
                <span className="rounded-full px-1.5 py-px text-xs font-bold"
                  style={{ background: isActive ? 'rgba(0,0,0,0.12)' : '#f3f4f6', color: isActive ? 'inherit' : '#9ca3af' }}>
                  {counts[f as keyof typeof counts]}
                </span>
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[160px]">
          <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#a8a29e' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש..."
            className="w-full pr-8 pl-3 py-1.5 text-xs border border-gray-200 rounded-full focus:outline-none bg-white text-right"
            style={{ borderColor: '#e5e7eb' }}
          />
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-full px-1 py-1 mr-auto">
          <button onClick={() => setViewMode('cards')}
            className="p-1.5 rounded-full transition-colors"
            style={viewMode === 'cards' ? { background: 'var(--crm-primary)', color: '#fff' } : { color: '#78716c', opacity: 0.6 }}
            title="כרטיסים">
            <Grid3X3 size={13} />
          </button>
          <button onClick={() => setViewMode('table')}
            className="p-1.5 rounded-full transition-colors"
            style={viewMode === 'table' ? { background: 'var(--crm-primary)', color: '#fff' } : { color: '#78716c', opacity: 0.6 }}
            title="טבלה">
            <List size={13} />
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl mb-3 text-sm"
          style={{ background: '#fce9e6', border: '1px solid #f5c6b8' }}>
          <span style={{ color: '#a05a4f' }}>{selected.size} נבחרו</span>
          {onBulkDelete && (
            <button onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mr-auto"
              style={{ background: '#c0392b', color: '#fff' }}>
              <Trash2 size={12} /> מחק נבחרים
            </button>
          )}
          <button onClick={() => setSelected(new Set())} className="text-xs underline" style={{ color: '#a8a29e' }}>בטל</button>
        </div>
      )}

      {/* Select all hint */}
      {selected.size === 0 && filtered.length > 0 && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <button onClick={toggleAll} className="text-xs flex items-center gap-1.5" style={{ color: '#a8a29e' }}>
            <input type="checkbox" readOnly checked={false} className="w-3.5 h-3.5 accent-[var(--crm-primary)]" />
            בחר הכל ({filtered.length})
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-8" style={{ color: '#a8a29e' }}>
          <p className="font-medium">אין תוצאות</p>
        </div>
      )}

      {/* CARD VIEW */}
      {viewMode === 'cards' && (
        <div className="space-y-2">
          {filtered.map(task => {
            const typeStyle = TYPE_STYLE[task.type] ?? TYPE_STYLE['אחר']
            const priorityStyle = PRIORITY_STYLE[task.priority]
            const isDone = task.status === 'טופל'
            const isSelected = selected.has(task.id)

            return (
              <div key={task.id} className="rounded-2xl border transition-all"
                style={{
                  background: isDone ? '#fafaf9' : '#fff',
                  borderColor: isSelected ? 'var(--crm-primary)' : task.priority === 'דחוף' ? '#e8c4d0' : '#ede8e3',
                  opacity: isDone ? 0.75 : 1,
                  boxShadow: isSelected ? '0 0 0 1.5px var(--crm-primary)' : undefined,
                }}>
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Checkbox */}
                  <div
                    onClick={() => toggleSelect(task.id)}
                    className="w-4 h-4 rounded border-2 flex-shrink-0 cursor-pointer flex items-center justify-center"
                    style={isSelected ? { background: 'var(--crm-primary)', borderColor: 'var(--crm-primary)' } : { borderColor: '#d1d5db' }}>
                    {isSelected && <span className="text-white text-xs font-bold leading-none">✓</span>}
                  </div>

                  {/* Type icon */}
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: typeStyle.bg }}>
                    {typeStyle.emoji}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: typeStyle.bg, color: typeStyle.color }}>{task.type}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: priorityStyle.bg, color: priorityStyle.color }}>{task.priority}</span>
                    </div>
                    <p className="text-sm font-medium leading-snug" style={{ color: 'var(--crm-text)' }}>{task.description}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {task.parent && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: '#78716c' }}>
                          <User size={11} />{task.parent.name || task.parent.phone}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs" style={{ color: '#a8a29e' }}>
                        <Clock size={11} />
                        {new Date(task.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusSelector status={task.status as TaskStatus} taskId={task.id}
                      onSelect={s => onStatusChange(task.id, s)} />
                    {onDelete && (
                      <button onClick={() => handleDelete(task.id)}
                        className="p-1.5 rounded-full hover:bg-red-50 transition-colors flex-shrink-0"
                        style={{ color: '#e57373' }} title="מחיקה">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === 'table' && filtered.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr style={{ background: '#fdf6ef' }} className="border-b border-gray-100">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll} className="w-4 h-4 accent-[var(--crm-primary)] cursor-pointer" />
                </th>
                <th className="text-right px-3 py-3 font-semibold" style={{ color: 'var(--crm-primary)' }}>סוג</th>
                <th className="text-right px-3 py-3 font-semibold" style={{ color: 'var(--crm-primary)' }}>תיאור</th>
                <th className="text-right px-3 py-3 font-semibold hidden sm:table-cell" style={{ color: 'var(--crm-primary)' }}>הורה</th>
                <th className="text-right px-3 py-3 font-semibold hidden md:table-cell" style={{ color: 'var(--crm-primary)' }}>עדיפות</th>
                <th className="text-right px-3 py-3 font-semibold" style={{ color: 'var(--crm-primary)' }}>סטטוס</th>
                <th className="text-right px-3 py-3 font-semibold hidden lg:table-cell" style={{ color: 'var(--crm-primary)' }}>תאריך</th>
                <th className="px-3 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task, i) => {
                const typeStyle = TYPE_STYLE[task.type] ?? TYPE_STYLE['אחר']
                const priorityStyle = PRIORITY_STYLE[task.priority]
                const isSelected = selected.has(task.id)
                return (
                  <tr key={task.id}
                    className="border-b border-gray-50 hover:bg-[#fdf9f5] transition-colors"
                    style={i % 2 !== 0 ? { background: '#fafaf9' } : {}}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(task.id)}
                        className="w-4 h-4 accent-[var(--crm-primary)] cursor-pointer" />
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: typeStyle.bg, color: typeStyle.color }}>
                        {typeStyle.emoji} {task.type}
                      </span>
                    </td>
                    <td className="px-3 py-3 max-w-xs">
                      <p className="text-sm truncate" style={{ color: 'var(--crm-text)' }}>{task.description}</p>
                    </td>
                    <td className="px-3 py-3 hidden sm:table-cell text-sm" style={{ color: '#78716c' }}>
                      {task.parent?.name || '—'}
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: priorityStyle.bg, color: priorityStyle.color }}>{task.priority}</span>
                    </td>
                    <td className="px-3 py-3">
                      <StatusSelector status={task.status as TaskStatus} taskId={task.id}
                        onSelect={s => onStatusChange(task.id, s)} />
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell text-xs" style={{ color: '#a8a29e' }}>
                      {new Date(task.created_at).toLocaleDateString('he-IL')}
                    </td>
                    <td className="px-3 py-3">
                      {onDelete && (
                        <button onClick={() => handleDelete(task.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          style={{ color: '#e57373' }} title="מחיקה">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
