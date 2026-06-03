'use client'

import { useState } from 'react'
import { Parent } from '@/lib/types'
import { StatusBadge } from './StatusBadge'

interface Props {
  parent: Parent
  onClose: () => void
  onEdit?: () => void
  onDelete?: () => void
}

export function ParentCard({ parent, onClose, onEdit, onDelete }: Props) {
  const [activeTab, setActiveTab] = useState<'info' | 'history'>('info')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const latestPayment = parent.payments?.[0]
  const openTasks = parent.tasks?.filter(t => t.status !== 'טופל') || []

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        {/* כותרת */}
        <div className="p-6 text-white" style={{ background: 'var(--crm-primary)' }}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold">{parent.name || 'הורה לא מזוהה'}</h2>
              <p className="mt-1 opacity-80 text-sm">📱 {parent.phone}</p>
              {parent.email && <p className="opacity-70 text-sm">{parent.email}</p>}
            </div>
            <div className="flex items-center gap-2">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="bg-white/20 hover:bg-white/30 rounded-full w-10 h-10 flex items-center justify-center text-lg transition-colors"
                  title="עריכה"
                >
                  ✏️
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="bg-white/20 hover:bg-red-500/60 rounded-full w-10 h-10 flex items-center justify-center text-lg transition-colors"
                  title="מחיקה"
                >
                  🗑️
                </button>
              )}
              <button
                onClick={onClose}
                className="bg-white/20 hover:bg-white/30 rounded-full w-10 h-10 flex items-center justify-center text-xl transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* ילדים */}
          <div className="mt-4 flex flex-wrap gap-2">
            {parent.children?.map(child => (
              <span key={child.id} className="bg-white/20 rounded-full px-3 py-1 text-sm">
                👧 {child.name} — {child.class_name} ({child.framework})
              </span>
            ))}
          </div>
        </div>

        {/* טאבים */}
        <div className="border-b border-stone-200">
          <div className="flex">
            <button
              className={`flex-1 py-3 text-base font-medium transition-colors ${activeTab === 'info'
                ? 'border-b-2'
                : 'text-gray-500 hover:text-gray-700'}`}
              style={activeTab === 'info' ? { borderColor: 'var(--crm-primary)', color: 'var(--crm-primary)' } : {}}
              onClick={() => setActiveTab('info')}
            >
              פרטים וסטטוס
            </button>
            <button
              className={`flex-1 py-3 text-base font-medium transition-colors ${activeTab === 'history'
                ? 'border-b-2'
                : 'text-gray-500 hover:text-gray-700'}`}
              style={activeTab === 'history' ? { borderColor: 'var(--crm-primary)', color: 'var(--crm-primary)' } : {}}
              onClick={() => setActiveTab('history')}
            >
              היסטוריית שיחה ({parent.conversations?.length || 0})
            </button>
          </div>
        </div>

        {/* תוכן */}
        <div className="overflow-y-auto max-h-[50vh] p-6">
          {activeTab === 'info' && (
            <div className="space-y-4">
              {/* סטטוס תשלום */}
              <div className="bg-stone-50 rounded-xl p-4">
                <h3 className="font-bold text-stone-700 mb-3 text-base">💳 תשלומים</h3>
                {parent.payments?.length ? (
                  <div className="space-y-2">
                    {parent.payments.map(p => (
                      <div key={p.id} className="flex items-center justify-between">
                        <span className="text-stone-600">
                          {p.amount ? `₪${p.amount}` : 'סכום לא ידוע'}
                          {p.due_date && ` — עד ${new Date(p.due_date).toLocaleDateString('he-IL')}`}
                        </span>
                        <StatusBadge status={p.status} size="sm" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-stone-400 text-sm">אין מידע על תשלומים</p>
                )}
              </div>

              {/* משימות פתוחות */}
              {openTasks.length > 0 && (
                <div className="rounded-xl p-4" style={{ background: '#FCEAEA', border: '1px solid #EF444433' }}>
                  <h3 className="font-bold mb-3 text-base" style={{ color: '#EF4444' }}>⚠️ פניות פתוחות</h3>
                  <div className="space-y-2">
                    {openTasks.map(task => (
                      <div key={task.id} className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-stone-800">{task.type}</p>
                          <p className="text-stone-500 text-sm">{task.description}</p>
                        </div>
                        <StatusBadge status={task.priority} size="sm" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* הערות */}
              {parent.notes && (
                <div className="rounded-xl p-4" style={{ background: '#F0EBF3' }}>
                  <h3 className="font-bold mb-2" style={{ color: '#6D436D' }}>📝 הערות</h3>
                  <p className="text-stone-700">{parent.notes}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              {parent.conversations?.length ? (
                [...(parent.conversations || [])].reverse().map(msg => (
                  <div
                    key={msg.id}
                    className="rounded-xl p-3 max-w-[85%]"
                    style={msg.direction === 'נכנס'
                      ? { background: '#F0F1F2', marginRight: 'auto' }
                      : { background: '#FEF9C3', border: '1px solid #FAD98066', marginLeft: 'auto' }
                    }
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-stone-400">
                        {msg.direction === 'נכנס' ? '👤 הורה' : '🤖 בוט'}
                      </span>
                      {msg.intent && (
                        <span className="text-xs bg-white rounded-full px-2 text-stone-500 border">
                          {msg.intent}
                        </span>
                      )}
                    </div>
                    <p className="text-stone-700 text-sm whitespace-pre-line">{msg.message_text}</p>
                    <p className="text-xs text-stone-400 mt-1">
                      {new Date(msg.created_at).toLocaleString('he-IL')}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-stone-400 text-center py-8">אין היסטוריית שיחה</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* דיאלוג אישור מחיקה */}
      {confirmDelete && (
        <div className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center p-6 z-10">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
            <div className="text-5xl mb-3">🗑️</div>
            <h3 className="text-xl font-bold text-stone-800 mb-2">מחיקת הורה</h3>
            <p className="text-stone-500 mb-6">
              האם למחוק את <strong>{parent.name}</strong>?<br />
              <span className="text-sm text-red-500">פעולה זו אינה ניתנת לביטול</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  setDeleting(true)
                  await onDelete?.()
                  setDeleting(false)
                }}
                disabled={deleting}
                className="flex-1 font-bold py-3 rounded-xl transition-colors disabled:opacity-60 text-white"
                style={{ background: '#EF4444' }}
                onMouseOver={e => (e.currentTarget.style.background = '#DC2626')}
                onMouseOut={e => (e.currentTarget.style.background = '#EF4444')}
              >
                {deleting ? 'מוחק...' : 'כן, מחק'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium py-3 rounded-xl transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
