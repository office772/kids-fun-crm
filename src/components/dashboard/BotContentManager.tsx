'use client'

import { useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, Search, X, Check } from 'lucide-react'
import { BotContent, BotContentCategory, BotContentFlow } from '@/lib/types'

// ─── Demo data ───────────────────────────────────────────────────────────────
const DEMO_BOT_CONTENT: BotContent[] = [
  { id: '1', key: 'greeting', title: 'ברכת פתיחה', content: 'שלום {שם}! 👋 כאן Kids & Fun. במה אפשר לעזור?\n\n1️⃣ רישום לצהרון\n2️⃣ רישום לקייטנה\n3️⃣ ביטול\n4️⃣ שעות ולו"ז\n5️⃣ תשלומים\n6️⃣ איסוף מוקדם', category: 'general', flow: 'general', step_label: 'שלב 0 — פתיחה', is_active: true, created_at: new Date().toISOString() },
  { id: '2', key: 'registration_start', title: 'פתיחת רישום לצהרון', content: 'מעולה! בואו נרשום את {ילד} לצהרון 🎒\nמה כיתת הילד/ה?', category: 'registration', flow: 'צהרון', step_label: 'שלב 1 — איסוף נתונים', is_active: true, created_at: new Date().toISOString() },
  { id: '3', key: 'registration_confirm', title: 'אישור רישום', content: 'הרישום של {ילד} התקבל! ✅\nנחזור אליך עם אישור סופי ב-24 שעות.', category: 'registration', flow: 'צהרון', step_label: 'שלב 4 — אישור', is_active: true, created_at: new Date().toISOString() },
  { id: '4', key: 'registration_full', title: 'רישום הושלם', content: 'הרישום הושלם בהצלחה! 🎉\n{ילד} רשום/ה לצהרון.\nנתראה ב-{תאריך_התחלה}!', category: 'registration', flow: 'צהרון', step_label: 'שלב 5 — סיום', is_active: true, created_at: new Date().toISOString() },
  { id: '5', key: 'payment_link', title: 'קישור לתשלום', content: 'לתשלום דמי הרישום לחץ/י כאן 💳\n{קישור_תשלום}', category: 'payment', flow: 'תשלום', step_label: 'שלב 1 — בקשת תשלום', is_active: true, created_at: new Date().toISOString() },
  { id: '6', key: 'payment_failed_proactive', title: 'כשל תשלום — פנייה יזומה', content: 'היי {שם} 😊\nשמנו לב שהייתה בעיה עם התשלום החודש.\nרוצה שנסדר יחד? מתי נוח לדבר?', category: 'payment', flow: 'תשלום', step_label: 'שלב 1 — פנייה יזומה', is_active: true, created_at: new Date().toISOString() },
  { id: '7', key: 'cancellation_policy', title: 'הסבר מדיניות ביטול', content: 'לפי התקנון שלנו 📋\n✅ ביטול עד ה-15 לחודש — זיכוי מלא לחודש הבא\n⚠️ ביטול אחרי ה-15 — זיכוי חצי חודש הבא\n\nהאם ברצונך להמשיך בביטול?', category: 'cancellation', flow: 'ביטול', step_label: 'שלב 1 — הסבר מדיניות', is_active: true, created_at: new Date().toISOString() },
  { id: '8', key: 'schedule_hours', title: 'שעות פעילות', content: 'שעות הצהרון ⏰\nראשון–חמישי: {שעת_פתיחה}–{שעת_סגירה}\n\n{הערות_חגים}', category: 'schedule', flow: 'לוז', step_label: 'שלב 1 — תשובה', is_active: true, created_at: new Date().toISOString() },
  { id: '9', key: 'camp_registration_open', title: 'רישום לקייטנה — פתוח', content: 'הרשמה לקייטנה קיץ פתוחה! 🏕️\nלרישום ותשלום לחץ/י כאן:\n{קישור_קייטנה}', category: 'camp', flow: 'קייטנה', step_label: 'שלב 1 — קישור', is_active: true, created_at: new Date().toISOString() },
  { id: '10', key: 'waitlist_added', title: 'נוסף לרשימת המתנה', content: 'הוספנו אותך לרשימת ההמתנה! 🙏\nנעדכן אותך ברגע שיפתח מקום.\nשם: {ילד} | מסגרת: {מסגרת}', category: 'registration', flow: 'צהרון', step_label: 'שלב 5 — המתנה', is_active: true, created_at: new Date().toISOString() },
  { id: '11', key: 'out_of_hours', title: 'מחוץ לשעות פעילות', content: 'קיבלנו את פנייתך! 🙏\nצוות Kids & Fun יחזור אליך בשעות הפעילות (ראשון–חמישי 8:00–17:00).', category: 'general', flow: 'general', step_label: 'שלב 0 — מחוץ לשעות', is_active: true, created_at: new Date().toISOString() },
  { id: '12', key: 'early_pickup_confirm', title: 'אישור איסוף מוקדם', content: 'קיבלנו את הבקשה לאיסוף מוקדם של {ילד} בשעה {שעה} ✅\nהצוות עודכן!', category: 'general', flow: 'איסוף_מוקדם', step_label: 'שלב 2 — אישור', is_active: true, created_at: new Date().toISOString() },
]

const CATEGORIES: { value: BotContentCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'הכל' },
  { value: 'general', label: 'כללי' },
  { value: 'registration', label: 'רישום' },
  { value: 'cancellation', label: 'ביטול' },
  { value: 'payment', label: 'תשלום' },
  { value: 'schedule', label: 'לו"ז' },
  { value: 'camp', label: 'קייטנה' },
]

const FLOWS: { value: BotContentFlow | 'all'; label: string }[] = [
  { value: 'all', label: 'הכל' },
  { value: 'general', label: 'כללי' },
  { value: 'צהרון', label: 'צהרון' },
  { value: 'קייטנה', label: 'קייטנה' },
  { value: 'ביטול', label: 'ביטול' },
  { value: 'תשלום', label: 'תשלום' },
  { value: 'לוז', label: 'לו"ז' },
  { value: 'איסוף_מוקדם', label: 'איסוף מוקדם' },
]

const PLACEHOLDER_HINTS = ['{שם}', '{ילד}', '{קישור_תשלום}', '{קישור_קייטנה}', '{שעת_פתיחה}', '{שעת_סגירה}', '{תאריך_התחלה}', '{מסגרת}', '{שעה}']

const emptyForm: Omit<BotContent, 'id' | 'created_at'> = {
  key: '', title: '', content: '', category: 'general', flow: 'general', step_label: '', is_active: true,
}

export function BotContentManager() {
  const [items, setItems] = useState<BotContent[]>(DEMO_BOT_CONTENT)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<BotContentCategory | 'all'>('all')
  const [flowFilter, setFlowFilter] = useState<BotContentFlow | 'all'>('all')
  const [editItem, setEditItem] = useState<BotContent | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return items
      .filter(i => {
        if (q && !i.title.toLowerCase().includes(q) && !i.key.toLowerCase().includes(q) && !i.content.toLowerCase().includes(q)) return false
        if (catFilter !== 'all' && i.category !== catFilter) return false
        if (flowFilter !== 'all' && i.flow !== flowFilter) return false
        return true
      })
      .sort((a, b) => (a.step_label || '').localeCompare(b.step_label || '', 'he'))
  }, [items, search, catFilter, flowFilter])

  const openAdd = () => {
    setEditItem(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  const openEdit = (item: BotContent) => {
    setEditItem(item)
    setForm({ key: item.key, title: item.title, content: item.content, category: item.category, flow: item.flow, step_label: item.step_label, is_active: item.is_active })
    setShowModal(true)
  }

  const handleSave = () => {
    if (!form.key || !form.title || !form.content) return
    if (editItem) {
      setItems(prev => prev.map(i => i.id === editItem.id ? { ...i, ...form } : i))
    } else {
      setItems(prev => [...prev, { ...form, id: Date.now().toString(), created_at: new Date().toISOString() }])
    }
    setShowModal(false)
  }

  const handleDelete = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    setDeleteConfirm(null)
  }

  const toggleActive = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_active: !i.is_active } : i))
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--crm-primary)' }}>ניהול תכני בוט</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>{items.length} הודעות במערכת · {items.filter(i => i.is_active).length} פעילות</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm transition-opacity hover:opacity-90"
          style={{ background: 'var(--crm-action)', color: 'var(--crm-text)' }}
        >
          <Plus size={16} />
          הוסף הודעה
        </button>
      </div>

      {/* Search + filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="חיפוש לפי כותרת, מפתח או תוכן..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-full pr-9 pl-9 py-2.5 text-sm focus:outline-none bg-white text-right"
            onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
            onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium" style={{ color: 'var(--crm-text)', opacity: 0.5 }}>קטגוריה:</span>
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => setCatFilter(c.value as BotContentCategory | 'all')}
              className="px-3 py-1 rounded-full text-xs font-medium transition-all"
              style={catFilter === c.value
                ? { background: 'var(--crm-primary)', color: '#fff' }
                : { background: '#fff', color: 'var(--crm-text)', border: '1px solid #e5e7eb' }}
            >{c.label}</button>
          ))}
        </div>

        {/* Flow pills */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium" style={{ color: 'var(--crm-text)', opacity: 0.5 }}>מסלול:</span>
          {FLOWS.map(f => (
            <button
              key={f.value}
              onClick={() => setFlowFilter(f.value as BotContentFlow | 'all')}
              className="px-3 py-1 rounded-full text-xs font-medium transition-all"
              style={flowFilter === f.value
                ? { background: 'var(--crm-accent)', color: '#fff' }
                : { background: '#fff', color: 'var(--crm-text)', border: '1px solid #e5e7eb' }}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-stone-400">
            <div className="text-4xl mb-2">🔍</div>
            <p>לא נמצאו תוצאות</p>
          </div>
        )}
        {filtered.map(item => (
          <div
            key={item.id}
            className="bg-white rounded-2xl border p-4 flex items-start gap-4 transition-shadow hover:shadow-sm"
            style={{ borderColor: item.is_active ? '#f3f4f6' : '#f5dde5', opacity: item.is_active ? 1 : 0.7 }}
          >
            {/* Active toggle */}
            <button
              onClick={() => toggleActive(item.id)}
              className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors mt-0.5"
              style={{ background: item.is_active ? 'var(--crm-primary)' : '#d1d5db' }}
              title={item.is_active ? 'פעיל — לחץ לכיבוי' : 'כבוי — לחץ להפעלה'}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${item.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-semibold text-sm" style={{ color: 'var(--crm-text)' }}>{item.title}</span>
                <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: '#f5f5f4', color: '#78716c' }}>{item.key}</span>
                <CategoryBadge category={item.category} />
                <FlowBadge flow={item.flow} />
              </div>
              {item.step_label && (
                <p className="text-xs mb-1.5" style={{ color: 'var(--crm-text)', opacity: 0.5 }}>{item.step_label}</p>
              )}
              <p className="text-sm leading-relaxed whitespace-pre-line line-clamp-2" style={{ color: 'var(--crm-text)', opacity: 0.75 }}>{item.content}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => openEdit(item)}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100"
                style={{ color: 'var(--crm-text)', opacity: 0.55 }}
              >
                <Pencil size={14} />
              </button>
              {deleteConfirm === item.id ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => handleDelete(item.id)} className="w-7 h-7 rounded-full flex items-center justify-center bg-red-100 text-red-600 hover:bg-red-200">
                    <Check size={13} />
                  </button>
                  <button onClick={() => setDeleteConfirm(null)} className="w-7 h-7 rounded-full flex items-center justify-center bg-gray-100 text-gray-500 hover:bg-gray-200">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(item.id)}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-gray-100"
                  style={{ color: 'var(--crm-text)', opacity: 0.4 }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
            {/* Modal header */}
            <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100">
              <h3 className="text-lg font-bold" style={{ color: 'var(--crm-primary)' }}>
                {editItem ? 'עריכת הודעה' : 'הודעה חדשה'}
              </h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
                <X size={18} style={{ color: 'var(--crm-text)' }} />
              </button>
            </div>

            {/* Form */}
            <div className="p-6 space-y-4">
              {/* Row 1: key + category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--crm-text)' }}>מפתח (key) *</label>
                  <input
                    value={form.key}
                    onChange={e => setForm(f => ({ ...f, key: e.target.value.replace(/\s/g, '_').toLowerCase() }))}
                    placeholder="greeting"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none"
                    onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--crm-text)' }}>קטגוריה</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as BotContentCategory }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white"
                    onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}>
                    {CATEGORIES.filter(c => c.value !== 'all').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 2: flow + step_label */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--crm-text)' }}>מסלול</label>
                  <select value={form.flow} onChange={e => setForm(f => ({ ...f, flow: e.target.value as BotContentFlow }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white"
                    onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}>
                    {FLOWS.filter(f => f.value !== 'all').map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--crm-text)' }}>שלב</label>
                  <input
                    value={form.step_label}
                    onChange={e => setForm(f => ({ ...f, step_label: e.target.value }))}
                    placeholder="שלב 1 — ברכה"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
                    onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
                    onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                  />
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--crm-text)' }}>כותרת *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="שם תצוגה של ההודעה"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
                  onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
                  onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                />
              </div>

              {/* Content */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--crm-text)' }}>תוכן ההודעה *</label>
                  <div className="flex flex-wrap gap-1">
                    {PLACEHOLDER_HINTS.map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, content: f.content + p }))}
                        className="text-xs px-2 py-0.5 rounded-full border transition-colors hover:opacity-80"
                        style={{ background: '#fce9e6', color: '#a05a4f', borderColor: '#f0cfc4' }}
                      >{p}</button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  rows={5}
                  placeholder="כתוב את תוכן ההודעה. השתמש בלחצנים למעלה להוספת משתני תצוגה."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none resize-none"
                  onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
                  onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                  style={{ background: form.is_active ? 'var(--crm-primary)' : '#d1d5db' }}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm font-medium" style={{ color: 'var(--crm-text)' }}>
                  {form.is_active ? 'הודעה פעילה' : 'הודעה כבויה'}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={handleSave}
                disabled={!form.key || !form.title || !form.content}
                className="flex-1 py-2.5 rounded-full font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--crm-action)', color: 'var(--crm-text)' }}
              >
                {editItem ? 'שמור שינויים' : 'הוסף הודעה'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-full font-semibold text-sm bg-gray-100 hover:bg-gray-200 transition-colors"
                style={{ color: 'var(--crm-text)' }}
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

// ─── Badge helpers ────────────────────────────────────────────────────────────

const CAT_COLORS: Record<BotContentCategory, { bg: string; color: string }> = {
  general:      { bg: '#f5f5f4', color: '#78716c' },
  registration: { bg: '#dcfce7', color: '#15803d' },
  cancellation: { bg: '#f5dde5', color: '#7d2d4a' },
  payment:      { bg: '#fce9e6', color: '#a05a4f' },
  schedule:     { bg: '#fef3c7', color: '#b45309' },
  camp:         { bg: '#ede8f5', color: '#5a3d7a' },
}

function CategoryBadge({ category }: { category: BotContentCategory }) {
  const labels: Record<BotContentCategory, string> = {
    general: 'כללי', registration: 'רישום', cancellation: 'ביטול', payment: 'תשלום', schedule: 'לו"ז', camp: 'קייטנה',
  }
  const { bg, color } = CAT_COLORS[category]
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: bg, color }}>{labels[category]}</span>
  )
}

const FLOW_COLORS: Record<BotContentFlow, { bg: string; color: string }> = {
  general:       { bg: '#f5f5f4', color: '#78716c' },
  'צהרון':       { bg: '#e8d5e8', color: '#6D436D' },
  'קייטנה':      { bg: '#d5e8e8', color: '#2A6B6B' },
  'ביטול':       { bg: '#f5dde5', color: '#7d2d4a' },
  'תשלום':       { bg: '#fce9e6', color: '#a05a4f' },
  'לוז':         { bg: '#fef3c7', color: '#b45309' },
  'איסוף_מוקדם': { bg: '#fef9c3', color: '#854d0e' },
}

function FlowBadge({ flow }: { flow: BotContentFlow }) {
  const labels: Record<BotContentFlow, string> = {
    general: 'כללי', 'צהרון': 'צהרון', 'קייטנה': 'קייטנה', 'ביטול': 'ביטול', 'תשלום': 'תשלום', 'לוז': 'לו"ז', 'איסוף_מוקדם': 'איסוף מוקדם',
  }
  const { bg, color } = FLOW_COLORS[flow] ?? { bg: '#f5f5f4', color: '#78716c' }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium border" style={{ background: bg, color, borderColor: color + '40' }}>{labels[flow]}</span>
  )
}
