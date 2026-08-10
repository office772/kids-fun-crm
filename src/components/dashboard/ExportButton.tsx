'use client'

import { Download } from 'lucide-react'

// כפתור ייצוא דוח ל-Excel. מצביע ל-/api/export?type=... שמחזיר קובץ .xlsx.
export function ExportButton({ type, label }: { type: string; label: string }) {
  return (
    <a
      href={`/api/export?type=${type}`}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors hover:opacity-80"
      style={{ background: '#fff', color: 'var(--crm-primary)', border: '1px solid var(--crm-primary)' }}
    >
      <Download size={16} />
      {label}
    </a>
  )
}
