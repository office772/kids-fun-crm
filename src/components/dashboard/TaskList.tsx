'use client'

import { useState } from 'react'
import { Task } from '@/lib/types'
import { StatusBadge } from './StatusBadge'

interface Props {
  tasks: Task[]
  onStatusChange: (id: string, status: string) => void
}

export function TaskList({ tasks, onStatusChange }: Props) {
  const openTasks = tasks.filter(t => t.status !== 'טופל')
  const urgentTasks = openTasks.filter(t => t.priority === 'דחוף')

  return (
    <div className="space-y-3">
      {tasks.length === 0 && (
        <div className="text-center py-8 text-stone-400">
          <div className="text-4xl mb-2">✅</div>
          <p>אין פניות פתוחות</p>
        </div>
      )}

      {tasks.map(task => (
        <div
          key={task.id}
          className="rounded-xl p-4 border transition-all shadow-sm hover:shadow-md"
          style={
            task.priority === 'דחוף'
              ? { background: '#FAF5EE', borderColor: '#e8c4d0' }
              : task.priority === 'גבוה'
                ? { background: '#FAF5EE', borderColor: '#f0cfc4' }
                : { background: '#fff', borderColor: '#f3f4f6' }
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge status={task.priority} size="sm" />
                <span className="text-sm font-semibold text-stone-700">{task.type}</span>
              </div>
              <p className="text-stone-600 text-sm">{task.description}</p>
              {task.parent && (
                <p className="text-stone-400 text-xs mt-1">
                  👤 {task.parent.name || task.parent.phone}
                </p>
              )}
              <p className="text-stone-400 text-xs mt-1">
                {new Date(task.created_at).toLocaleString('he-IL')}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <StatusBadge status={task.status} size="sm" />
              {task.status !== 'טופל' && (
                <div className="flex gap-1">
                  {task.status === 'פתוח' && (
                    <button
                      onClick={() => onStatusChange(task.id, 'בטיפול')}
                      className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full px-3 py-1 transition-colors"
                    >
                      בטיפול
                    </button>
                  )}
                  <button
                    onClick={() => onStatusChange(task.id, 'טופל')}
                    className="text-xs rounded-full px-3 py-1 transition-colors hover:opacity-90 text-white"
                    style={{ background: 'var(--crm-primary)' }}
                  >
                    טופל ✓
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
