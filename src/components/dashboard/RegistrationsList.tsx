'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, Check, RefreshCw, Send, Copy, CheckCheck, Trash2, Search } from 'lucide-react'
import { Registration } from '@/lib/types'

// ─── מיפוי area_code → label ──────────────────────────────────────────────────
const AREA_LABELS: Record<string, string> = {
  sharon:  'דרום השרון / חוף השרון',
  carmel:  'חוף הכרמל',
  telaviv: 'גני ילדים תל אביב',
}

// ─── Status styles — מניפה מאושרת בלבד ──────────────────────────────────────
// ירוק #297058 | אדום #EF4444 | צהוב #FAD980/#FEF9C3
// סלמון #D29486 | סגול #6D436D | אפור #7B8794
const STATUS_STYLES: Record<string, { bg: string; color: string; dot: string }> = {
  'ממתין לאישור': { bg: '#FEF9C3', color: '#7B6010', dot: '#FAD980' },
  'מאושר':        { bg: '#E6F4EF', color: '#297058', dot: '#297058' },
  'נדחה':         { bg: '#FCEAEA', color: '#EF4444', dot: '#EF4444' },
  'רשימת המתנה':  { bg: '#FAF0ED', color: '#9B4A38', dot: '#D29486' },
  'בוטל':         { bg: '#F0F1F2', color: '#7B8794', dot: '#7B8794' },
}

const TYPE_STYLES: Record<string, { bg: string; color: string }> = {
  'צהרון':  { bg: '#6D436D', color: '#ffffff' },
  'קייטנה': { bg: '#297058', color: '#ffffff' },
}

const STATUS_ORDER = ['ממתין לאישור', 'רשימת המתנה', 'מאושר', 'נדחה', 'בוטל']

// ─── Offer Spot Panel ─────────────────────────────────────────────────────────
// פאנל שנפתח כשלוחצים "הצע מקום" — מציג תצוגה מקדימה של ההודעה ומאשר שליחה
function OfferSpotPanel({
  reg,
  onClose,
  onSuccess,
}: {
  reg:       Registration
  onClose:   () => void
  onSuccess: (regId: string, messageText: string) => void
}) {
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [preview,  setPreview]  = useState<string | null>(null)
  const [copied,   setCopied]   = useState(false)
  const [done,     setDone]     = useState(false)

  // בנה תצוגה מקדימה של ההודעה
  useEffect(() => {
    const parentFirstName = reg.parent?.name?.split(' ')[0] ?? 'הורה'
    const childName       = reg.child?.name ?? 'הילד/ה'
    const areaLabel       = AREA_LABELS[reg.area_code ?? ''] ?? reg.area_code ?? ''
    const position        = reg.waiting_list_position ?? 1

    const text =
      `היי ${parentFirstName}! 🎉\n\n` +
      `*יש לנו מקום פנוי!*\n\n` +
      `*${childName}* ב${areaLabel} — אתם במקום *${position}* ברשימת ההמתנה ` +
      `וכעת יש מקום זמין! 🌟\n\n` +
      `האם תרצו לאשר את הרישום ולסדר תשלום?\n\n` +
      `*כן* — אשר/י ונתקדם לסידור תשלום 💛\n` +
      `*לא* — תודה, נעבור לאדם הבא ברשימה`

    setPreview(text)
  }, [reg])

  const handleConfirm = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/waiting-list/offer-spot', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          registrationId:  reg.id,
          phone:           reg.parent?.phone ?? '',
          parentName:      reg.parent?.name ?? '',
          childName:       reg.child?.name ?? 'הילד/ה',
          areaCode:        reg.area_code ?? '',
          areaLabel:       AREA_LABELS[reg.area_code ?? ''] ?? reg.area_code ?? '',
          waitingPosition: reg.waiting_list_position ?? 1,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error ?? 'שגיאה בשליחה')
      } else {
        setDone(true)
        onSuccess(reg.id, data.messageText)
      }
    } catch {
      setError('שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!preview) return
    await navigator.clipboard.writeText(preview)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="mt-3 rounded-2xl p-4 border"
      style={{ background: '#FAF0ED', borderColor: '#e8c8bb' }}
      onClick={e => e.stopPropagation()}
    >
      {!done ? (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: '#9B4A38' }}>
              📨 הצעת מקום — תצוגה מקדימה
            </p>
            <span className="text-xs" style={{ color: '#a8a29e' }}>
              {reg.parent?.phone ?? 'אין טלפון'}
            </span>
          </div>

          {/* תצוגה מקדימה של ההודעה */}
          <div
            className="rounded-xl p-3 mb-3 text-sm whitespace-pre-wrap leading-relaxed"
            style={{ background: '#fff', color: '#5E4B35', border: '1px solid #e8c8bb', fontFamily: 'monospace', fontSize: '12px' }}
          >
            {preview}
          </div>

          {/* הערה על uchat */}
          <p className="text-xs mb-3" style={{ color: '#a8a29e' }}>
            ⚠️ uchat טרם חובר — CRM יתעדכן, ההודעה תישלח ידנית מ-WhatsApp.
          </p>

          {error && (
            <p className="text-xs mb-2 font-medium" style={{ color: '#EF4444' }}>
              שגיאה: {error}
            </p>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: '#F0F1F2', color: '#7B8794' }}
              disabled={loading}
            >
              ביטול
            </button>
            <button
              onClick={handleCopy}
              className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5"
              style={{ background: '#F0EBF3', color: '#6D436D' }}
            >
              {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
              {copied ? 'הועתק!' : 'העתק הודעה'}
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5"
              style={{ background: '#9B4A38', color: '#fff' }}
              disabled={loading}
            >
              <Send size={14} />
              {loading ? 'שולח...' : 'אשר ועדכן CRM'}
            </button>
          </div>
        </>
      ) : (
        <div className="text-center py-2">
          <p className="text-2xl mb-1">✅</p>
          <p className="text-sm font-semibold mb-1" style={{ color: '#297058' }}>
            CRM עודכן! הרישום עכשיו "ממתין לאישור"
          </p>
          <p className="text-xs mb-3" style={{ color: '#a8a29e' }}>
            נוצר task לנציגה ותועד ב-שיחות. כעת שלחו את ההודעה ב-WhatsApp ↓
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={handleCopy}
              className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5"
              style={{ background: '#E6F4EF', color: '#297058' }}
            >
              {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
              {copied ? 'הועתק!' : 'העתק הודעה לWhatsApp'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: '#F0F1F2', color: '#7B8794' }}
            >
              סגור
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Status Selector ──────────────────────────────────────────────────────────
function StatusSelector({
  status,
  onChange,
}: {
  status: string
  onChange: (s: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const s = STATUS_STYLES[status] || { bg: '#f5f5f4', color: '#78716c', dot: '#a8a29e' }

  const handleSelect = async (newStatus: string) => {
    if (newStatus === status) { setOpen(false); return }
    setSaving(true)
    await onChange(newStatus)
    setSaving(false)
    setOpen(false)
  }

  return (
    <div className="relative" style={{ display: 'inline-block' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold hover:opacity-80"
        style={{ background: s.bg, color: s.color }}
        disabled={saving}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
        {saving ? '...' : status}
        <ChevronDown size={12} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute mt-1 rounded-xl shadow-xl border border-gray-100 bg-white z-20 overflow-hidden"
            style={{ right: 0, minWidth: '150px' }}
          >
            {STATUS_ORDER.map(opt => {
              const os = STATUS_STYLES[opt] || { bg: '#f5f5f4', color: '#78716c', dot: '#a8a29e' }
              return (
                <button
                  key={opt}
                  onClick={() => handleSelect(opt)}
                  className="w-full text-right px-4 py-2.5 text-sm font-medium hover:opacity-80 flex items-center gap-2"
                  style={{ color: os.color, background: status === opt ? os.bg : 'transparent' }}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: os.dot }} />
                  {opt}
                  {status === opt && <Check size={12} className="mr-auto" />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function RegistrationsList({ onOpenParent }: { onOpenParent?: (parentId: string) => void }) {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('הכל')
  const [typeFilter, setTypeFilter] = useState<string>('הכל')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // ─── offer spot state ────────────────────────────────────────────────────────
  const [offerPanelId, setOfferPanelId]   = useState<string | null>(null)
  const [offeredIds,   setOfferedIds]     = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/registrations')
    const data = await res.json()
    if (Array.isArray(data)) setRegistrations(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleStatusChange = async (reg: Registration, newStatus: string) => {
    // Optimistic update
    setRegistrations(prev =>
      prev.map(r => r.id === reg.id ? { ...r, status: newStatus as Registration['status'] } : r)
    )
    await fetch(`/api/registrations/${reg.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
  }

  const handleOfferSuccess = (regId: string) => {
    setRegistrations(prev =>
      prev.map(r => r.id === regId ? { ...r, status: 'ממתין לאישור' } : r)
    )
    setOfferedIds(prev => { const s = new Set(prev); s.add(regId); return s })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('למחוק רישום זה?')) return
    setRegistrations(prev => prev.filter(r => r.id !== id))
    setSelected(prev => { const s = new Set(prev); s.delete(id); return s })
    await fetch('/api/registrations', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id] }) })
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`למחוק ${selected.size} רישומים?`)) return
    const ids = Array.from(selected)
    setRegistrations(prev => prev.filter(r => !ids.includes(r.id)))
    setSelected(new Set())
    await fetch('/api/registrations', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => { const s = new Set(prev); if (s.has(id)) { s.delete(id) } else { s.add(id) } return s })
  }

  // Filter + search
  const filtered = registrations.filter(r => {
    if (statusFilter !== 'הכל' && r.status !== statusFilter) return false
    if (typeFilter !== 'הכל' && r.type !== typeFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const match =
        r.parent?.name?.toLowerCase().includes(q) ||
        r.child?.name?.toLowerCase().includes(q) ||
        r.area_code?.toLowerCase().includes(q)
      if (!match) return false
    }
    return true
  })

  // Counts
  const counts: Record<string, number> = { 'הכל': registrations.length }
  STATUS_ORDER.forEach(s => {
    counts[s] = registrations.filter(r => r.status === s).length
  })

  const pendingCount = registrations.filter(r => r.status === 'ממתין לאישור').length
  const waitingCount = registrations.filter(r => r.status === 'רשימת המתנה').length

  return (
    <div className="space-y-5" dir="rtl">

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'סה״כ רישומים',  value: registrations.length,                                    color: '#6D436D', bg: '#F0EBF3' },
          { label: 'ממתינים לאישור', value: pendingCount,                                            color: '#7B6010', bg: '#FEF9C3' },
          { label: 'רשימת המתנה',   value: waitingCount,                                             color: '#9B4A38', bg: '#FAF0ED' },
          { label: 'מאושרים',       value: registrations.filter(r => r.status === 'מאושר').length,   color: '#297058', bg: '#E6F4EF' },
        ].map(card => (
          <div key={card.label} className="rounded-2xl p-4 text-center" style={{ background: card.bg }}>
            <p className="text-3xl font-bold" style={{ color: card.color }}>{card.value}</p>
            <p className="text-xs font-medium mt-1" style={{ color: card.color, opacity: 0.8 }}>{card.label}</p>
          </div>
        ))}
      </div>

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status filters */}
        <div className="flex gap-1.5 flex-wrap">
          {['הכל', ...STATUS_ORDER].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={statusFilter === s
                ? { background: '#6D436D', color: '#fff' }
                : { background: '#f5f5f4', color: '#78716c', border: '1px solid #e5e7eb' }}>
              {s}
              {counts[s] !== undefined && counts[s] > 0 && <span className="mr-1 opacity-70">({counts[s]})</span>}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-gray-200 mx-1" />

        {/* Type filters */}
        {['הכל', 'צהרון', 'קייטנה'].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={typeFilter === t
              ? { background: '#2A6B6B', color: '#fff' }
              : { background: '#f5f5f4', color: '#78716c', border: '1px solid #e5e7eb' }}>
            {t === 'צהרון' ? '🎒 ' : t === 'קייטנה' ? '🏕️ ' : ''}{t}
          </button>
        ))}

        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: '#a8a29e' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש הורה / ילד..."
            className="pr-8 pl-3 py-1.5 text-xs border border-gray-200 rounded-full focus:outline-none bg-white text-right w-44"
          />
        </div>

        <button onClick={load} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors mr-auto"
          style={{ color: '#a8a29e' }} title="רענן">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl text-sm"
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

      {/* Table / Cards */}
      {loading ? (
        <div className="text-center py-10 text-gray-400">
          <div className="text-3xl mb-2 animate-pulse">⏳</div>
          <p>טוען רישומים...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <div className="text-3xl mb-2">📂</div>
          <p>אין רישומים להצגה</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header row (desktop) */}
          <div
            className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 rounded-xl text-xs font-semibold"
            style={{ background: '#f5f5f4', color: '#78716c' }}
          >
            <div className="col-span-3">הורה</div>
            <div className="col-span-2">ילד/ה</div>
            <div className="col-span-1">כיתה</div>
            <div className="col-span-2">סוג</div>
            <div className="col-span-2">תאריך בקשה</div>
            <div className="col-span-2">סטטוס</div>
          </div>

          {filtered.map(reg => {
            const typeStyle    = TYPE_STYLES[reg.type] || { bg: '#e8d5e8', color: '#6D436D' }
            const isPending    = reg.status === 'ממתין לאישור'
            const isWaiting    = reg.status === 'רשימת המתנה'
            const isOfferOpen  = offerPanelId === reg.id
            const wasOffered   = offeredIds.has(reg.id)
            const isSelected   = selected.has(reg.id)

            return (
              <div
                key={reg.id}
                className="bg-white rounded-2xl border p-4 hover:shadow-sm transition-all"
                style={{
                  borderColor: isSelected ? 'var(--crm-primary)' : isPending ? '#e8d0b8' : isWaiting ? '#e8c8bb' : '#e5e7eb',
                  background:  isSelected ? '#fdf6ef' : isPending ? '#fdf3e8' : '#fff',
                  boxShadow:   isSelected ? '0 0 0 1.5px var(--crm-primary)' : undefined,
                  cursor: onOpenParent ? 'pointer' : 'default',
                }}
                onClick={() => onOpenParent?.(reg.parent_id)}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {/* Checkbox */}
                  <div
                    className="w-4 h-4 rounded border-2 flex-shrink-0 cursor-pointer flex items-center justify-center"
                    style={isSelected ? { background: 'var(--crm-primary)', borderColor: 'var(--crm-primary)' } : { borderColor: '#d1d5db' }}
                    onClick={e => { e.stopPropagation(); toggleSelect(reg.id) }}
                  >
                    {isSelected && <span className="text-white text-xs font-bold leading-none">✓</span>}
                  </div>

                  {/* Parent + child info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base flex-shrink-0"
                      style={{ background: '#e8d5e8', color: '#6D436D' }}
                    >
                      {reg.parent?.name ? reg.parent.name[0] : '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm leading-tight truncate" style={{ color: '#5E4B35' }}>
                        {reg.parent?.name || 'לא ידוע'}
                      </p>
                      <p className="text-xs truncate" style={{ color: '#a8a29e' }}>
                        {reg.child?.name || 'ילד/ה'}
                        {reg.child?.class_name ? ` · כיתה ${reg.child.class_name}` : ''}
                        {reg.area_code ? ` · ${AREA_LABELS[reg.area_code] ?? reg.area_code}` : ''}
                        {reg.waiting_list_position ? ` · תור ${reg.waiting_list_position}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Type badge */}
                    <span
                      className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{ background: typeStyle.bg, color: typeStyle.color }}
                    >
                      {reg.type === 'צהרון' ? '🎒' : '🏕️'} {reg.type}
                    </span>

                    {/* Date */}
                    <span className="text-xs" style={{ color: '#a8a29e' }}>
                      {new Date(reg.created_at).toLocaleDateString('he-IL')}
                    </span>

                    {/* כפתור "הצע מקום" — רק ברשימת המתנה */}
                    {isWaiting && !wasOffered && (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setOfferPanelId(isOfferOpen ? null : reg.id)
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:opacity-80"
                        style={{
                          background: isOfferOpen ? '#9B4A38' : '#FAF0ED',
                          color:      isOfferOpen ? '#fff'    : '#9B4A38',
                          border:     '1px solid #e8c8bb',
                        }}
                      >
                        <Send size={11} />
                        הצע מקום
                      </button>
                    )}

                    {/* Status selector */}
                    <div onClick={e => e.stopPropagation()}>
                      <StatusSelector
                        status={reg.status}
                        onChange={newStatus => handleStatusChange(reg, newStatus)}
                      />
                    </div>

                    {/* Delete */}
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(reg.id) }}
                      className="p-1.5 rounded-full hover:bg-red-50 transition-colors flex-shrink-0"
                      style={{ color: '#e57373' }}
                      title="מחיקה"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Offer Spot Panel — נפתח בלחיצה */}
                {isOfferOpen && (
                  <OfferSpotPanel
                    reg={reg}
                    onClose={() => setOfferPanelId(null)}
                    onSuccess={(regId) => {
                      handleOfferSuccess(regId)
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
