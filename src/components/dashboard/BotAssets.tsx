'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Pencil, Trash2, X, Check,
  Link2, FileText, Image, ExternalLink,
  Copy, CheckCheck, ToggleLeft, ToggleRight,
  Upload, Loader2, Eye, ZoomIn,
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

const TYPE_META: Record<AssetType, { label: string; icon: React.ReactNode; bg: string; color: string }> = {
  form:    { label: 'טופס רישום', icon: <FileText    size={14} />, bg: '#F0EBF3', color: '#6D436D' },
  link:    { label: 'קישור',      icon: <Link2        size={14} />, bg: '#FAF0ED', color: '#9B4A38' },
  pdf:     { label: 'PDF',        icon: <FileText     size={14} />, bg: '#FEF9C3', color: '#7B6010' },
  image:   { label: 'תמונה',     icon: <Image        size={14} />, bg: '#FAF0ED', color: '#D29486' },
  payment: { label: 'תשלום',     icon: <ExternalLink size={14} />, bg: '#E6F4EF', color: '#297058' },
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
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <span className="font-semibold text-sm" style={{ color: 'var(--crm-text)' }}>{asset.title}</span>
          <div className="flex items-center gap-2">
            <a href={asset.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full"
              style={{ background: '#F0EBF3', color: '#6D436D' }}>
              <ExternalLink size={12} /> פתח בטאב חדש
            </a>
            <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* content */}
        <div className="flex-1 overflow-hidden">
          {asset.type === 'image' ? (
            <div className="flex items-center justify-center p-4 bg-gray-50 h-full">
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

  const filtered = assets.filter(a => typeFilter === 'all' || a.type === typeFilter)
  const canPreview = (a: BotAsset) => !!a.url && (a.type === 'pdf' || a.type === 'image' || a.type === 'link' || a.type === 'form')

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
          {assets.length} נכסים · {assets.filter(a => a.is_active).length} פעילים
        </p>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm hover:opacity-90 transition-opacity"
          style={{ background: 'var(--crm-action)', color: 'var(--crm-text)' }}>
          <Plus size={15} /> הוסף
        </button>
      </div>

      {/* Info */}
      <div className="rounded-2xl p-4 text-sm" style={{ background: '#F0EBF3', color: '#6D436D' }}>
        <p className="font-semibold mb-1">💡 איך זה עובד?</p>
        <p className="opacity-80">כל נכס מקבל <strong>מפתח</strong>. הבוט שולף את ה-URL לפי המפתח. לחיצה על המפתח מעתיקה <code className="bg-white/60 px-1 rounded">{'{'}key{'}'}</code> להדבקה בטקסטי הבוט.</p>
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'form', 'link', 'pdf', 'image', 'payment'] as const).map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={typeFilter === t ? { background: '#6D436D', color: '#fff' } : { background: '#F0F1F2', color: '#7B8794' }}>
            {t === 'all' ? 'הכל' : TYPE_META[t].label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-300" size={28} /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(asset => {
            const meta = TYPE_META[asset.type]
            return (
              <div key={asset.id}
                className="bg-white rounded-2xl border p-4 flex items-center gap-4 transition-all hover:shadow-sm"
                style={{ borderColor: '#e5e7eb', opacity: asset.is_active ? 1 : 0.55 }}>

                {/* Type icon */}
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: meta.bg, color: meta.color }}>
                  {meta.icon}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: 'var(--crm-text)' }}>{asset.title}</span>
                    <button onClick={() => copyKey(asset.key)}
                      className="flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded-full hover:opacity-70 transition-all"
                      style={{ background: '#F0EBF3', color: '#6D436D' }}
                      title="העתק מפתח">
                      {copied === asset.key ? <CheckCheck size={11} /> : <Copy size={11} />}
                      {asset.key}
                    </button>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>
                      {meta.label}
                    </span>
                  </div>
                  {asset.description && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--crm-text)', opacity: 0.5 }}>{asset.description}</p>
                  )}
                  {asset.url ? (
                    <p className="text-xs mt-0.5 truncate max-w-xs" style={{ color: '#297058' }}>
                      {asset.url.replace(/^https?:\/\//, '').slice(0, 65)}
                    </p>
                  ) : (
                    <p className="text-xs mt-0.5" style={{ color: '#EF4444' }}>⚠️ אין URL — לא ישלח</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">

                  {/* תצוגה מקדימה */}
                  {canPreview(asset) && (
                    <button onClick={() => setPreview(asset)}
                      className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                      title="תצוגה מקדימה"
                      style={{ color: '#6D436D' }}>
                      <Eye size={15} />
                    </button>
                  )}

                  {/* toggle */}
                  <button onClick={() => toggleActive(asset)}
                    className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                    title={asset.is_active ? 'כבה' : 'הפעל'}
                    style={{ color: asset.is_active ? '#297058' : '#7B8794' }}>
                    {asset.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>

                  <button onClick={() => openEdit(asset)}
                    className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                    style={{ color: 'var(--crm-text)', opacity: 0.5 }}>
                    <Pencil size={14} />
                  </button>

                  {deleteConfirm === asset.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete(asset.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ background: '#FCEAEA', color: '#EF4444' }}>
                        <Check size={13} />
                      </button>
                      <button onClick={() => setDeleteConfirm(null)}
                        className="w-7 h-7 rounded-full flex items-center justify-center bg-gray-100 text-gray-500">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(asset.id)}
                      className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                      style={{ color: 'var(--crm-text)', opacity: 0.35 }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {filtered.length === 0 && !loading && (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-2">📂</div>
              <p>אין נכסים להצגה</p>
            </div>
          )}
        </div>
      )}

      {/* ── Edit / Add Modal ───────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">

            <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100">
              <h3 className="text-lg font-bold" style={{ color: 'var(--crm-primary)' }}>
                {editItem ? 'עריכת נכס' : 'נכס חדש'}
              </h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
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
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none"
                    dir="ltr" />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--crm-text)' }}>סוג תוכן</label>
                  <select value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as AssetType, url: '' }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none">
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
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
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
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none"
                    dir="ltr" />

                  {/* תצוגה מקדימה מהיצ'ה */}
                  {form.url && (
                    <a href={form.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center px-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
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
                      <div className="mt-2 rounded-xl overflow-hidden border border-gray-100 max-h-32 flex items-center justify-center bg-gray-50">
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
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
              </div>

              {/* sort order */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--crm-text)' }}>סדר הצגה</label>
                <input type="number" value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 99 }))}
                  className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none"
                  min={1} />
              </div>

              {/* active */}
              <div className="flex items-center gap-3">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                  style={{ background: form.is_active ? '#6D436D' : '#d1d5db' }}>
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
                className="flex-1 py-2.5 rounded-full font-semibold text-sm bg-gray-100 hover:bg-gray-200 transition-colors"
                style={{ color: 'var(--crm-text)' }}>
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
