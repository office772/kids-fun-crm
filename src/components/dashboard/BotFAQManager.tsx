'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Save, X, ExternalLink, Search } from 'lucide-react'
import type { FAQ, FAQCategory } from '@/lib/types'

const CATEGORIES: FAQCategory[] = ['תשלומים', 'לוז', 'קייטנה', 'ביטול', 'כללי']

const CATEGORY_COLORS: Record<FAQCategory, { bg: string; text: string; border: string }> = {
  'תשלומים': { bg: 'bg-[#E6F4EF]', text: 'text-[#297058]', border: 'border-[#297058]' },
  'לוז':     { bg: 'bg-[#FEF9C3]', text: 'text-[#7B6010]', border: 'border-[#7B6010]' },
  'קייטנה':  { bg: 'bg-[#FAF0ED]', text: 'text-[#9B4A38]', border: 'border-[#9B4A38]' },
  'ביטול':   { bg: 'bg-[#FCEAEA]', text: 'text-[#EF4444]', border: 'border-[#EF4444]' },
  'כללי':    { bg: 'bg-[#F0F1F2]', text: 'text-[#7B8794]', border: 'border-[#7B8794]' },
}

interface FormData {
  question:  string
  answer:    string
  category:  FAQCategory
  keywords:  string
  is_active: boolean
}

const EMPTY_FORM: FormData = {
  question:  '',
  answer:    '',
  category:  'כללי',
  keywords:  '',
  is_active: true,
}

// ─── טופס הוספה/עריכה — שורה מורחבת ─────────────────────────────────────────
function FAQForm({ form, saving, onChange, onSave, onCancel }: {
  form: FormData
  saving: boolean
  onChange: <K extends keyof FormData>(field: K, value: FormData[K]) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="bg-[#fdf6ef] border-2 border-[#e8d5c4] rounded-2xl p-5 space-y-4">
      {/* שורה 1: קטגוריה + סטטוס */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-600">קטגוריה:</label>
          {CATEGORIES.map(c => (
            <button key={c} type="button" onClick={() => onChange('category', c)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-all ${
                form.category === c
                  ? `${CATEGORY_COLORS[c].bg} ${CATEGORY_COLORS[c].text} ${CATEGORY_COLORS[c].border}`
                  : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
              }`}>{c}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.is_active}
            onChange={e => onChange('is_active', e.target.checked)} className="rounded" />
          פעיל
        </label>
      </div>

      {/* שאלה */}
      <div>
        <label className="text-xs font-semibold text-gray-700 mb-1 block">השאלה כפי שהורה ישאל</label>
        <input value={form.question}
          onChange={e => onChange('question', e.target.value)}
          placeholder="למשל: מה השעות של הצהרון בימי תחפושות?"
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#297058]/30 bg-white" />
      </div>

      {/* תשובה */}
      <div>
        <label className="text-xs font-semibold text-gray-700 mb-1 block">
          התשובה שהבוט יחזיר
          <span className="text-gray-400 font-normal mr-2 text-xs">— *הדגשה* ו-Enter לשורה חדשה</span>
        </label>
        <textarea value={form.answer}
          onChange={e => onChange('answer', e.target.value)}
          rows={5} dir="rtl"
          placeholder="למשל: ביום תחפושות הצהרון מתקיים בין השעות *12:00-15:30*."
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#297058]/30 bg-white resize-y" />
      </div>

      {/* מילות מפתח */}
      <div>
        <label className="text-xs font-semibold text-gray-700 mb-1 block">
          מילות מפתח לחיפוש <span className="text-gray-400 font-normal">(לא חובה)</span>
          <span className="text-gray-400 font-normal mr-2 text-xs">— מילים נוספות שהורים יכולים לכתוב, מופרדות בפסיק</span>
        </label>
        <input value={form.keywords}
          onChange={e => onChange('keywords', e.target.value)}
          placeholder="למשל: פורים, תחפושות, שעות, יום מיוחד"
          className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#297058]/30 bg-white" />
        <p className="text-xs text-gray-400 mt-1">
          💡 אם הורה ישתמש במילים האלה (במקום הניסוח המדויק של השאלה) — הבוט עדיין ימצא את התשובה
        </p>
      </div>

      {/* כפתורים */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e8d5c4]">
        <button onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 hover:bg-white rounded-lg flex items-center gap-1">
          <X size={14} /> ביטול
        </button>
        <button onClick={onSave}
          disabled={saving || !form.question.trim() || !form.answer.trim()}
          className="px-4 py-2 text-sm bg-[#297058] text-white rounded-lg flex items-center gap-1 disabled:opacity-50 hover:bg-[#1f5543] transition-colors font-semibold">
          <Save size={14} /> {saving ? 'שומר...' : 'שמירה'}
        </button>
      </div>
    </div>
  )
}

// ─── הקומפוננטה הראשית ──────────────────────────────────────────────────────
export function BotFAQManager() {
  const [faqs, setFaqs]         = useState<FAQ[]>([])
  const [loading, setLoading]   = useState(true)
  const [editId, setEditId]     = useState<string | null>(null)
  const [showAdd, setShowAdd]   = useState(false)
  const [form, setForm]         = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)
  const [catFilter, setCatFilter] = useState<FAQCategory | 'הכל'>('הכל')
  const [search, setSearch]     = useState('')

  useEffect(() => {
    fetch('/api/faq?_all=1')
      .then(r => r.json())
      .then((data: FAQ[]) => { setFaqs(data); setLoading(false) })
  }, [])

  const filtered = faqs
    .filter(f => catFilter === 'הכל' || f.category === catFilter)
    .filter(f => !search.trim() ||
      f.question.toLowerCase().includes(search.toLowerCase()) ||
      f.answer.toLowerCase().includes(search.toLowerCase()) ||
      (f.keywords ?? '').toLowerCase().includes(search.toLowerCase()))

  function openEdit(faq: FAQ) {
    setEditId(faq.id)
    setForm({
      question: faq.question, answer: faq.answer, category: faq.category,
      keywords: faq.keywords ?? '', is_active: faq.is_active,
    })
    setShowAdd(false)
  }

  function openAdd() {
    setShowAdd(true); setEditId(null); setForm(EMPTY_FORM)
  }

  async function handleSave() {
    if (!form.question.trim() || !form.answer.trim()) return
    setSaving(true)
    try {
      const body = {
        question:  form.question.trim(),
        answer:    form.answer.trim(),
        category:  form.category,
        keywords:  form.keywords.trim() || null,
        is_active: form.is_active,
      }
      if (editId) {
        const res = await fetch(`/api/faq?id=${editId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const updated = await res.json() as FAQ
          setFaqs(prev => prev.map(f => f.id === editId ? updated : f))
        }
        setEditId(null)
      } else {
        const res = await fetch('/api/faq', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const created = await res.json() as FAQ
          setFaqs(prev => [...prev, created])
        }
        setShowAdd(false)
      }
    } finally { setSaving(false) }
  }

  async function handleToggle(faq: FAQ) {
    const res = await fetch(`/api/faq?id=${faq.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !faq.is_active }),
    })
    if (res.ok) {
      const updated = await res.json() as FAQ
      setFaqs(prev => prev.map(f => f.id === faq.id ? updated : f))
    }
  }

  async function handleDelete(id: string, question: string) {
    if (!confirm(`למחוק את השאלה "${question}"?`)) return
    const res = await fetch(`/api/faq?id=${id}`, { method: 'DELETE' })
    if (res.ok || res.status === 400) setFaqs(prev => prev.filter(f => f.id !== id))
  }

  const counts: Record<string, number> = { 'הכל': faqs.length }
  for (const c of CATEGORIES) counts[c] = faqs.filter(f => f.category === c).length

  return (
    <div className="space-y-4">
      {/* כותרת + פעולות */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-[#3d2b1f] text-lg">שאלות ותשובות לבוט</h3>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            כל שאלה כאן תיענה אוטומטית ע&quot;י הבוט. הוסיפי מילות מפתח כדי שהבוט יזהה ניסוחים שונים של אותה שאלה.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-shrink-0">
          <a href="/faq" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-[#297058] hover:underline px-2 py-1.5">
            <ExternalLink size={12} /> דף ציבורי
          </a>
          <button onClick={openAdd}
            className="flex items-center gap-1.5 bg-[#297058] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#1f5543] transition-colors font-semibold">
            <Plus size={15} /> שאלה חדשה
          </button>
        </div>
      </div>

      {/* חיפוש */}
      <div className="relative">
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש בכל השאלות..."
          className="w-full pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#297058]/30 bg-white" />
      </div>

      {/* פילטר קטגוריות עם ספירה */}
      <div className="flex gap-1.5 flex-wrap">
        {(['הכל', ...CATEGORIES] as const).map(cat => (
          <button key={cat} onClick={() => setCatFilter(cat as FAQCategory | 'הכל')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              catFilter === cat
                ? 'bg-[#297058] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {cat} <span className="opacity-70 mr-1">({counts[cat] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* טופס הוספה */}
      {showAdd && (
        <FAQForm form={form} saving={saving}
          onChange={(field, value) => setForm(f => ({ ...f, [field]: value }))}
          onSave={handleSave} onCancel={() => setShowAdd(false)} />
      )}

      {/* רשימה */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          {search ? `אין תוצאות לחיפוש "${search}"` : 'אין שאלות בקטגוריה זו'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(faq => (
            <div key={faq.id}>
              {editId === faq.id ? (
                <FAQForm form={form} saving={saving}
                  onChange={(field, value) => setForm(f => ({ ...f, [field]: value }))}
                  onSave={handleSave} onCancel={() => setEditId(null)} />
              ) : (
                <div className={`bg-white rounded-xl border p-4 transition-all hover:shadow-sm ${faq.is_active ? 'border-gray-100' : 'border-gray-200 opacity-60'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[faq.category].bg} ${CATEGORY_COLORS[faq.category].text}`}>
                          {faq.category}
                        </span>
                        {!faq.is_active && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">מושבת</span>
                        )}
                      </div>
                      <p className="font-semibold text-sm text-[#3d2b1f] mb-1">{faq.question}</p>
                      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line line-clamp-3">
                        {faq.answer.replace(/\*([^*]+)\*/g, '$1')}
                      </p>
                      {faq.keywords && (
                        <p className="text-xs text-gray-400 mt-2">
                          🔎 <span className="font-medium">מילות מפתח:</span> {faq.keywords}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleToggle(faq)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                        title={faq.is_active ? 'השבת' : 'הפעל'}>
                        {faq.is_active
                          ? <ToggleRight size={20} className="text-[#297058]" />
                          : <ToggleLeft size={20} className="text-gray-400" />}
                      </button>
                      <button onClick={() => openEdit(faq)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#297058] transition-colors"
                        title="עריכה">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(faq.id, faq.question)}
                        className="p-1.5 rounded-lg hover:bg-[#FCEAEA] text-gray-400 hover:text-[#EF4444] transition-colors"
                        title="מחיקה">
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
