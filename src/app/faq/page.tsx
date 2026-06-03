'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Search, MessageCircle } from 'lucide-react'
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

  useEffect(() => {
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
    <div className="min-h-screen bg-[#fdf6ef]" dir="rtl">

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="text-2xl">🌟</span>
          <div>
            <h1 className="font-bold text-[#3d2b1f] text-lg">שאלות ותשובות</h1>
            <p className="text-xs text-gray-500">Kids & Fun — צהרון וקייטנה</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* חיפוש */}
        <div className="relative">
          <Search size={16} className="absolute right-3 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="חפשו שאלה..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pr-9 pl-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#297058]/30"
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
                  ? 'bg-[#297058] text-white'
                  : 'bg-white text-[#297058] border border-[#297058]/30 hover:bg-[#E6F4EF]'
              }`}
            >
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>

        {/* תוצאות */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">טוען שאלות ותשובות...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg mb-2">לא נמצאו שאלות</p>
            <p className="text-sm">נסו לשנות את מונחי החיפוש</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(faq => (
              <div
                key={faq.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <button
                  className="w-full px-4 py-4 flex items-center justify-between text-right hover:bg-gray-50 transition-colors"
                  onClick={() => setOpenId(openId === faq.id ? null : faq.id)}
                >
                  <span className="font-medium text-[#3d2b1f] text-sm leading-snug">
                    {faq.question}
                  </span>
                  <span className="shrink-0 mr-3 text-[#297058]">
                    {openId === faq.id
                      ? <ChevronUp size={18} />
                      : <ChevronDown size={18} />
                    }
                  </span>
                </button>

                {openId === faq.id && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="text-sm text-gray-700 leading-relaxed pt-3">
                      {formatAnswer(faq.answer)}
                    </div>
                    <div className="mt-2">
                      <span className="inline-block bg-[#E6F4EF] text-[#297058] text-xs px-2 py-0.5 rounded-full">
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
        <div className="bg-[#E6F4EF] border border-[#297058]/20 rounded-2xl p-4 text-center">
          <p className="text-sm text-[#297058] font-medium mb-2">
            לא מצאתם תשובה? 💛
          </p>
          <p className="text-xs text-gray-600 mb-3">
            שלחו לנו הודעה בוואטסאפ ונציגה תענה בהקדם
          </p>
          <a
            href="https://wa.me/972500000000"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#297058] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#1f5543] transition-colors"
          >
            <MessageCircle size={16} />
            צור קשר בוואטסאפ
          </a>
        </div>

      </div>
    </div>
  )
}
