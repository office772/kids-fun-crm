'use client'

import { useState, useRef, useEffect } from 'react'
import { Task, TaskStatus, TaskPriority, TaskType } from '@/lib/types'
import { ChevronDown, X, Check, User, Clock, MessageSquare } from 'lucide-react'

interface Props {
  tasks: Task[]
  onStatusChange: (id: string, status: string) => void
}

// ─── Status pill colors ───────────────────────────────────────────────────────
const STATUS_STYLE: Record<TaskStatus, { bg: string; color: string; dot: string }> = {
  'פתוח':   { bg: '#fce9e6', color: '#a05a4f', dot: '#D29486' },
  'בטיפול': { bg: '#6D436D', color: '#ffffff', dot: '#ffffff' },
  'טופל':   { bg: '#f0fdf4', color: '#15803d', dot: '#16a34a' },
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
  'שאלה כללית': { emoji: '💬', bg: '#f0f4ff', color: '#4f5fa3' },
  'רשימת המתנה':{ emoji: '⏳', bg: '#fef3c7', color: '#b45309' },
  'תלונה':      { emoji: '⚠️', bg: '#f5dde5', color: '#7d2d4a' },
  'אחר':        { emoji: '📌', bg: '#f5f5f4', color: '#78716c' },
}

const ALL_STATUSES: TaskStatus[] = ['פתוח', 'בטיפול', 'טופל']

// ─── Inline status selector ───────────────────────────────────────────────────
function StatusSelector({
  status,
  onSelect,
}: {
  status: TaskStatus
  onSelect: (s: TaskStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const style = STATUS_STYLE[status]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
        style={{ background: style.bg, color: style.color }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: style.dot }}
        />
        {status}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 bg-white rounded-xl border shadow-lg z-50 overflow-hidden min-w-[110px]"
          style={{ borderColor: '#f3f4f6' }}
        >
          {ALL_STATUSES.map(s => {
            const st = STATUS_STYLE[s]
            const isCurrent = s === status
            return (
              <button
                key={s}
                onClick={() => {
                  onSelect(s)
                  setOpen(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-stone-50 transition-colors"
                style={{ color: st.color }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: st.dot }}
                />
                {s}
                {isCurrent && <Check size={11} className="mr-auto" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Task card ────────────────────────────────────────────────────────────────
function TaskCard({
  task,
  onStatusChange,
}: {
  task: Task
  onStatusChange: (id: string, status: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const typeStyle = TYPE_STYLE[task.type] ?? TYPE_STYLE['אחר']
  const priorityStyle = PRIORITY_STYLE[task.priority]
  const isDone = task.status === 'טופל'

  return (
    <div
      className="rounded-xl border transition-all"
      style={{
        background: isDone ? '#fafafa' : '#fff',
        borderColor: task.priority === 'דחוף' ? '#e8c4d0' : '#f0e8e8',
        opacity: isDone ? 0.75 : 1,
      }}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 p-3">
        {/* Type badge */}
        <div
          className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-base"
          style={{ background: typeStyle.bg }}
        >
          {typeStyle.emoji}
        </div>

        {/* Middle content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: typeStyle.bg, color: typeStyle.color }}
            >
              {task.type}
            </span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: priorityStyle.bg, color: priorityStyle.color }}
            >
              {task.priority}
            </span>
          </div>

          <p
            className="text-sm font-medium mt-0.5 truncate"
            style={{ color: 'var(--crm-text)' }}
          >
            {task.description}
          </p>

          <div className="flex items-center gap-3 mt-1">
            {task.parent && (
              <span className="flex items-center gap-1 text-xs" style={{ color: '#78716c' }}>
                <User size={11} />
                {task.parent.name || task.parent.phone}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs" style={{ color: '#a8a29e' }}>
              <Clock size={11} />
              {new Date(task.created_at).toLocaleDateString('he-IL', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          </div>
        </div>

        {/* Inline status selector */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <StatusSelector
            status={task.status as TaskStatus}
            onSelect={s => onStatusChange(task.id, s)}
          />
          <button
            onClick={() => setExpanded(prev => !prev)}
            className="p-1 rounded-lg hover:bg-stone-100 transition-colors"
            style={{ color: '#a8a29e' }}
          >
            <MessageSquare size={15} />
          </button>
        </div>
      </div>

      {/* Expanded notes (if any description is long) */}
      {expanded && (
        <div
          className="px-4 pb-4 text-sm border-t"
          style={{ borderColor: '#f5f5f4', color: 'var(--crm-text)', opacity: 0.75 }}
        >
          <p className="mt-3 leading-relaxed">{task.description}</p>
          {task.assigned_to && (
            <p className="mt-2 text-xs" style={{ color: '#78716c' }}>
              מוקצה ל: {task.assigned_to}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── TaskList ─────────────────────────────────────────────────────────────────
export function TaskList({ tasks, onStatusChange }: Props) {
  const [filter, setFilter] = useState<TaskStatus | 'הכל'>('הכל')

  const filtered = filter === 'הכל' ? tasks : tasks.filter(t => t.status === filter)
  const counts = {
    הכל: tasks.length,
    פתוח: tasks.filter(t => t.status === 'פתוח').length,
    בטיפול: tasks.filter(t => t.status === 'בטיפול').length,
    טופל: tasks.filter(t => t.status === 'טופל').length,
  }

  return (
    <div>
      {/* Filter pills */}
      {tasks.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {(['הכל', 'פתוח', 'בטיפול', 'טופל'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={
                filter === f
                  ? f === 'הכל'
                    ? { background: 'var(--crm-primary)', color: '#fff' }
                    : { background: STATUS_STYLE[f as TaskStatus]?.bg ?? 'var(--crm-primary)', color: STATUS_STYLE[f as TaskStatus]?.color ?? '#fff' }
                  : { background: '#fff', color: '#78716c', border: '1px solid #e5e7eb' }
              }
            >
              {f}
              <span
                className="text-xs rounded-full px-1.5 py-0.5 font-bold"
                style={{
                  background: filter === f ? 'rgba(0,0,0,0.12)' : '#f3f4f6',
                  color: filter === f ? 'inherit' : '#9ca3af',
                }}
              >
                {counts[f]}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-10" style={{ color: '#a8a29e' }}>
          <div className="text-4xl mb-2">✅</div>
          <p className="font-medium">
            {filter === 'הכל' ? 'אין פניות' : `אין פניות בסטטוס "${filter}"`}
          </p>
        </div>
      )}

      {/* Cards */}
      <div className="space-y-2">
        {filtered.map(task => (
          <TaskCard key={task.id} task={task} onStatusChange={onStatusChange} />
        ))}
      </div>
    </div>
  )
}
