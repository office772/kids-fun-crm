'use client'

import { useState, useRef, useEffect } from 'react'
import { Task, TaskStatus, TaskPriority, TaskType } from '@/lib/types'
import { ChevronDown, Check, User, Clock } from 'lucide-react'

interface Props {
  tasks: Task[]
  onStatusChange: (id: string, status: string) => void
}

// ─── Style maps ───────────────────────────────────────────────────────────────
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

// ─── StatusSelector — clickable pill + dropdown ───────────────────────────────
function StatusSelector({
  status,
  taskId,
  onSelect,
}: {
  status: TaskStatus
  taskId: string
  onSelect: (s: TaskStatus) => void
}) {
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
        <div
          className="absolute top-full mt-1 bg-white rounded-xl border shadow-xl z-50 overflow-hidden"
          style={{ borderColor: '#f0ebe8', minWidth: '110px', right: 0 }}
        >
          {ALL_STATUSES.map(opt => {
            const os = STATUS_STYLE[opt]
            return (
              <button
                key={opt}
                onClick={() => { onSelect(opt); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium hover:bg-stone-50 transition-colors"
                style={{ color: os.color }}
              >
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

// ─── Task card ────────────────────────────────────────────────────────────────
function TaskCard({ task, onStatusChange }: { task: Task; onStatusChange: (id: string, s: string) => void }) {
  const typeStyle = TYPE_STYLE[task.type] ?? TYPE_STYLE['אחר']
  const priorityStyle = PRIORITY_STYLE[task.priority]
  const isDone = task.status === 'טופל'

  return (
    <div
      className="rounded-2xl border transition-all"
      style={{
        background: isDone ? '#fafaf9' : '#fff',
        borderColor: task.priority === 'דחוף' ? '#e8c4d0' : '#ede8e3',
        opacity: isDone ? 0.72 : 1,
      }}
      dir="rtl"
    >
      <div className="flex items-center gap-3 px-4 py-3">

        {/* Type icon */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
          style={{ background: typeStyle.bg }}
        >
          {typeStyle.emoji}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
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

          {/* Description */}
          <p className="text-sm font-medium leading-snug" style={{ color: 'var(--crm-text)' }}>
            {task.description}
          </p>

          {/* Meta */}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {task.parent && (
              <span className="flex items-center gap-1 text-xs" style={{ color: '#78716c' }}>
                <User size={11} />
                {task.parent.name || task.parent.phone}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs" style={{ color: '#a8a29e' }}>
              <Clock size={11} />
              {new Date(task.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}
            </span>
          </div>
        </div>

        {/* Status selector */}
        <div className="flex-shrink-0">
          <StatusSelector
            status={task.status as TaskStatus}
            taskId={task.id}
            onSelect={s => onStatusChange(task.id, s)}
          />
        </div>
      </div>
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
      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap mb-4">
        {(['הכל', 'פתוח', 'בטיפול', 'טופל'] as const).map(f => {
          const isActive = filter === f
          const baseStyle = f === 'הכל'
            ? { background: 'var(--crm-primary)', color: '#fff' }
            : { background: STATUS_STYLE[f as TaskStatus].bg, color: STATUS_STYLE[f as TaskStatus].color }
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={
                isActive
                  ? baseStyle
                  : { background: '#fff', color: '#78716c', border: '1px solid #e5e7eb' }
              }
            >
              {f}
              <span
                className="rounded-full px-1.5 py-px text-xs font-bold"
                style={{
                  background: isActive ? 'rgba(0,0,0,0.12)' : '#f3f4f6',
                  color: isActive ? 'inherit' : '#9ca3af',
                }}
              >
                {counts[f]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Empty filtered state */}
      {filtered.length === 0 && (
        <div className="text-center py-8" style={{ color: '#a8a29e' }}>
          <p className="font-medium">אין פניות בסטטוס &quot;{filter}&quot;</p>
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
