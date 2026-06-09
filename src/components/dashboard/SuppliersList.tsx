'use client'

import { useState } from 'react'
import { Trash2, Pencil, Grid3X3, List } from 'lucide-react'
import { Parent } from '@/lib/types'
import { AddParentModal, FormData as ModalFormData } from './AddParentModal'

interface Props {
  suppliers: Parent[]
  onRefresh: () => void
}

export function SuppliersList({ suppliers, onRefresh }: Props) {
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingSupplier, setEditingSupplier] = useState<Parent | null>(null)

  const filtered = suppliers.filter(s =>
    !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.phone?.includes(search)
  )

  const toggleSelect = (id: string) => {
    setSelected(prev => { const s = new Set(prev); if (s.has(id)) { s.delete(id) } else { s.add(id) } return s })
  }
  const toggleAll = () => {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(s => s.id)))
  }

  const handleDelete = async (id: string) => {
    if (!confirm('למחוק ספק זה?')) return
    await fetch('/api/parents', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id] }) })
    onRefresh()
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`למחוק ${selected.size} ספקים?`)) return
    const ids = Array.from(selected)
    await fetch('/api/parents', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
    setSelected(new Set())
    onRefresh()
  }

  const handleEdit = async (data: ModalFormData) => {
    if (!editingSupplier) return
    await fetch(`/api/parents/${editingSupplier.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    onRefresh()
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            placeholder="🔍  חיפוש לפי שם..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none bg-white text-right"
            onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
            onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
          />
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-full px-1 py-1">
          <button onClick={() => setViewMode('table')}
            className="p-1.5 rounded-full transition-colors"
            style={viewMode === 'table' ? { background: 'var(--crm-primary)', color: '#fff' } : { color: '#78716c', opacity: 0.6 }}
            title="טבלה">
            <List size={14} />
          </button>
          <button onClick={() => setViewMode('cards')}
            className="p-1.5 rounded-full transition-colors"
            style={viewMode === 'cards' ? { background: 'var(--crm-primary)', color: '#fff' } : { color: '#78716c', opacity: 0.6 }}
            title="כרטיסים">
            <Grid3X3 size={14} />
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl mb-3 text-sm"
          style={{ background: '#fce9e6', border: '1px solid #f5c6b8' }}>
          <span style={{ color: '#a05a4f' }}>{selected.size} נבחרו</span>
          <button onClick={handleBulkDelete}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mr-auto"
            style={{ background: '#c0392b', color: '#fff' }}>
            <Trash2 size={12} /> מחק נבחרים
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs underline" style={{ color: '#a8a29e' }}>בטל</button>
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="border-b border-gray-100" style={{ background: '#fdf6ef' }}>
                <th className="px-4 py-3 w-8">
                  <input type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-[var(--crm-primary)] cursor-pointer" />
                </th>
                <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--crm-primary)' }}>שם</th>
                <th className="text-right px-4 py-3 font-semibold hidden sm:table-cell" style={{ color: 'var(--crm-primary)' }}>טלפון / מזהה</th>
                <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--crm-primary)' }}>תשלומים</th>
                <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--crm-primary)' }}>סה״כ</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const totalPaid = s.payments?.reduce((sum, p) => sum + (p.amount ?? 0), 0) ?? 0
                const isReal = !s.phone?.startsWith('gi_')
                const isSelected = selected.has(s.id)
                return (
                  <tr key={s.id}
                    className="border-b border-gray-50 hover:bg-[#fdf9f5] transition-colors"
                    style={isSelected ? { background: '#fdf6ef' } : i % 2 !== 0 ? { background: '#fafafa' } : {}}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(s.id)}
                        className="w-4 h-4 accent-[var(--crm-primary)] cursor-pointer" />
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--crm-text)' }}>
                      🏢 {s.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">
                      {isReal ? s.phone : <span className="text-gray-300 italic">ייובא מחשבונית ירוקה</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {s.payments?.length ?? 0} תשלומים
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: 'var(--crm-primary)' }}>
                      {totalPaid > 0 ? `₪${totalPaid.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setEditingSupplier(s)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                          style={{ color: '#a8a29e' }} title="עריכה">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(s.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          style={{ color: '#e57373' }} title="מחיקה">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">אין ספקים להצגה</div>
          )}
        </div>
      )}

      {/* CARD VIEW */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => {
            const totalPaid = s.payments?.reduce((sum, p) => sum + (p.amount ?? 0), 0) ?? 0
            const isReal = !s.phone?.startsWith('gi_')
            const isSelected = selected.has(s.id)
            return (
              <div key={s.id}
                className="bg-white rounded-2xl border p-5 hover:shadow-md transition-all flex flex-col gap-3"
                style={isSelected
                  ? { borderColor: 'var(--crm-primary)', boxShadow: '0 0 0 2px var(--crm-primary)' }
                  : { borderColor: '#ede8e3' }}>
                {/* Top row: checkbox + actions */}
                <div className="flex items-start justify-between">
                  <div
                    className="w-5 h-5 rounded border-2 flex-shrink-0 cursor-pointer flex items-center justify-center"
                    style={isSelected ? { background: 'var(--crm-primary)', borderColor: 'var(--crm-primary)' } : { borderColor: '#d1d5db' }}
                    onClick={() => toggleSelect(s.id)}>
                    {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditingSupplier(s)}
                      className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100"
                      style={{ color: '#a8a29e' }}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDelete(s.id)}
                      className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-50"
                      style={{ color: '#e57373' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Name */}
                <div>
                  <p className="font-bold text-base" style={{ color: 'var(--crm-text)' }}>🏢 {s.name || '—'}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#a8a29e' }}>
                    {isReal ? s.phone : 'ייובא מחשבונית ירוקה'}
                  </p>
                </div>

                {/* Stats */}
                <div className="flex gap-3 text-xs">
                  <span style={{ color: '#78716c' }}>💳 {s.payments?.length ?? 0} תשלומים</span>
                  {totalPaid > 0 && (
                    <span className="font-semibold" style={{ color: 'var(--crm-primary)' }}>
                      ₪{totalPaid.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="col-span-3 text-center py-12 text-gray-400">אין ספקים להצגה</div>
          )}
        </div>
      )}

      {/* Edit modal */}
      {editingSupplier && (
        <AddParentModal
          onClose={() => setEditingSupplier(null)}
          onSave={handleEdit}
          editParent={editingSupplier}
        />
      )}
    </>
  )
}
