'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Pencil, Trash2, X, Check,
  Link2, FileText, Image, ExternalLink,
  Copy, CheckCheck,
  Upload, Loader2, Eye, ZoomIn, LayoutGrid, List, Search,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type AssetType = 'link' | 'pdf' | 'image' | 'payment' | 'form'

interface BotAsset {
  id: string
  key: string
  title: string
  type: AssetType
  url: string
  description?: string
  is_active: boolean
  sort_order: number
  created_at: string
}

const TYPE_META: Record<AssetType, { label: string; icon: React.ReactNode; dot: string }> = {
  form:    { label: 'טופס רישום', icon: <FileText    size={14} />, dot: '#6D436D' },
  link:    { label: 'קישור',      icon: <Link2        size={14} />, dot: '#9B4A38' },
  pdf:     { label: 'PDF',        icon: <FileText     size={14} />, dot: '#C98A2B' },
  image:   { label: 'תמונה',     icon: <Image        size={14} />, dot: '#D29486' },
  payment: { label: 'תשלום',     icon: <ExternalLink size={14} />, dot: '#B0455E' },
}

// ─── צ'יפ קונטור רך (מסגרת + נקודה, מינימום צביעה) ─────────────────────────
function Chip({ label, dot, icon }: { label: string; dot?: string; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full border"
      style={{ background: 'var(--crm-surface)', borderColor: 'var(--crm-border)', color: 'var(--crm-text-muted)' }}>
      {icon ?? (dot && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />)}
      {label}
    </span>
  )
}

// ─── סטטוס פעיל/כבוי — קו-מתאר ─────────────────────────────────────────────
function AssetActivePill({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-colors hover:bg-crm-surface-soft flex-shrink-0"
      style={active
        ? { borderColor: 'var(--crm-primary)', color: 'var(--crm-primary)' }
        : { borderColor: 'var(--crm-border)', color: 'var(--crm-text-muted)' }}
      title={active ? 'פעיל — לחצי לכיבוי' : 'כבוי — לחצי להפעלה'}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? 'var(--crm-primary)' : 'var(--crm-text-muted)' }} />
      {active ? 'פעיל' : 'כבוי'}
    </button>
  )
}

// סוגים שתומכים בהעלאת קובץ
const UPLOADABLE: AssetType[] = ['pdf', 'image']

const emptyForm: Omit<BotAsset, 'id' | 'created_at'> = {
  key: '', title: '', type: 'link', url: '', description: '', is_active: true, sort_order: 99,
}

// ─── Preview Modal ────────────────────────────────────────────────────────────
function PreviewModal({ asset, onClose }: { asset: BotAsset; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-2xl w-full max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-crm-border">
          <span className="font-semibold text-sm" style={{ color: 'var(--crm-text)' }}>{asset.title}</span>
          <div className="flex items-center gap-2">
            <a href={asset.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full"
              style={{ background: '#F0EBF3', color: '#6D436D' }}>
              <ExternalLink size={12} /> פתח בטאב חדש
            </a>
            <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-crm-surface-soft flex items-center justify-center">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* content */}
        <div className="flex-1 overflow-hidden">
          {asset.type === 'image' ? (
            <div className="flex items-center justify-center p-4 bg-crm-surface-soft h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.url} alt={asset.title} className="max-h-[60vh] rounded-xl object-contain shadow-sm" />
            </div>
          ) : (
            // PDF + קישורים — iframe
            <iframe
              src={asset.url}
              className="w-full"
              style={{ height: '60vh', border: 'none' }}
              title={asset.title}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Upload Button ─────────────────────────────────────────────────────────────
function UploadButton({
  type, onUploaded,
}: {
  type: AssetType
  onUploaded: (url: string) => void
}) {
  const inputRef   = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const accept = type === 'pdf' ? 'application/pdf' : 'image/*'

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch('/api/admin/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'שגיאה')
      onUploaded(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה')
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
        style={{ background: '#F0EBF3', color: '#6D436D' }}
      >
        {loading
          ? <><Loader2 size={14} className="animate-spin" /> מעלה...</>
          : <><Upload size={14} /> העלאת קובץ</>
        }
      </button>
      {error && <p className="text-xs" style={{ color: '#EF4444' }}>{error}</p>}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function BotAssets() {
  const [assets, setAssets]               = useState<BotAsset[]>([])
  const [loading, setLoading]             = useState(true)
  const [showModal, setShowModal]         = useState(false)
  const [editItem, setEditItem]           = useState<BotAsset | null>(null)
  const [form, setForm]                   = useState(emptyForm)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [copied, setCopied]               = useState<string | null>(null)
  const [typeFilter, setTypeFilter]       = useState<AssetType | 'all'>('all')
  const [preview, setPreview]             = useState<BotAsset | null>(null)
  const [view, setView]                   = useState<'cards' | 'table'>('cards')
  const [search, setSearch]               = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/bot-assets')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAssets(Array.isArray(data) ? data : [])
    } catch {
      setAssets([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openAdd = () => { setEditItem(null); setForm(emptyForm); setShowModal(true) }
  const openEdit = (item: BotAsset) => {
    setEditItem(item)
    setForm({ key: item.key, title: item.title, type: item.type, url: item.url, description: item.description ?? '', is_active: item.is_active, sort_order: item.sort_order })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.key || !form.title) return
    const method = editItem ? 'PATCH' : 'POST'
    const body   = editItem ? { id: editItem.id, ...form } : form
    await fetch('/api/admin/bot-assets', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setShowModal(false)
    await load()
  }

  const handleDelete = async (id: string) => {
    await fetch('/api/admin/bot-assets', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })
    setDeleteConfirm(null)
    await load()
  }

  const toggleActive = async (item: BotAsset) => {
    await fetch('/api/admin/bot-assets', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, is_active: !item.is_active }),
    })
    setAssets(prev => prev.map(a => a.id === item.id ? { ...a, is_active: !a.is_active } : a))
  }

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(`{${key}}`)
    setCopied(key)
    setTimeout(() => setCopied(null), 1800)
  }

  const filtered = assets.filter(a => {
    if (typeFilter !== 'all' && a.type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!a.title.toLowerCase().includes(q) && !a.key.toLowerCase().includes(q) && !(a.url ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })
  const canPreview = (a: BotAsset) => !!a.url && (a.type === 'pdf' || a.type === 'image' || a.type === 'link' || a.type === 'form')

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm" style={{ color: 'var(--crm-text-muted)' }}>
          {assets.length} נכסים · {assets.filter(a => a.is_active).length} פעילים
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-crm-surface border border-crm-border rounded-full px-1 py-1">
            <button onClick={() => setView('cards')} className="p-1.5 rounded-full transition-colors"
              style={view === 'cards' ? { background: 'var(--crm-primary)', color: '#fff' } : { color: 'var(--crm-text-muted)' }} title="כרטיסים">
              <LayoutGrid size={15} />
            </button>
            <button onClick={() => setView('table')} className="p-1.5 rounded-full transition-colors"
              style={view === 'table' ? { background: 'var(--crm-primary)', color: '#fff' } : { color: 'var(--crm-text-muted)' }} title="טבלה">
              <List size={15} />
            </button>
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm hover:opacity-90 transition-opacity"
            style={{ background: 'var(--crm-action)', color: 'var(--crm-text)' }}>
            <Plus size={15} /> הוסף
          </button>
        </div>
      </div>

      {/* Info — קונטור רך */}
      <div className="rounded-crm p-4 text-sm border border-crm-border bg-crm-surface-soft" style={{ color: 'var(--crm-text)' }}>
        <p className="font-semibold mb-1" style={{ color: 'var(--crm-primary)' }}>💡 איך זה עובד?</p>
        <p style={{ color: 'var(--crm-text-muted)' }}>כל נכס מקבל <strong>מפתח</strong>. הבוט שולף את ה-URL לפי המפתח. לחיצה על המפתח מעתיקה <code className="px-1 rounded border border-crm-border bg-crm-surface">{'{'}key{'}'}</code> להדבקה בטקסטי הבוט.</p>
      </div>

      {/* Toolbar: search + type dropdown */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--crm-text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי כותרת, מפתח או קישור..."
            className="w-full border rounded-full pr-9 pl-3 py-2 text-sm focus:outline-none bg-crm-surface text-right"
            style={{ borderColor: 'var(--crm-border)' }} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as AssetType | 'all')}
          className="rounded-full border bg-crm-surface px-4 py-2 text-sm cursor-pointer focus:outline-none"
          style={typeFilter !== 'all'
            ? { borderColor: 'var(--crm-primary)', color: 'var(--crm-primary)', fontWeight: 600 }
            : { borderColor: 'var(--crm-border)', color: 'var(--crm-text)' }}>
          <option value="all">כל הסוגים</option>
          {(['form', 'link', 'pdf', 'image', 'payment'] as const).map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin" size={28} style={{ color: 'var(--crm-border)' }} /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-14 text-crm-text-muted">
          <div className="text-4xl mb-2">📂</div>
          <p>אין נכסים להצגה</p>
        </div>
      ) : view === 'cards' ? (
        /* Cards — קונטור רך */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(asset => {
            const meta = TYPE_META[asset.type]
            return (
              <div key={asset.id}
                className="bg-crm-surface rounded-crm border border-crm-border p-4 flex items-start gap-3 transition-shadow hover:shadow-crm"
                style={{ opacity: asset.is_active ? 1 : 0.55 }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border"
                  style={{ background: 'var(--crm-surface-soft)', borderColor: 'var(--crm-border)', color: meta.dot }}>
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="font-semibold text-sm" style={{ color: 'var(--crm-text)' }}>{asset.title}</span>
                    <button onClick={() => copyKey(asset.key)}
                      className="flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded-full border hover:bg-crm-surface-soft transition-colors"
                      style={{ background: 'var(--crm-surface)', borderColor: 'var(--crm-border)', color: 'var(--crm-text-muted)' }}
                      title="העתק מפתח">
                      {copied === asset.key ? <CheckCheck size={11} /> : <Copy size={11} />}
                      {asset.key}
                    </button>
                    <Chip label={meta.label} dot={meta.dot} />
                  </div>
                  {asset.description && (
                    <p className="text-xs mb-0.5 truncate" style={{ color: 'var(--crm-text-muted)' }}>{asset.description}</p>
                  )}
                  {asset.url ? (
                    <p className="text-xs truncate" dir="ltr" style={{ color: 'var(--crm-text-muted)' }}>
                      {asset.url.replace(/^https?:\/\//, '').slice(0, 65)}
                    </p>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--crm-danger)' }}>⚠️ אין URL — לא ישלח</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <AssetActivePill active={asset.is_active} onClick={() => toggleActive(asset)} />
                  <div className="flex items-center gap-1">
                    {canPreview(asset) && (
                      <button onClick={() => setPreview(asset)} className="p-1.5 rounded-full hover:bg-crm-surface-soft transition-colors" title="תצוגה מקדימה" style={{ color: 'var(--crm-text-muted)' }}>
                        <Eye size={15} />
                      </button>
                    )}
                    <button onClick={() => openEdit(asset)} className="p-1.5 rounded-full hover:bg-crm-surface-soft transition-colors" title="עריכה" style={{ color: 'var(--crm-text-muted)' }}>
                      <Pencil size={14} />
                    </button>
                    {deleteConfirm === asset.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(asset.id)} className="w-7 h-7 rounded-full flex items-center justify-center border" style={{ background: 'var(--crm-danger-bg)', color: 'var(--crm-danger)', borderColor: 'var(--crm-danger)' }}><Check size={13} /></button>
                        <button onClick={() => setDeleteConfirm(null)} className="w-7 h-7 rounded-full flex items-center justify-center border" style={{ borderColor: 'var(--crm-border)', color: 'var(--crm-text-muted)' }}><X size={13} /></button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(asset.id)} className="p-1.5 rounded-full hover:bg-crm-surface-soft transition-colors" title="מחיקה" style={{ color: 'var(--crm-text-muted)' }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Table — נקי, מבוסס קונטור */
        <div className="bg-crm-surface rounded-crm border border-crm-border overflow-x-auto">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="border-b border-crm-border" style={{ background: 'var(--crm-surface-soft)' }}>
                <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--crm-primary)' }}>כותרת</th>
                <th className="text-right px-3 py-3 font-semibold hidden md:table-cell" style={{ color: 'var(--crm-primary)' }}>מפתח</th>
                <th className="text-right px-3 py-3 font-semibold" style={{ color: 'var(--crm-primary)' }}>סוג</th>
                <th className="text-right px-3 py-3 font-semibold hidden lg:table-cell" style={{ color: 'var(--crm-primary)' }}>קישור</th>
                <th className="text-right px-3 py-3 font-semibold" style={{ color: 'var(--crm-primary)' }}>סטטוס</th>
                <th className="px-3 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((asset, i) => {
                const meta = TYPE_META[asset.type]
                return (
                  <tr key={asset.id} className="border-b border-crm-border hover:bg-crm-surface-soft transition-colors"
                    style={{ ...(i % 2 !== 0 ? { background: 'var(--crm-surface-soft)' } : {}), opacity: asset.is_active ? 1 : 0.55 }}>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--crm-text)' }}>{asset.title}</td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      <button onClick={() => copyKey(asset.key)}
                        className="inline-flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded-full border hover:bg-crm-surface transition-colors"
                        style={{ background: 'var(--crm-surface)', borderColor: 'var(--crm-border)', color: 'var(--crm-text-muted)' }} title="העתק מפתח">
                        {copied === asset.key ? <CheckCheck size={11} /> : <Copy size={11} />}
                        {asset.key}
                      </button>
                    </td>
                    <td className="px-3 py-3"><Chip label={meta.label} dot={meta.dot} /></td>
                    <td className="px-3 py-3 hidden lg:table-cell text-xs" dir="ltr" style={{ color: asset.url ? 'var(--crm-text-muted)' : 'var(--crm-danger)' }}>
                      {asset.url ? asset.url.replace(/^https?:\/\//, '').slice(0, 40) : '⚠️ אין URL'}
                    </td>
                    <td className="px-3 py-3"><AssetActivePill active={asset.is_active} onClick={() => toggleActive(asset)} /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        {canPreview(asset) && (
                          <button onClick={() => setPreview(asset)} className="p-1.5 rounded-full hover:bg-crm-surface transition-colors" title="תצוגה מקדימה" style={{ color: 'var(--crm-text-muted)' }}><Eye size={15} /></button>
                        )}
                        <button onClick={() => openEdit(asset)} className="p-1.5 rounded-full hover:bg-crm-surface transition-colors" title="עריכה" style={{ color: 'var(--crm-text-muted)' }}><Pencil size={14} /></button>
                        {deleteConfirm === asset.id ? (
                          <span className="inline-flex items-center gap-1">
                            <button onClick={() => handleDelete(asset.id)} className="w-7 h-7 rounded-full flex items-center justify-center border" style={{ background: 'var(--crm-danger-bg)', color: 'var(--crm-danger)', borderColor: 'var(--crm-danger)' }}><Check size={13} /></button>
                            <button onClick={() => setDeleteConfirm(null)} className="w-7 h-7 rounded-full flex items-center justify-center border" style={{ borderColor: 'var(--crm-border)', color: 'var(--crm-text-muted)' }}><X size={13} /></button>
                          </span>
                        ) : (
                          <button onClick={() => setDeleteConfirm(asset.id)} className="p-1.5 rounded-full hover:bg-crm-surface transition-colors" title="מחיקה" style={{ color: 'var(--crm-text-muted)' }}><Trash2 size={14} /></button>
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

      {/* ── Edit / Add Modal ───────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">

            <div className="flex items-center justify-between p-6 pb-4 border-b border-crm-border">
              <h3 className="text-lg font-bold" style={{ color: 'var(--crm-primary)' }}>
                {editItem ? 'עריכת נכס' : 'נכס חדש'}
              </h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full hover:bg-crm-surface-soft flex items-center justify-center">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">

              {/* key + type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--crm-text)' }}>מפתח (key) *</label>
                  <input value={form.key}
                    onChange={e => setForm(f => ({ ...f, key: e.target.value.replace(/\s/g, '_').toLowerCase() }))}
                    placeholder="form_sharon"
                    className="w-full border border-crm-border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none"
                    dir="ltr" />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--crm-text)' }}>סוג תוכן</label>
                  <select value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as AssetType, url: '' }))}
                    className="w-full border border-crm-border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none">
                    {Object.entries(TYPE_META).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* title */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--crm-text)' }}>כותרת *</label>
                <input value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="שם תצוגה"
                  className="w-full border border-crm-border rounded-xl px-3 py-2 text-sm focus:outline-none" />
              </div>

              {/* URL + העלאה */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--crm-text)' }}>
                  {UPLOADABLE.includes(form.type) ? 'URL / העלאת קובץ' : 'URL / קישור'}
                </label>

                {/* שורת URL */}
                <div className="flex gap-2 items-stretch">
                  <input value={form.url}
                    onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                    placeholder="https://..."
                    className="flex-1 border border-crm-border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none"
                    dir="ltr" />

                  {/* תצוגה מקדימה מהיצ'ה */}
                  {form.url && (
                    <a href={form.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center px-3 rounded-xl border border-crm-border hover:bg-crm-surface-soft transition-colors"
                      title="פתח תצוגה מקדימה">
                      <ZoomIn size={15} style={{ color: '#6D436D' }} />
                    </a>
                  )}
                </div>

                {/* כפתור העלאה — רק ל-PDF / תמונה */}
                {UPLOADABLE.includes(form.type) && (
                  <div className="mt-2">
                    <UploadButton
                      type={form.type}
                      onUploaded={url => setForm(f => ({ ...f, url }))}
                    />
                    {form.url && form.type === 'image' && (
                      // תצוגה מקדימה קטנה של התמונה
                      <div className="mt-2 rounded-xl overflow-hidden border border-crm-border max-h-32 flex items-center justify-center bg-crm-surface-soft">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={form.url} alt="preview" className="max-h-32 object-contain" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* description */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--crm-text)' }}>תיאור (אופציונלי)</label>
                <input value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="לשימוש פנימי"
                  className="w-full border border-crm-border rounded-xl px-3 py-2 text-sm focus:outline-none" />
              </div>

              {/* sort order */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--crm-text)' }}>סדר הצגה</label>
                <input type="number" value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 99 }))}
                  className="w-24 border border-crm-border rounded-xl px-3 py-2 text-sm text-center focus:outline-none"
                  min={1} />
              </div>

              {/* active */}
              <div className="flex items-center gap-3">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                  style={{ background: form.is_active ? 'var(--crm-primary)' : 'var(--crm-border)' }}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm font-medium" style={{ color: 'var(--crm-text)' }}>
                  {form.is_active ? 'פעיל — הבוט ישתמש בנכס זה' : 'כבוי — הבוט לא ישתמש'}
                </span>
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={handleSave} disabled={!form.key || !form.title}
                className="flex-1 py-2.5 rounded-full font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
                style={{ background: 'var(--crm-action)', color: 'var(--crm-text)' }}>
                {editItem ? 'שמור שינויים' : 'הוסף'}
              </button>
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-full font-semibold text-sm border hover:bg-crm-surface-soft transition-colors"
                style={{ borderColor: 'var(--crm-border)', color: 'var(--crm-text)' }}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview Modal ──────────────────────────────────────────────────── */}
      {preview && <PreviewModal asset={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
