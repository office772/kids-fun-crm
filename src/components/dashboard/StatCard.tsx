'use client'

import React from 'react'

// ─── כרטיס סטטיסטיקה אחיד לכל המודולים ─────────────────────────────────────
// עיצוב אחד: כרטיס לבן עם קונטור רך + אייקון בריבוע צבעוני + מספר גדול + תווית.
// אייקונים מ-lucide (לא אימוג'ים). הצבע מגיע מ-accent בלבד → אחידות מלאה.

type Accent = 'primary' | 'accent' | 'action' | 'success' | 'danger' | 'neutral'

const ACCENT: Record<Accent, { bg: string; fg: string }> = {
  primary: { bg: 'var(--crm-primary)',      fg: '#ffffff' },
  accent:  { bg: 'var(--crm-accent)',       fg: '#ffffff' },
  action:  { bg: 'var(--crm-action)',       fg: 'var(--crm-text)' },
  success: { bg: 'var(--crm-success)',      fg: '#ffffff' },
  danger:  { bg: 'var(--crm-danger)',       fg: '#ffffff' },
  neutral: { bg: 'var(--crm-surface-soft)', fg: 'var(--crm-primary)' },
}

interface Props {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  accent?: Accent
  onClick?: () => void   // אם מסופק — הכרטיס לחיץ (ניווט/סינון לנתונים שהוא סופר)
}

export function StatCard({ icon, label, value, accent = 'primary', onClick }: Props) {
  const a = ACCENT[accent]
  const inner = (
    <>
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4"
        style={{ backgroundColor: a.bg, color: a.fg }}
      >
        {icon}
      </div>
      <div className="text-3xl font-bold mb-1 text-crm-text">{value}</div>
      <div className="text-sm font-medium text-crm-text-muted">{label}</div>
    </>
  )

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="w-full text-right bg-crm-surface rounded-crm border border-crm-border p-5 shadow-crm transition-all hover:shadow-crm-lg hover:-translate-y-0.5 hover:border-crm-primary/40 focus:outline-none focus:ring-2 focus:ring-crm-primary/30 cursor-pointer"
      >
        {inner}
      </button>
    )
  }

  return (
    <div className="bg-crm-surface rounded-crm border border-crm-border p-5 shadow-crm hover:shadow-crm-lg transition-shadow">
      {inner}
    </div>
  )
}
