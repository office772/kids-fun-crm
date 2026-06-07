'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Save, X, ExternalLink } from 'lucide-react'
import type { FAQ, FAQCategory } from '@/lib/types'

const CATEGORIES: FAQCategory[] = ['תשלומים', 'לוז', 'קייטנה', 'ביטול', 'כללי']

// ─── FormPanel מחוץ לקומפוננטה — למנוע unmount בכל render ──────────────────
interface FormPanelProps {
  form: Omit<FAQ, 'id' | 'created_at'>
  saving: boolean
  onFieldChange: (field: keyof Omit<FAQ, 'id' | 'created_at'>, value: string | boolean) => void
  onSave: () => void
  onCancel: () => void
}

function FormPanel({ form, saving, onFieldChange, onSave, onCancel }: FormPanelProps) {
  return (
    <div className="bg-[#fdf6ef] border border-[#e8d5c4] rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">מפתח (key)</label>
          <input
            value={form.key}
            onChange={e => onFieldChange('key', e.target.value)}
            placeholder="sibling_discount"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#297058]/30 bg-white"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">קטגוריה</label>
          <select
            value={form.category}
            onChange={e => onFieldChange('category', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#297058]/30 bg-white"
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 mb-1 block">שאלה</label>
        <input
          value={form.question}
          onChange={e => onFieldChange('question', e.target.value)}
          placeholder="יש הנחה לאחים?"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#297058]/30 bg-white"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 mb-1 block">
          תשובה
          <span className="text-gray-400 font-normal mr-2">— ניתן להשתמש ב-*bold* ו-&#92;n לשורות חדשות</span>
        </label>
        <textarea
          value={form.answer}
          onChange={e => onFieldChange('answer', e.target.value)}
          rows={4}
          placeholder="כן! ממשפחה עם 2 ילדים ומעלה — הנחה של *10%* על הילד השני ואילך."
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#297058]/30 bg-white resize-none"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={e => onFieldChange('is_active', e.target.checked)}
            className="rounded"
          />
          פעיל (מוצג בבוט ובדף)
        </label>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg flex items-center gap-1"
          >
            <X size={14} /> ביטול
          </button>
          <button
            onClick={onSave}
            disabled={saving || !form.key || !form.question || !form.answer}
            className="px-3 py-1.5 text-sm bg-[#297058] text-white rounded-lg flex items-center gap-1 disabled:opacity-50 hover:bg-[#1f5543] transition-colors"
          >
            <Save size={14} /> {saving ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </div>
    </div>
  )
}

const CATEGORY_COLORS: Record<FAQCategory, { bg: string; text: string }> = {
  'תשלומים': { bg: 'bg-[#E6F4EF]',   text: 'text-[#297058]' },
  'לוז':     { bg: 'bg-[#FEF9C3]',   text: 'text-[#7B6010]' },
  'קייטנה':  { bg: 'bg-[#FAF0ED]',   text: 'text-[#9B4A38]' },
  'ביטול':   { bg: 'bg-[#FCEAEA]',   text: 'text-[#EF4444]' },
  'כללי':    { bg: 'bg-[#F0F1F2]',   text: 'text-[#7B8794]' },
}

const EMPTY_FORM: Omit<FAQ, 'id' | 'created_at'> = {
  key:       '',
  question:  '',
  answer:    '',
  category:  'כללי',
  is_active: true,
}

export function BotFAQManager() {
  const [faqs, setFaqs]         = useState<FAQ[]>([])
  const [loading, setLoading]   = useState(true)
  const [editId, setEditId]     = useState<string | null>(null)
  const [showAdd, setShowAdd]   = useState(false)
  const [form, setForm]         = useState({ ...EMPTY_FORM })
  const [saving, setSaving]     = useState(false)
  const [catFilter, setCatFilter] = useState<FAQCategory | 'הכל'>('הכל')

  useEffect(() => {
    fetch('/api/faq?_all=1')
      .then(r => r.json())
      .then((data: FAQ[]) => { setFaqs(data); setLoading(false) })
  }, [])

  const filtered = catFilter === 'הכל'
    ? faqs
    : faqs.filter(f => f.category === catFilter)

  function openEdit(faq: FAQ) {
    setEditId(faq.id)
    setForm({ key: faq.key, question: faq.question, answer: faq.answer, category: faq.category, is_active: faq.is_active })
    setShowAdd(false)
  }

  function openAdd() {
    setShowAdd(true)
    setEditId(null)
    setForm({ ...EMPTY_FORM })
  }

  async function handleSave() {
    if (!form.key || !form.question || !form.answer) return
    setSaving(true)

    try {
      if (editId) {
        const res = await fetch(`/api/faq?id=${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (res.ok) {
          const updated = await res.json() as FAQ
          setFaqs(prev => prev.map(f => f.id === editId ? updated : f))
        } else {
          // דמו מוד — עדכן לוקאלית
          setFaqs(prev => prev.map(f => f.id === editId ? { ...f, ...form } : f))
        }
        setEditId(null)
      } else {
        const res = await fetch('/api/faq', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (res.ok) {
          const created = await res.json() as FAQ
          setFaqs(prev => [...prev, created])
        } else {
          // דמו מוד — הוסף לוקאלית
          const mockFaq: FAQ = { ...form, id: `local-${Date.now()}`, created_at: new Date().toISOString() }
          setFaqs(prev => [...prev, mockFaq])
        }
        setShowAdd(false)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(faq: FAQ) {
    const res = await fetch(`/api/faq?id=${faq.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !faq.is_active }),
    })
    if (res.ok) {
      const updated = await res.json() as FAQ
      setFaqs(prev => prev.map(f => f.id === faq.id ? updated : f))
    } else {
      setFaqs(prev => prev.map(f => f.id === faq.id ? { ...f, is_active: !f.is_active } : f))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('למחוק את השאלה הזו?')) return
    const res = await fetch(`/api/faq?id=${id}`, { method: 'DELETE' })
    if (res.ok || res.status === 400) {
      setFaqs(prev => prev.filter(f => f.id !== id))
    }
  }

  function handleFieldChange(field: keyof Omit<FAQ, 'id' | 'created_at'>, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function handleCancel() {
    setEditId(null)
    setShowAdd(false)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-[#3d2b1f]">שאלות ותשובות</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            הבוט שואב מכאן תשובות אוטומטיות לשאלות נפוצות
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <a
            href="/faq"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-[#297058] hover:underline"
          >
            <ExternalLink size={12} />
            צפה בדף ציבורי
          </a>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 bg-[#297058] text-white px-3 py-1.5 rounded-lg text-sm hover:bg-[#1f5543] transition-colors"
          >
            <Plus size={15} /> שאלה חדשה
          </button>
        </div>
      </div>

      {/* פילטר קטגוריות */}
      <div className="flex gap-1.5 flex-wrap">
        {(['הכל', ...CATEGORIES] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setCatFilter(cat as FAQCategory | 'הכל')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
              catFilter === cat
                ? 'bg-[#297058] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* טופס הוספה */}
      {showAdd && (
        <FormPanel
          form={form}
          saving={saving}
          onFieldChange={handleFieldChange}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}

      {/* רשימה */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">אין שאלות בקטגוריה זו</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(faq => (
            <div key={faq.id}>
              {editId === faq.id ? (
                <FormPanel
                  form={form}
                  saving={saving}
                  onFieldChange={handleFieldChange}
                  onSave={handleSave}
                  onCancel={handleCancel}
                />
              ) : (
                <div className={`bg-white rounded-xl border p-4 ${faq.is_active ? 'border-gray-100' : 'border-gray-200 opacity-60'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[faq.category].bg} ${CATEGORY_COLORS[faq.category].text}`}>
                          {faq.category}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">{faq.key}</span>
                        {!faq.is_active && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">מושבת</span>
                        )}
                      </div>
                      <p className="font-medium text-sm text-[#3d2b1f]">{faq.question}</p>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{faq.answer.replace(/\*([^*]+)\*/g, '$1')}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggle(faq)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#297058] transition-colors"
                        title={faq.is_active ? 'השבת' : 'הפעל'}
                      >
                        {faq.is_active
                          ? <ToggleRight size={18} className="text-[#297058]" />
                          : <ToggleLeft size={18} />
                        }
                      </button>
                      <button
                        onClick={() => openEdit(faq)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#297058] transition-colors"
                        title="ערוך"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(faq.id)}
                        className="p-1.5 rounded-lg hover:bg-[#FCEAEA] text-gray-400 hover:text-[#EF4444] transition-colors"
                        title="מחק"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
