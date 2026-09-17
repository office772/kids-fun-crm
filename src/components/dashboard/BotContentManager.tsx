'use client'

import { useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, Search, X, Check, LayoutGrid, List, AlertTriangle } from 'lucide-react'
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
  const [view, setView] = useState<'cards' | 'table'>('cards')

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
      {/* ⚠️ תצוגה מקדימה — עריכה כאן עדיין לא נשמרת ולא משפיעה על הבוט (התוכן דמו). */}
      <div className="rounded-xl border p-4 flex items-start gap-3" style={{ background: '#FEF3E2', borderColor: '#F5C97A' }}>
        <AlertTriangle size={20} color="#B45309" className="flex-shrink-0 mt-0.5" />
        <div className="text-sm leading-relaxed" style={{ color: '#7C4A03' }}>
          <p className="font-bold mb-0.5">תצוגה מקדימה — העריכה כאן עדיין לא פעילה</p>
          <p>
            ההודעות כאן הן דוגמה, ו<b>שינוי/הוספה/מחיקה כאן לא נשמרים ולא משפיעים על הבוט</b> (הפיצ&apos;ר בבנייה).
            לראות את ההודעות <b>האמיתיות</b> של הבוט — בלשונית <b>🗺️ מסלולים (קנבן)</b>.
            לשינוי טקסט בשלב זה — פני לעינת.
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--crm-primary)' }}>ניהול תכני בוט</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--crm-text-muted)' }}>{items.length} הודעות · {items.filter(i => i.is_active).length} פעילות</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
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
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-sm transition-opacity hover:opacity-90"
            style={{ background: 'var(--crm-action)', color: 'var(--crm-text)' }}
          >
            <Plus size={16} />
            הוסף הודעה
          </button>
        </div>
      </div>

      {/* Toolbar: search + dropdown filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--crm-text-muted)' }} />
          <input
            type="text"
            placeholder="חיפוש לפי כותרת, מפתח או תוכן..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border rounded-full pr-9 pl-9 py-2 text-sm focus:outline-none bg-crm-surface text-right"
            style={{ borderColor: 'var(--crm-border)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--crm-text-muted)' }}>
              <X size={14} />
            </button>
          )}
        </div>
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value as BotContentCategory | 'all')}
          className="rounded-full border bg-crm-surface px-4 py-2 text-sm cursor-pointer focus:outline-none"
          style={catFilter !== 'all'
            ? { borderColor: 'var(--crm-primary)', color: 'var(--crm-primary)', fontWeight: 600 }
            : { borderColor: 'var(--crm-border)', color: 'var(--crm-text)' }}
        >
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.value === 'all' ? 'כל הקטגוריות' : c.label}</option>)}
        </select>
        <select
          value={flowFilter}
          onChange={e => setFlowFilter(e.target.value as BotContentFlow | 'all')}
          className="rounded-full border bg-crm-surface px-4 py-2 text-sm cursor-pointer focus:outline-none"
          style={flowFilter !== 'all'
            ? { borderColor: 'var(--crm-primary)', color: 'var(--crm-primary)', fontWeight: 600 }
            : { borderColor: 'var(--crm-border)', color: 'var(--crm-text)' }}
        >
          {FLOWS.map(f => <option key={f.value} value={f.value}>{f.value === 'all' ? 'כל המסלולים' : f.label}</option>)}
        </select>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-14" style={{ color: 'var(--crm-text-muted)' }}>
          <div className="text-4xl mb-2">🔍</div>
          <p>לא נמצאו תוצאות</p>
        </div>
      )}

      {/* Cards view — קונטור רך, מינימום צביעה */}
      {filtered.length > 0 && view === 'cards' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(item => (
            <div
              key={item.id}
              className="bg-crm-surface rounded-crm border border-crm-border p-5 transition-shadow hover:shadow-crm"
              style={{ opacity: item.is_active ? 1 : 0.6 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h3 className="font-semibold text-base" style={{ color: 'var(--crm-text)' }}>{item.title}</h3>
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded border" style={{ background: 'var(--crm-surface-soft)', color: 'var(--crm-text-muted)', borderColor: 'var(--crm-border)' }}>{item.key}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-2.5">
                    <CategoryBadge category={item.category} />
                    <FlowBadge flow={item.flow} />
                    {item.step_label && <span className="text-xs" style={{ color: 'var(--crm-text-muted)' }}>{item.step_label}</span>}
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-line line-clamp-2" style={{ color: 'var(--crm-text)', opacity: 0.7 }}>{item.content}</p>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <ActivePill active={item.is_active} onClick={() => toggleActive(item.id)} />
                  <RowActions item={item} onEdit={openEdit} deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm} onDelete={handleDelete} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table view — נקי, מבוסס קונטור */}
      {filtered.length > 0 && view === 'table' && (
        <div className="bg-crm-surface rounded-crm border border-crm-border overflow-x-auto">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="border-b border-crm-border" style={{ background: 'var(--crm-surface-soft)' }}>
                <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--crm-primary)' }}>כותרת</th>
                <th className="text-right px-3 py-3 font-semibold hidden md:table-cell" style={{ color: 'var(--crm-primary)' }}>מפתח</th>
                <th className="text-right px-3 py-3 font-semibold" style={{ color: 'var(--crm-primary)' }}>קטגוריה</th>
                <th className="text-right px-3 py-3 font-semibold hidden sm:table-cell" style={{ color: 'var(--crm-primary)' }}>מסלול</th>
                <th className="text-right px-3 py-3 font-semibold" style={{ color: 'var(--crm-primary)' }}>סטטוס</th>
                <th className="px-3 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => (
                <tr key={item.id} className="border-b border-crm-border hover:bg-crm-surface-soft transition-colors"
                  style={i % 2 !== 0 ? { background: 'var(--crm-surface-soft)' } : {}}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--crm-text)' }}>{item.title}</td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded border" style={{ background: 'var(--crm-surface)', color: 'var(--crm-text-muted)', borderColor: 'var(--crm-border)' }}>{item.key}</span>
                  </td>
                  <td className="px-3 py-3"><CategoryBadge category={item.category} /></td>
                  <td className="px-3 py-3 hidden sm:table-cell"><FlowBadge flow={item.flow} /></td>
                  <td className="px-3 py-3"><ActivePill active={item.is_active} onClick={() => toggleActive(item.id)} /></td>
                  <td className="px-3 py-3">
                    <RowActions item={item} onEdit={openEdit} deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm} onDelete={handleDelete} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
            {/* Modal header */}
            <div className="flex items-center justify-between p-6 pb-4 border-b border-crm-border">
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
                    className="w-full border border-crm-border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none"
                    onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--crm-border)')}
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--crm-text)' }}>קטגוריה</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as BotContentCategory }))}
                    className="w-full border border-crm-border rounded-xl px-3 py-2 text-sm focus:outline-none bg-white"
                    onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--crm-border)')}>
                    {CATEGORIES.filter(c => c.value !== 'all').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 2: flow + step_label */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--crm-text)' }}>מסלול</label>
                  <select value={form.flow} onChange={e => setForm(f => ({ ...f, flow: e.target.value as BotContentFlow }))}
                    className="w-full border border-crm-border rounded-xl px-3 py-2 text-sm focus:outline-none bg-white"
                    onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--crm-border)')}>
                    {FLOWS.filter(f => f.value !== 'all').map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--crm-text)' }}>שלב</label>
                  <input
                    value={form.step_label}
                    onChange={e => setForm(f => ({ ...f, step_label: e.target.value }))}
                    placeholder="שלב 1 — ברכה"
                    className="w-full border border-crm-border rounded-xl px-3 py-2 text-sm focus:outline-none"
                    onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--crm-border)')}
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
                  className="w-full border border-crm-border rounded-xl px-3 py-2 text-sm focus:outline-none"
                  onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--crm-border)')}
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
                  className="w-full border border-crm-border rounded-xl px-3 py-2 text-sm focus:outline-none resize-none"
                  onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--crm-border)')}
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

// ─── סטטוס פעיל/כבוי — קונטור בלבד ─────────────────────────────────────────
function ActivePill({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-colors hover:bg-crm-surface-soft flex-shrink-0"
      style={active
        ? { borderColor: 'var(--crm-primary)', color: 'var(--crm-primary)' }
        : { borderColor: 'var(--crm-border)', color: 'var(--crm-text-muted)' }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? 'var(--crm-primary)' : 'var(--crm-text-muted)' }} />
      {active ? 'פעיל' : 'כבוי'}
    </button>
  )
}

// ─── פעולות שורה (עריכה/מחיקה) — אייקוני רפאים ──────────────────────────────
function RowActions({ item, onEdit, deleteConfirm, setDeleteConfirm, onDelete }: {
  item: BotContent
  onEdit: (i: BotContent) => void
  deleteConfirm: string | null
  setDeleteConfirm: (id: string | null) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <button onClick={() => onEdit(item)}
        className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-crm-surface-soft"
        style={{ color: 'var(--crm-text-muted)' }} title="עריכה">
        <Pencil size={14} />
      </button>
      {deleteConfirm === item.id ? (
        <div className="flex items-center gap-1">
          <button onClick={() => onDelete(item.id)} className="w-7 h-7 rounded-full flex items-center justify-center border" style={{ background: 'var(--crm-danger-bg)', color: 'var(--crm-danger)', borderColor: 'var(--crm-danger)' }} title="אישור מחיקה">
            <Check size={13} />
          </button>
          <button onClick={() => setDeleteConfirm(null)} className="w-7 h-7 rounded-full flex items-center justify-center border" style={{ borderColor: 'var(--crm-border)', color: 'var(--crm-text-muted)' }} title="ביטול">
            <X size={13} />
          </button>
        </div>
      ) : (
        <button onClick={() => setDeleteConfirm(item.id)}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-crm-surface-soft"
          style={{ color: 'var(--crm-text-muted)' }} title="מחיקה">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}

// ─── Badge helpers ────────────────────────────────────────────────────────────
// קונטור רך: צ'יפ ניטרלי עם מסגרת + נקודת-צבע קטנה בלבד (מינימום צביעה).

const Chip = ({ label, dot }: { label: string; dot: string }) => (
  <span
    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full border"
    style={{ background: 'var(--crm-surface)', borderColor: 'var(--crm-border)', color: 'var(--crm-text-muted)' }}
  >
    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
    {label}
  </span>
)

const CAT_META: Record<BotContentCategory, { label: string; dot: string }> = {
  general:      { label: 'כללי',   dot: '#9A7B6B' },
  registration: { label: 'רישום',  dot: '#6D436D' },
  cancellation: { label: 'ביטול',  dot: '#B0455E' },
  payment:      { label: 'תשלום',  dot: '#D29486' },
  schedule:     { label: 'לו"ז',   dot: '#C98A2B' },
  camp:         { label: 'קייטנה', dot: '#9B4A38' },
}

function CategoryBadge({ category }: { category: BotContentCategory }) {
  const m = CAT_META[category] ?? { label: category, dot: '#9A7B6B' }
  return <Chip label={m.label} dot={m.dot} />
}

const FLOW_META: Record<BotContentFlow, { label: string; dot: string }> = {
  general:       { label: 'כללי',        dot: '#9A7B6B' },
  'צהרון':       { label: 'צהרון',       dot: '#6D436D' },
  'קייטנה':      { label: 'קייטנה',      dot: '#D29486' },
  'ביטול':       { label: 'ביטול',       dot: '#B0455E' },
  'תשלום':       { label: 'תשלום',       dot: '#9B4A38' },
  'לוז':         { label: 'לו"ז',        dot: '#C98A2B' },
  'איסוף_מוקדם': { label: 'איסוף מוקדם', dot: '#6D436D' },
}

function FlowBadge({ flow }: { flow: BotContentFlow }) {
  const m = FLOW_META[flow] ?? { label: flow, dot: '#9A7B6B' }
  return <Chip label={m.label} dot={m.dot} />
}
