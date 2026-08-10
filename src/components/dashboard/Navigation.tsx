'use client'

import { useState } from 'react'
import { LayoutDashboard, Users, ClipboardList, ClipboardCheck, Bot, FileText, Link2, Building2, HelpCircle, Settings, Search, Archive, Menu, X } from 'lucide-react'
import Link from 'next/link'

type ActiveTab = 'overview' | 'parents' | 'tasks' | 'registrations' | 'attendance' | 'bot' | 'assets' | 'suppliers' | 'archive'

interface NavLink {
  id: ActiveTab
  label: string
  icon: React.ReactNode
}

interface Props {
  activeTab: ActiveTab
  onTabChange: (tab: ActiveTab) => void
  onSearchOpen?: () => void
}

const navLinks: NavLink[] = [
  { id: 'overview',     label: 'סקירה',           icon: <LayoutDashboard size={18} /> },
  { id: 'parents',      label: 'הורים',            icon: <Users size={18} /> },
  { id: 'registrations',label: 'רישומים',          icon: <FileText size={18} /> },
  { id: 'attendance',   label: 'נוכחות',           icon: <ClipboardCheck size={18} /> },
  { id: 'tasks',        label: 'פניות',            icon: <ClipboardList size={18} /> },
  { id: 'suppliers',    label: 'ספקים',            icon: <Building2 size={18} /> },
  { id: 'archive',      label: 'ארכיון',           icon: <Archive size={18} /> },
  { id: 'bot',          label: 'תוכן הבוט',        icon: <Bot size={18} /> },
  { id: 'assets',       label: 'קבצים וקישורים',   icon: <Link2 size={18} /> },
]

const externalLinks = [
  // ?from=app — מסמן שהגענו מהאפליקציה → כפתור "חזרה" יוצג (להורים מוואטסאפ אין פרמטר → אין כפתור)
  { href: '/register?from=app', icon: <ClipboardList size={16} />, label: 'שאלון רישום', external: true },
  { href: '/faq?from=app',      icon: <HelpCircle size={16} />,    label: 'שאלות ותשובות', external: true },
  { href: '/admin',             icon: <Settings size={16} />,      label: 'פאנל ניהול', external: false },
]

export function Navigation({ activeTab, onTabChange, onSearchOpen }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const today = new Date().toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  function handleTab(tab: ActiveTab) {
    onTabChange(tab)
    setMobileOpen(false)
  }

  return (
    <header
      className="sticky top-0 z-50 bg-crm-surface border-b border-crm-border"
      dir="rtl"
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between h-16 gap-4">

        {/* Right: Logo */}
        <div className="flex-shrink-0">
          <span
            className="text-2xl lg:text-3xl font-bold leading-none tracking-wide text-crm-primary"
            style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif' }}
          >
            🌟 Kids &amp; Fun
          </span>
        </div>

        {/* Center: Nav links — desktop only (xl+, where 9 tabs fit) */}
        <nav className="hidden xl:flex items-center gap-1 flex-1 justify-center">
          {navLinks.map(link => {
            const isActive = activeTab === link.id
            return (
              <button
                key={link.id}
                onClick={() => onTabChange(link.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all"
                style={
                  isActive
                    ? { background: 'var(--crm-action)', color: 'var(--crm-text)' }
                    : { color: 'var(--crm-text)', opacity: link.id === 'archive' ? 0.45 : 0.7 }
                }
              >
                {link.icon}
                <span>{link.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Left: Search + external links (icon-only) + date — desktop only */}
        <div className="hidden xl:flex flex-shrink-0 items-center gap-1">
          {onSearchOpen && (
            <button
              onClick={onSearchOpen}
              className="p-2 rounded-full transition-all hover:bg-crm-surface-soft text-crm-text-muted"
              title="חיפוש גלובאלי (Ctrl+K)"
              aria-label="חיפוש"
            >
              <Search size={18} />
            </button>
          )}
          {externalLinks.map(l => (
            <Link
              key={l.href}
              href={l.href}
              {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="p-2 rounded-full transition-all hover:bg-crm-surface-soft text-crm-text-muted"
              title={l.label}
              aria-label={l.label}
            >
              {l.icon}
            </Link>
          ))}
          <div className="hidden 2xl:block text-sm text-crm-text-muted text-right pr-2">{today}</div>
        </div>

        {/* Mobile/tablet: search + hamburger (shown below xl) */}
        <div className="flex xl:hidden items-center gap-1">
          {onSearchOpen && (
            <button
              onClick={onSearchOpen}
              className="p-2.5 rounded-full text-crm-text-muted hover:bg-crm-surface-soft transition-colors"
              aria-label="חיפוש"
            >
              <Search size={20} />
            </button>
          )}
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="p-2.5 rounded-full text-crm-primary hover:bg-crm-surface-soft transition-colors"
            aria-label={mobileOpen ? 'סגירת תפריט' : 'פתיחת תפריט'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile/tablet dropdown panel */}
      {mobileOpen && (
        <div className="xl:hidden border-t border-crm-border bg-crm-surface" dir="rtl">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <nav className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {navLinks.map(link => {
                const isActive = activeTab === link.id
                return (
                  <button
                    key={link.id}
                    onClick={() => handleTab(link.id)}
                    className="flex items-center gap-2 px-4 py-3 rounded-2xl text-base font-medium transition-all text-right"
                    style={
                      isActive
                        ? { background: 'var(--crm-action)', color: 'var(--crm-text)' }
                        : { background: 'var(--crm-surface-soft)', color: 'var(--crm-text)', opacity: link.id === 'archive' ? 0.6 : 1 }
                    }
                  >
                    {link.icon}
                    <span>{link.label}</span>
                  </button>
                )
              })}
            </nav>

            <div className="mt-3 pt-3 border-t border-crm-border flex flex-col gap-1">
              {externalLinks.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 rounded-2xl text-base font-medium text-crm-text-muted hover:bg-crm-surface-soft transition-colors"
                >
                  {l.icon}
                  <span>{l.label}</span>
                </Link>
              ))}
              <div className="px-4 py-2 text-sm text-crm-text-muted">{today}</div>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
