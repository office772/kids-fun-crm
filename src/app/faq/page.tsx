'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Search, MessageCircle, ArrowRight } from 'lucide-react'
import type { FAQ, FAQCategory } from '@/lib/types'

const CATEGORIES: { id: FAQCategory | 'הכל'; label: string; emoji: string }[] = [
  { id: 'הכל',     label: 'הכל',        emoji: '📋' },
  { id: 'תשלומים', label: 'תשלומים',    emoji: '💰' },
  { id: 'לוז',     label: 'לוח זמנים',  emoji: '📅' },
  { id: 'קייטנה',  label: 'קייטנה',     emoji: '☀️' },
  { id: 'ביטול',   label: 'ביטול',      emoji: '📋' },
  { id: 'כללי',    label: 'כללי',       emoji: '❓' },
]

function formatAnswer(text: string) {
  // המרת *bold* ו-\n לתצוגה
  return text
    .split('\n')
    .map((line, i) => {
      const parts = line.split(/\*([^*]+)\*/)
      return (
        <p key={i} className={line.trim() === '' ? 'h-2' : 'mb-1'}>
          {parts.map((part, j) =>
            j % 2 === 1
              ? <strong key={j}>{part}</strong>
              : <span key={j}>{part}</span>
          )}
        </p>
      )
    })
}

export default function FAQPage() {
  const [faqs, setFaqs]           = useState<FAQ[]>([])
  const [loading, setLoading]     = useState(true)
  const [category, setCategory]   = useState<FAQCategory | 'הכל'>('הכל')
  const [search, setSearch]       = useState('')
  const [openId, setOpenId]       = useState<string | null>(null)
  const [fromApp, setFromApp]     = useState(false)   // הגענו מהאפליקציה → להציג "חזרה" (לא להורים)
  const router = useRouter()

  useEffect(() => {
    setFromApp(new URLSearchParams(window.location.search).get('from') === 'app')
    fetch('/api/faq')
      .then(r => r.json())
      .then((data: FAQ[]) => { setFaqs(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = faqs
    .filter(f => category === 'הכל' || f.category === category)
    .filter(f => {
      if (!search) return true
      const s = search.toLowerCase()
      return f.question.toLowerCase().includes(s) || f.answer.toLowerCase().includes(s)
    })

  return (
    <div className="min-h-screen bg-crm-bg" dir="rtl">

      {/* Header */}
      <header className="bg-crm-surface border-b border-crm-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="text-2xl">🌟</span>
          <div className="flex-1">
            <h1 className="font-bold text-crm-primary text-lg">שאלות ותשובות</h1>
            <p className="text-xs text-crm-text-muted">Kids &amp; Fun — צהרון וקייטנה</p>
          </div>
          {fromApp && (
            <button
              onClick={() => { if (window.history.length > 1) router.back(); else router.push('/dashboard') }}
              className="flex items-center gap-1 text-sm text-crm-text-muted hover:text-crm-primary transition-colors"
              aria-label="חזרה לאפליקציה"
            >
              <ArrowRight size={16} /> חזרה
            </button>
          )}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* חיפוש */}
        <div className="relative">
          <Search size={16} className="absolute right-3 top-3 text-crm-text-muted" />
          <input
            type="text"
            placeholder="חפשו שאלה..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pr-9 pl-4 py-2.5 rounded-crm border border-crm-border bg-crm-surface text-sm text-crm-text focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
          />
        </div>

        {/* קטגוריות */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                category === cat.id
                  ? 'bg-crm-primary text-white'
                  : 'bg-crm-surface text-crm-text border border-crm-border hover:bg-crm-surface-soft'
              }`}
            >
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>

        {/* תוצאות */}
        {loading ? (
          <div className="text-center py-12 text-crm-text-muted">טוען שאלות ותשובות...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-crm-text-muted">
            <p className="text-lg mb-2">לא נמצאו שאלות</p>
            <p className="text-sm">נסו לשנות את מונחי החיפוש</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(faq => (
              <div
                key={faq.id}
                className="bg-crm-surface rounded-crm shadow-crm border border-crm-border overflow-hidden"
              >
                <button
                  className="w-full px-4 py-4 flex items-center justify-between text-right hover:bg-crm-surface-soft transition-colors"
                  onClick={() => setOpenId(openId === faq.id ? null : faq.id)}
                >
                  <span className="font-medium text-crm-text text-sm leading-snug">
                    {faq.question}
                  </span>
                  <span className="shrink-0 mr-3 text-crm-primary">
                    {openId === faq.id
                      ? <ChevronUp size={18} />
                      : <ChevronDown size={18} />
                    }
                  </span>
                </button>

                {openId === faq.id && (
                  <div className="px-4 pb-4 border-t border-crm-border">
                    <div className="text-sm text-crm-text leading-relaxed pt-3">
                      {formatAnswer(faq.answer)}
                    </div>
                    <div className="mt-2">
                      <span className="inline-block bg-crm-surface-soft text-crm-primary text-xs px-2.5 py-0.5 rounded-full">
                        {faq.category}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* CTA לוואטסאפ */}
        <div className="bg-crm-surface-soft border border-crm-border rounded-crm-lg p-5 text-center">
          <p className="text-sm text-crm-primary font-bold mb-2">
            לא מצאתם תשובה? 💛
          </p>
          <p className="text-xs text-crm-text-muted mb-3">
            שלחו לנו הודעה בוואטסאפ ונציגה תענה בהקדם
          </p>
          <a
            href="https://wa.me/972500000000"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-crm-primary text-white px-5 py-2.5 rounded-crm text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <MessageCircle size={16} />
            צור קשר בוואטסאפ
          </a>
        </div>

      </div>
    </div>
  )
}
