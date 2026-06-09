'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, Users, ClipboardList, FileText } from 'lucide-react'
import { Parent, Task } from '@/lib/types'

interface Props {
  parents: Parent[]
  suppliers: Parent[]
  tasks: Task[]
  onClose: () => void
  onNavigate: (tab: 'parents' | 'tasks' | 'registrations' | 'suppliers', itemId?: string) => void
}

export function GlobalSearch({ parents, suppliers, tasks, onClose, onNavigate }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const q = query.toLowerCase().trim()

  const matchedParents = q.length < 2 ? [] : parents.filter(p =>
    p.name?.toLowerCase().includes(q) ||
    p.phone?.includes(q) ||
    p.email?.toLowerCase().includes(q) ||
    p.children?.some(c => c.name?.toLowerCase().includes(q))
  ).slice(0, 6)

  const matchedSuppliers = q.length < 2 ? [] : suppliers.filter(s =>
    s.name?.toLowerCase().includes(q) || s.phone?.includes(q)
  ).slice(0, 4)

  const matchedTasks = q.length < 2 ? [] : tasks.filter(t =>
    t.description?.toLowerCase().includes(q) ||
    t.parent?.name?.toLowerCase().includes(q)
  ).slice(0, 4)

  const total = matchedParents.length + matchedSuppliers.length + matchedTasks.length

  const Avatar = ({ name, bg, color }: { name?: string; bg: string; color: string }) => (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
      style={{ background: bg, color }}>
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
        style={{ border: '1px solid #ede8e3' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <Search size={18} className="flex-shrink-0" style={{ color: '#a8a29e' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="חיפוש גלובאלי — הורים, פניות, ספקים..."
            className="flex-1 text-base focus:outline-none bg-transparent text-right"
            style={{ color: '#5E4B35' }}
            dir="rtl"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={16} />
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors mr-1">
            <kbd className="text-xs px-1.5 py-0.5 rounded border border-gray-200 font-mono">ESC</kbd>
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[420px] overflow-y-auto" dir="rtl">

          {q.length < 2 && (
            <div className="text-center py-10">
              <div className="text-3xl mb-2">🔍</div>
              <p className="text-sm" style={{ color: '#a8a29e' }}>הקלידי לפחות 2 תווים לחיפוש</p>
              <p className="text-xs mt-1" style={{ color: '#c7bcb6' }}>ניתן לחפש לפי שם, טלפון, שם ילד/ה</p>
            </div>
          )}

          {q.length >= 2 && total === 0 && (
            <div className="text-center py-10">
              <div className="text-3xl mb-2">😔</div>
              <p className="text-sm" style={{ color: '#a8a29e' }}>לא נמצאו תוצאות עבור &ldquo;{query}&rdquo;</p>
            </div>
          )}

          {/* הורים */}
          {matchedParents.length > 0 && (
            <div>
              <div className="px-4 py-2 flex items-center gap-2 text-xs font-semibold sticky top-0"
                style={{ background: '#fdf6ef', color: '#9B5E3D' }}>
                <Users size={12} />
                הורים ({matchedParents.length})
              </div>
              {matchedParents.map(p => (
                <button
                  key={p.id}
                  onClick={() => { onNavigate('parents', p.id); onClose() }}
                  className="w-full text-right px-4 py-3 hover:bg-[#fdf9f5] transition-colors flex items-center gap-3 border-b border-gray-50"
                >
                  <Avatar name={p.name} bg="#f0e8e4" color="#9B5E3D" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate" style={{ color: '#5E4B35' }}>{p.name || 'הורה'}</p>
                    <p className="text-xs truncate" style={{ color: '#a8a29e' }}>
                      {p.phone}
                      {p.children?.[0] ? ` · ${p.children[0].name}` : ''}
                    </p>
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: '#c7bcb6' }}>הורים →</span>
                </button>
              ))}
            </div>
          )}

          {/* ספקים */}
          {matchedSuppliers.length > 0 && (
            <div>
              <div className="px-4 py-2 flex items-center gap-2 text-xs font-semibold sticky top-0"
                style={{ background: '#f0ebf3', color: '#6D436D' }}>
                🏢 ספקים ({matchedSuppliers.length})
              </div>
              {matchedSuppliers.map(s => (
                <button
                  key={s.id}
                  onClick={() => { onNavigate('suppliers'); onClose() }}
                  className="w-full text-right px-4 py-3 hover:bg-[#f9f5fb] transition-colors flex items-center gap-3 border-b border-gray-50"
                >
                  <Avatar name={s.name} bg="#e8d5e8" color="#6D436D" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate" style={{ color: '#5E4B35' }}>{s.name}</p>
                    <p className="text-xs" style={{ color: '#a8a29e' }}>{s.phone?.startsWith('gi_') ? 'ייובא מחשבונית ירוקה' : s.phone}</p>
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: '#c7bcb6' }}>ספקים →</span>
                </button>
              ))}
            </div>
          )}

          {/* פניות */}
          {matchedTasks.length > 0 && (
            <div>
              <div className="px-4 py-2 flex items-center gap-2 text-xs font-semibold sticky top-0"
                style={{ background: '#fef9f5', color: '#a05a4f' }}>
                <ClipboardList size={12} />
                פניות ({matchedTasks.length})
              </div>
              {matchedTasks.map(t => (
                <button
                  key={t.id}
                  onClick={() => { onNavigate('tasks'); onClose() }}
                  className="w-full text-right px-4 py-3 hover:bg-[#fdf9f5] transition-colors flex items-center gap-3 border-b border-gray-50"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                    style={{ background: '#fce9e6' }}>
                    <ClipboardList size={14} color="#a05a4f" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate" style={{ color: '#5E4B35' }}>{t.description}</p>
                    <p className="text-xs" style={{ color: '#a8a29e' }}>
                      {t.parent?.name ?? ''}
                      {t.parent?.name ? ' · ' : ''}{t.status}
                    </p>
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: '#c7bcb6' }}>פניות →</span>
                </button>
              ))}
            </div>
          )}

          {/* Registrations placeholder */}
          {q.length >= 2 && total > 0 && (
            <div>
              <button
                onClick={() => { onNavigate('registrations'); onClose() }}
                className="w-full text-right px-4 py-3 hover:bg-[#fdf9f5] transition-colors flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: '#e6f4ef' }}>
                  <FileText size={14} color="#297058" />
                </div>
                <p className="text-sm" style={{ color: '#297058' }}>חפש &ldquo;{query}&rdquo; גם ברישומים →</p>
              </button>
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs" style={{ color: '#c7bcb6' }}>
            {q.length >= 2 && total > 0 ? `${total} תוצאות` : ''}
          </span>
          <span className="text-xs" style={{ color: '#c7bcb6' }}>
            ESC לסגירה
          </span>
        </div>
      </div>
    </div>
  )
}
