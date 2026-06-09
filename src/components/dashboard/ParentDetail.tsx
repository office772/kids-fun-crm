'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Phone, Mail, User, Clock, MessageCircle, CreditCard, FileText, Edit3, Check, ChevronDown } from 'lucide-react'
import { Parent, Task, Conversation, RegistrationTimeline, Registration } from '@/lib/types'
import { StatusBadge } from './StatusBadge'
import { getPaymentHealthInfo, getParentPaymentHealthInfo, getSourceLabel } from '@/lib/payment-status'

// ─── Props ────────────────────────────────────────────────────────────────────
interface ParentDetailProps {
  parentId: string
  onClose: () => void
  onRefresh?: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'עכשיו'
  if (diffMins < 60) return `לפני ${diffMins} דקות`
  if (diffHours < 24) return `לפני ${diffHours} שעות`
  if (diffDays < 7) return `לפני ${diffDays} ימים`
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

// ─── Timeline event display ───────────────────────────────────────────────────
const EVENT_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  status_change:    { icon: '🔄', color: '#6D436D', bg: '#f5edff' },
  message_sent:     { icon: '📤', color: '#2A6B6B', bg: '#e0f2f1' },
  message_received: { icon: '📥', color: '#5E4B35', bg: '#fef9ee' },
  payment:          { icon: '💳', color: '#b45309', bg: '#fef3c7' },
  task_created:     { icon: '📋', color: '#a05a4f', bg: '#fce9e6' },
  task_resolved:    { icon: '✅', color: '#15803d', bg: '#dcfce7' },
  system_note:      { icon: 'ℹ️', color: '#78716c', bg: '#f5f5f4' },
  escalation:       { icon: '🚨', color: '#9d3d5e', bg: '#fce7f3' },
}

const REGISTRATION_STATUS_OPTIONS = ['ממתין לאישור', 'מאושר', 'נדחה', 'רשימת המתנה', 'בוטל']
const REGISTRATION_STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  'ממתין לאישור': { bg: '#fef3c7', color: '#b45309' },
  'מאושר':        { bg: '#dcfce7', color: '#15803d' },
  'נדחה':         { bg: '#fee2e2', color: '#991b1b' },
  'רשימת המתנה':  { bg: '#e0f2fe', color: '#0369a1' },
  'בוטל':         { bg: '#f5f5f4', color: '#78716c' },
}

// ─── Registration Status Selector ─────────────────────────────────────────────
function RegistrationStatusSelector({
  registration,
  onStatusChange,
}: {
  registration: Registration
  onStatusChange: (id: string, status: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const style = REGISTRATION_STATUS_STYLES[registration.status] || { bg: '#f5f5f4', color: '#78716c' }

  const handleSelect = async (newStatus: string) => {
    if (newStatus === registration.status) { setOpen(false); return }
    setSaving(true)
    await onStatusChange(registration.id, newStatus)
    setSaving(false)
    setOpen(false)
  }

  return (
    <div className="relative" style={{ display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ background: style.bg, color: style.color }}
        disabled={saving}
      >
        {saving ? '...' : registration.status}
        <ChevronDown size={13} />
      </button>

      {open && (
        <div
          className="absolute mt-1 rounded-xl shadow-lg border border-gray-100 bg-white z-20 overflow-hidden min-w-[140px]"
          style={{ right: 0 }}
        >
          {REGISTRATION_STATUS_OPTIONS.map(opt => {
            const s = REGISTRATION_STATUS_STYLES[opt] || { bg: '#f5f5f4', color: '#78716c' }
            return (
              <button
                key={opt}
                onClick={() => handleSelect(opt)}
                className="w-full text-right px-4 py-2.5 text-sm font-medium hover:opacity-80 transition-opacity flex items-center gap-2"
                style={{ color: s.color, background: registration.status === opt ? s.bg : 'transparent' }}
              >
                {registration.status === opt && <Check size={12} />}
                {opt}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ParentDetail({ parentId, onClose, onRefresh }: ParentDetailProps) {
  const [parent, setParent] = useState<Parent | null>(null)
  const [timeline, setTimeline] = useState<RegistrationTimeline[]>([])
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'conversations' | 'registrations'>('overview')
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [newTimelineNote, setNewTimelineNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [parentRes, timelineRes, regRes] = await Promise.all([
        fetch(`/api/parents/${parentId}`),
        fetch(`/api/parents/${parentId}/timeline`),
        fetch(`/api/registrations?parent_id=${parentId}`),
      ])
      const [parentData, timelineData, regData] = await Promise.all([
        parentRes.json(),
        timelineRes.json(),
        regRes.json(),
      ])
      if (parentData && !parentData.error) {
        setParent(parentData)
        setEditName(parentData.name || '')
        setEditPhone(parentData.phone || '')
        setEditEmail(parentData.email || '')
        setEditNotes(parentData.notes || '')
      }
      if (Array.isArray(timelineData)) setTimeline(timelineData)
      if (Array.isArray(regData)) setRegistrations(regData)
    } finally {
      setLoading(false)
    }
  }, [parentId])

  useEffect(() => { loadData() }, [loadData])

  const handleSaveEdit = async () => {
    if (!parent) return
    setSaving(true)
    await fetch(`/api/parents/${parentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, phone: editPhone, email: editEmail, notes: editNotes }),
    })
    setSaving(false)
    setEditMode(false)
    await loadData()
    onRefresh?.()
  }

  const handleRegistrationStatusChange = async (regId: string, newStatus: string) => {
    await fetch(`/api/registrations/${regId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    await loadData()
    onRefresh?.()
  }

  const handleAddNote = async () => {
    if (!newTimelineNote.trim() || !parent) return
    setAddingNote(true)
    await fetch(`/api/parents/${parentId}/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'system_note',
        description: newTimelineNote.trim(),
        performed_by: 'נציג',
      }),
    })
    setNewTimelineNote('')
    setAddingNote(false)
    await loadData()
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }} dir="rtl">
        <div className="bg-white rounded-3xl p-12 flex flex-col items-center gap-4 shadow-2xl">
          <div className="text-4xl animate-pulse">⏳</div>
          <p style={{ color: '#6D436D', fontWeight: 600 }}>טוען פרטי הורה...</p>
        </div>
      </div>
    )
  }

  if (!parent) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }} dir="rtl">
        <div className="bg-white rounded-3xl p-12 shadow-2xl">
          <p style={{ color: '#a05a4f' }}>לא נמצאו פרטים עבור הורה זה</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 rounded-full" style={{ background: '#6D436D', color: '#fff' }}>סגור</button>
        </div>
      </div>
    )
  }

  const latestPayment = parent.payments?.[0]
  const paymentHealth = getParentPaymentHealthInfo(parent.payments)
  const hasFailedPayment = paymentHealth.health === 'failed'
  const hasExpiringCard = paymentHealth.health === 'expiring'
  const openTasksCount = parent.tasks?.filter(t => t.status !== 'טופל').length || 0
  const child = parent.children?.[0]
  const source = getSourceLabel(parent.sync_source)

  const TABS: { id: typeof activeTab; label: string; count?: number }[] = [
    { id: 'overview', label: 'סקירה' },
    { id: 'timeline', label: 'ציר זמן', count: timeline.length },
    { id: 'conversations', label: 'שיחות', count: parent.conversations?.length },
    { id: 'registrations', label: 'רישומים', count: registrations.length },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      dir="rtl"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Slide-in panel */}
      <div
        className="w-full max-w-2xl bg-white flex flex-col shadow-2xl overflow-hidden"
        style={{ borderRadius: '24px 0 0 24px' }}
      >

        {/* ── Header ── */}
        <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-gray-100"
          style={{ background: hasFailedPayment ? '#fff5f5' : '#FDF8F0' }}>
          <div className="flex items-start justify-between mb-3">
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              style={{ color: '#78716c' }}
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-2">
              {/* תווית מקור: PayPlus / חשבונית ירוקה / ידני */}
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: source.bg, color: source.color }}
                title="מקור הנתונים">
                {source.icon} {source.label}
              </span>
              {hasFailedPayment && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-full animate-pulse"
                  style={{ background: '#fee2e2', color: '#991b1b' }}>
                  🔴 כשל תשלום
                </span>
              )}
              {hasExpiringCard && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-full"
                  style={{ background: '#FEF9C3', color: '#7B6010' }}>
                  🟡 כרטיס פג תוקף
                </span>
              )}
              <button
                onClick={() => setEditMode(m => !m)}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                style={{ color: '#6D436D' }}
              >
                <Edit3 size={18} />
              </button>
            </div>
          </div>

          {/* Parent info */}
          {editMode ? (
            <div className="space-y-3">
              <input
                className="w-full border-2 rounded-xl px-4 py-2.5 text-right text-base focus:outline-none"
                style={{ borderColor: '#c9a8c9' }}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="שם מלא"
              />
              <input
                className="w-full border-2 rounded-xl px-4 py-2.5 text-right text-base focus:outline-none"
                style={{ borderColor: '#c9a8c9' }}
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                placeholder="טלפון"
                dir="ltr"
              />
              <input
                className="w-full border-2 rounded-xl px-4 py-2.5 text-right text-base focus:outline-none"
                style={{ borderColor: '#c9a8c9' }}
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                placeholder="אימייל"
                dir="ltr"
              />
              <textarea
                className="w-full border-2 rounded-xl px-4 py-2.5 text-right text-base focus:outline-none resize-none"
                style={{ borderColor: '#c9a8c9' }}
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="הערות..."
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity"
                  style={{ background: '#6D436D', color: '#fff' }}
                >
                  {saving ? '...' : 'שמור שינויים'}
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  className="px-5 py-2.5 rounded-xl font-semibold text-sm"
                  style={{ background: '#f5f5f4', color: '#78716c' }}
                >
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0"
                style={{ background: '#e8d5e8', color: '#6D436D' }}
              >
                {parent.name ? parent.name[0] : '?'}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold leading-tight" style={{ color: '#5E4B35' }}>
                  {parent.name || 'הורה לא מזוהה'}
                </h2>
                {child && (
                  <p className="text-sm font-medium mt-0.5" style={{ color: '#6D436D' }}>
                    👧 {child.name}
                    {(child.grade || child.class_name) && ` · כיתה ${child.grade || child.class_name}`}
                    {child.school && ` · ${child.school}`}
                    {(child.program || child.framework) && ` · ${child.program || child.framework}`}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <span className="text-sm flex items-center gap-1" style={{ color: '#78716c' }}>
                    <Phone size={13} /> {parent.phone}
                  </span>
                  {parent.email && (
                    <span className="text-sm flex items-center gap-1" style={{ color: '#78716c' }}>
                      <Mail size={13} /> {parent.email}
                    </span>
                  )}
                  {latestPayment && (
                    <StatusBadge status={latestPayment.status} size="sm" />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Quick stats row */}
          {!editMode && (
            <div className="flex gap-4 mt-4">
              <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'rgba(109,67,109,0.06)' }}>
                <p className="text-2xl font-bold" style={{ color: '#6D436D' }}>{registrations.length}</p>
                <p className="text-xs" style={{ color: '#78716c' }}>רישומים</p>
              </div>
              <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'rgba(109,67,109,0.06)' }}>
                <p className="text-2xl font-bold" style={{ color: '#6D436D' }}>{parent.conversations?.length || 0}</p>
                <p className="text-xs" style={{ color: '#78716c' }}>הודעות</p>
              </div>
              <div className="flex-1 rounded-xl p-3 text-center"
                style={{ background: openTasksCount > 0 ? '#fce9e6' : 'rgba(109,67,109,0.06)' }}>
                <p className="text-2xl font-bold" style={{ color: openTasksCount > 0 ? '#a05a4f' : '#6D436D' }}>{openTasksCount}</p>
                <p className="text-xs" style={{ color: '#78716c' }}>פניות פתוחות</p>
              </div>
              <div className="flex-1 rounded-xl p-3 text-center"
                style={{ background: hasFailedPayment ? '#fee2e2' : 'rgba(109,67,109,0.06)' }}>
                <p className="text-2xl font-bold" style={{ color: hasFailedPayment ? '#991b1b' : '#6D436D' }}>
                  {latestPayment?.amount ? `₪${latestPayment.amount}` : '—'}
                </p>
                <p className="text-xs" style={{ color: '#78716c' }}>תשלום</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex-shrink-0 flex gap-1 px-5 pt-4 pb-0 border-b border-gray-100">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-2.5 text-sm font-semibold rounded-t-xl transition-all relative"
              style={
                activeTab === tab.id
                  ? { color: '#6D436D', background: '#f9f4ff', borderBottom: '2.5px solid #6D436D' }
                  : { color: '#a8a29e', background: 'transparent' }
              }
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="mr-1.5 text-xs font-bold rounded-full px-1.5 py-0.5"
                  style={{ background: activeTab === tab.id ? '#6D436D' : '#e5e7eb', color: activeTab === tab.id ? '#fff' : '#78716c' }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── Overview Tab ── */}
          {activeTab === 'overview' && (
            <div className="space-y-4">

              {/* Alerts */}
              {hasFailedPayment && (
                <div className="rounded-2xl p-4 border-r-4" style={{ background: '#fee2e2', borderColor: '#ef4444' }}>
                  <p className="font-bold text-sm" style={{ color: '#991b1b' }}>⚠️ כשל תשלום — נדרשת פנייה</p>
                  {parent.payments?.filter(p => p.status === 'נכשל').map(p => (
                    <p key={p.id} className="text-xs mt-1" style={{ color: '#991b1b' }}>
                      ₪{p.amount} — {p.failure_reason || 'סיבה לא ידועה'} · {p.due_date ? new Date(p.due_date).toLocaleDateString('he-IL') : ''}
                    </p>
                  ))}
                </div>
              )}

              {/* Notes */}
              {parent.notes && (
                <div className="rounded-2xl p-4" style={{ background: '#FEF9EE', border: '1px solid #f5e6b0' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: '#b45309' }}>📝 הערות</p>
                  <p className="text-sm" style={{ color: '#5E4B35' }}>{parent.notes}</p>
                </div>
              )}

              {/* Open tasks */}
              {parent.tasks && parent.tasks.filter(t => t.status !== 'טופל').length > 0 && (
                <div>
                  <p className="text-sm font-bold mb-2" style={{ color: '#5E4B35' }}>📋 פניות פתוחות</p>
                  <div className="space-y-2">
                    {parent.tasks.filter(t => t.status !== 'טופל').map(task => (
                      <div key={task.id} className="rounded-xl p-3 flex items-center justify-between"
                        style={{ background: task.priority === 'דחוף' ? '#fce9e6' : '#f5f5f4' }}>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: '#5E4B35' }}>{task.description}</p>
                          <p className="text-xs mt-0.5" style={{ color: '#a8a29e' }}>{task.type} · {formatDate(task.created_at)}</p>
                        </div>
                        <span className="text-xs font-bold px-2 py-1 rounded-full"
                          style={{
                            background: task.priority === 'דחוף' ? '#D29486' : '#e8d5e8',
                            color: task.priority === 'דחוף' ? '#fff' : '#6D436D'
                          }}>
                          {task.priority}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Registrations preview */}
              {registrations.length > 0 && (
                <div>
                  <p className="text-sm font-bold mb-2" style={{ color: '#5E4B35' }}>📂 רישומים</p>
                  <div className="space-y-2">
                    {registrations.map(reg => {
                      const style = REGISTRATION_STATUS_STYLES[reg.status] || { bg: '#f5f5f4', color: '#78716c' }
                      return (
                        <div key={reg.id} className="rounded-xl p-3 border flex items-center justify-between"
                          style={{ borderColor: '#e8d5e8', background: '#fff' }}>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: '#5E4B35' }}>
                              {reg.type} — {reg.child?.name || 'ילד/ה'}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: '#a8a29e' }}>
                              {reg.child?.class_name && `כיתה ${reg.child.class_name}`}
                              {reg.waiting_list_position && ` · המתנה מקום ${reg.waiting_list_position}`}
                              {' · '}{formatDate(reg.created_at)}
                            </p>
                          </div>
                          <RegistrationStatusSelector
                            registration={reg}
                            onStatusChange={handleRegistrationStatusChange}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Payments */}
              {parent.payments && parent.payments.length > 0 && (
                <div>
                  <p className="text-sm font-bold mb-2" style={{ color: '#5E4B35' }}>💳 תשלומים</p>
                  <div className="space-y-2">
                    {parent.payments.map(pay => {
                      const h = getPaymentHealthInfo(pay)
                      return (
                        <div key={pay.id} className="rounded-xl p-3 flex items-center justify-between border"
                          style={{ borderColor: '#e5e7eb', background: '#fff' }}>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#5E4B35' }}>
                              <span title={h.label}>{h.icon}</span>
                              ₪{pay.amount}
                              {pay.payment_type && (
                                <span className="text-xs font-normal px-1.5 py-0.5 rounded"
                                  style={{ background: '#f5f5f4', color: '#78716c' }}>
                                  {pay.payment_type}
                                </span>
                              )}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: '#a8a29e' }}>
                              {pay.due_date && `תאריך חיוב: ${new Date(pay.due_date).toLocaleDateString('he-IL')}`}
                              {!!pay.number_of_failures && ` · ${pay.number_of_failures} כשלונות חיוב`}
                              {pay.card_expired && ` · כרטיס פג תוקף`}
                              {pay.failure_reason && ` · ${pay.failure_reason}`}
                            </p>
                          </div>
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0"
                            style={{ background: h.bg, color: h.color }}>
                            {pay.status}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Timeline Tab ── */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">

              {/* Add note form */}
              <div className="rounded-2xl p-4" style={{ background: '#FDF8F0', border: '1px solid #f0e0c0' }}>
                <p className="text-xs font-bold mb-2" style={{ color: '#b45309' }}>✏️ הוסף הערה ידנית</p>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-xl border px-3 py-2 text-sm text-right focus:outline-none"
                    style={{ borderColor: '#d4b896' }}
                    value={newTimelineNote}
                    onChange={e => setNewTimelineNote(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                    placeholder="כתוב הערה..."
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={addingNote || !newTimelineNote.trim()}
                    className="px-4 py-2 rounded-xl text-sm font-bold hover:opacity-80 disabled:opacity-50"
                    style={{ background: '#6D436D', color: '#fff' }}
                  >
                    {addingNote ? '...' : 'הוסף'}
                  </button>
                </div>
              </div>

              {/* Timeline events */}
              {timeline.length === 0 ? (
                <div className="text-center py-10" style={{ color: '#a8a29e' }}>
                  <p className="text-3xl mb-2">📭</p>
                  <p>אין אירועים בציר הזמן עדיין</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Vertical line */}
                  <div
                    className="absolute right-6 top-4 bottom-4 w-0.5"
                    style={{ background: '#e8d5e8' }}
                  />
                  <div className="space-y-1">
                    {timeline.map((event, idx) => {
                      const cfg = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.system_note
                      return (
                        <div key={event.id} className="relative flex items-start gap-4 pb-4">
                          {/* Dot */}
                          <div
                            className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-lg z-10 shadow-sm"
                            style={{ background: cfg.bg, border: `2px solid ${cfg.color}22` }}
                          >
                            {cfg.icon}
                          </div>

                          {/* Content */}
                          <div className="flex-1 pt-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <p className="text-sm font-semibold leading-snug" style={{ color: '#5E4B35' }}>
                                {event.description}
                              </p>
                              <span
                                className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                                style={{ background: cfg.bg, color: cfg.color }}
                              >
                                {event.performed_by}
                              </span>
                            </div>

                            {/* Status change arrow */}
                            {event.event_type === 'status_change' && event.old_value && event.new_value && (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs px-2 py-0.5 rounded-full"
                                  style={{ ...(REGISTRATION_STATUS_STYLES[event.old_value] || { bg: '#f5f5f4', color: '#78716c' }), fontSize: '11px' }}>
                                  {event.old_value}
                                </span>
                                <span className="text-gray-400">←</span>
                                <span className="text-xs px-2 py-0.5 rounded-full"
                                  style={{ ...(REGISTRATION_STATUS_STYLES[event.new_value] || { bg: '#f5f5f4', color: '#78716c' }), fontSize: '11px' }}>
                                  {event.new_value}
                                </span>
                              </div>
                            )}

                            {/* Payment amount */}
                            {event.event_type === 'payment' && !!event.metadata?.amount && (
                              <p className="text-xs mt-0.5 font-semibold" style={{ color: cfg.color }}>
                                ₪{String(event.metadata.amount)}
                              </p>
                            )}

                            <p className="text-xs mt-1.5" style={{ color: '#a8a29e' }} title={formatFullDate(event.created_at)}>
                              <Clock size={10} className="inline ml-1" />
                              {formatDate(event.created_at)}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Conversations Tab ── */}
          {activeTab === 'conversations' && (
            <div className="space-y-3">
              {!parent.conversations || parent.conversations.length === 0 ? (
                <div className="text-center py-10" style={{ color: '#a8a29e' }}>
                  <p className="text-3xl mb-2">💬</p>
                  <p>אין שיחות מתועדות</p>
                </div>
              ) : (
                [...parent.conversations]
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map(conv => (
                    <div
                      key={conv.id}
                      className={`flex ${conv.direction === 'יוצא' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className="max-w-[80%] rounded-2xl px-4 py-3 shadow-sm"
                        style={{
                          background: conv.direction === 'יוצא' ? '#DCF8C6' : '#fff',
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        <p className="text-sm whitespace-pre-wrap" style={{ color: '#5E4B35' }}>{conv.message_text}</p>
                        <div className="flex items-center justify-between gap-3 mt-1.5">
                          {conv.intent && (
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: '#e8d5e8', color: '#6D436D' }}>
                              {conv.intent.replace(/_/g, ' ')}
                            </span>
                          )}
                          <span className="text-xs" style={{ color: '#a8a29e' }}>
                            {conv.direction === 'יוצא' ? '🤖' : '👤'} {formatDate(conv.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}

          {/* ── Registrations Tab ── */}
          {activeTab === 'registrations' && (
            <div className="space-y-4">
              {registrations.length === 0 ? (
                <div className="text-center py-10" style={{ color: '#a8a29e' }}>
                  <p className="text-3xl mb-2">📂</p>
                  <p>אין רישומים</p>
                </div>
              ) : (
                registrations.map(reg => {
                  const statusStyle = REGISTRATION_STATUS_STYLES[reg.status] || { bg: '#f5f5f4', color: '#78716c' }
                  return (
                    <div
                      key={reg.id}
                      className="rounded-2xl border p-5 space-y-4"
                      style={{ borderColor: '#e8d5e8', background: '#fff' }}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-bold" style={{ color: '#5E4B35' }}>
                            {reg.type} — {reg.child?.name || 'ילד/ה'}
                          </h3>
                          {reg.child && (
                            <p className="text-sm" style={{ color: '#a8a29e' }}>
                              כיתה {reg.child.class_name} · {reg.child.framework}
                            </p>
                          )}
                        </div>
                        <RegistrationStatusSelector
                          registration={reg}
                          onStatusChange={handleRegistrationStatusChange}
                        />
                      </div>

                      {/* Details grid */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl p-3" style={{ background: '#FDF8F0' }}>
                          <p className="text-xs font-semibold mb-0.5" style={{ color: '#b45309' }}>תאריך בקשה</p>
                          <p style={{ color: '#5E4B35' }}>{new Date(reg.created_at).toLocaleDateString('he-IL')}</p>
                        </div>
                        {reg.approved_at && (
                          <div className="rounded-xl p-3" style={{ background: '#dcfce7' }}>
                            <p className="text-xs font-semibold mb-0.5" style={{ color: '#15803d' }}>תאריך אישור</p>
                            <p style={{ color: '#15803d' }}>{new Date(reg.approved_at).toLocaleDateString('he-IL')}</p>
                          </div>
                        )}
                        {reg.waiting_list_position && (
                          <div className="rounded-xl p-3" style={{ background: '#e0f2fe' }}>
                            <p className="text-xs font-semibold mb-0.5" style={{ color: '#0369a1' }}>מקום בתור המתנה</p>
                            <p className="text-2xl font-bold" style={{ color: '#0369a1' }}>{reg.waiting_list_position}</p>
                          </div>
                        )}
                      </div>

                      {/* Status flow visualization */}
                      <div>
                        <p className="text-xs font-semibold mb-2" style={{ color: '#78716c' }}>מסלול הרישום</p>
                        <div className="flex items-center gap-1">
                          {['ממתין לאישור', 'מאושר'].map((step, i) => {
                            const isCurrent = reg.status === step
                            const isPast = (i === 0 && (reg.status === 'מאושר' || reg.status === 'בוטל'))
                            const sStyle = REGISTRATION_STATUS_STYLES[step] || { bg: '#f5f5f4', color: '#78716c' }
                            return (
                              <div key={step} className="flex items-center gap-1">
                                <div
                                  className="rounded-full px-3 py-1 text-xs font-semibold"
                                  style={
                                    isCurrent
                                      ? { background: sStyle.bg, color: sStyle.color, border: `2px solid ${sStyle.color}` }
                                      : isPast
                                        ? { background: '#dcfce7', color: '#15803d', opacity: 0.7 }
                                        : { background: '#f5f5f4', color: '#a8a29e' }
                                  }
                                >
                                  {isPast ? '✓ ' : ''}{step}
                                </div>
                                {i < 1 && <span style={{ color: '#a8a29e' }}>←</span>}
                              </div>
                            )
                          })}
                          {(reg.status === 'נדחה' || reg.status === 'בוטל' || reg.status === 'רשימת המתנה') && (
                            <>
                              <span style={{ color: '#a8a29e' }}>·</span>
                              <div
                                className="rounded-full px-3 py-1 text-xs font-semibold"
                                style={{ ...(REGISTRATION_STATUS_STYLES[reg.status] || { bg: '#f5f5f4', color: '#78716c' }), border: `2px solid` }}
                              >
                                {reg.status}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {reg.notes && (
                        <div className="rounded-xl p-3" style={{ background: '#FEF9EE' }}>
                          <p className="text-xs font-semibold mb-1" style={{ color: '#b45309' }}>הערות</p>
                          <p className="text-sm" style={{ color: '#5E4B35' }}>{reg.notes}</p>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
