'use client'

import { LayoutDashboard, Users, ClipboardList, MessageSquare, Bot, FileText, Settings, Link2, HelpCircle } from 'lucide-react'
import Link from 'next/link'

type ActiveTab = 'overview' | 'parents' | 'tasks' | 'registrations' | 'simulator' | 'bot' | 'assets'

interface NavLink {
  id: ActiveTab
  label: string
  icon: React.ReactNode
}

interface Props {
  activeTab: ActiveTab
  onTabChange: (tab: ActiveTab) => void
}

const navLinks: NavLink[] = [
  { id: 'overview', label: 'סקירה', icon: <LayoutDashboard size={18} /> },
  { id: 'parents', label: 'הורים', icon: <Users size={18} /> },
  { id: 'registrations', label: 'רישומים', icon: <FileText size={18} /> },
  { id: 'tasks', label: 'פניות', icon: <ClipboardList size={18} /> },
  { id: 'simulator', label: 'סימולטור',        icon: <MessageSquare size={18} /> },
  { id: 'bot',       label: 'תוכן הבוט',       icon: <Bot size={18} /> },
  { id: 'assets',    label: 'קבצים וקישורים',  icon: <Link2 size={18} /> },
]

export function Navigation({ activeTab, onTabChange }: Props) {
  const today = new Date().toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <header
      className="sticky top-0 z-50 bg-white shadow-sm w-full"
      dir="rtl"
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16 gap-6">

        {/* Right: Logo */}
        <div className="flex-shrink-0">
          <span
            className="text-3xl font-bold leading-none tracking-wide"
            style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}
          >
            🌟 Kids &amp; Fun
          </span>
        </div>

        {/* Center: Nav links */}
        <nav className="flex items-center gap-1">
          {navLinks.map(link => {
            const isActive = activeTab === link.id
            return (
              <button
                key={link.id}
                onClick={() => onTabChange(link.id)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all"
                style={
                  isActive
                    ? { background: 'var(--crm-action)', color: 'var(--crm-text)' }
                    : { color: 'var(--crm-text)', opacity: 0.65 }
                }
              >
                {link.icon}
                <span>{link.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Left: Date + Admin link */}
        <div className="flex-shrink-0 flex items-center gap-4">
          <Link
            href="/faq"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all hover:bg-[#f5e6d8]"
            style={{ color: 'var(--crm-text)', opacity: 0.75 }}
          >
            <HelpCircle size={15} />
            <span className="hidden sm:inline">שאלות ותשובות</span>
          </Link>
          <Link
            href="/admin"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all hover:bg-[#f5e6d8]"
            style={{ color: 'var(--crm-text)', opacity: 0.75 }}
          >
            <Settings size={15} />
            <span className="hidden sm:inline">פאנל ניהול</span>
          </Link>
          <div
            className="text-sm text-right hidden sm:block"
            style={{ color: 'var(--crm-text)', opacity: 0.6 }}
          >
            {today}
          </div>
        </div>
      </div>
    </header>
  )
}
