'use client'

import { useState } from 'react'
import { Users, Settings, ChevronLeft } from 'lucide-react'
import { CapacitySettings } from '@/components/admin/CapacitySettings'
import Link from 'next/link'

type AdminSection = 'capacity'
// עתידי: | 'bot-texts' | 'hours' | 'general' | 'payments' ...

interface SectionDef {
  id: AdminSection
  label: string
  icon: React.ReactNode
  description: string
  component: React.ReactNode
}

export default function AdminPage() {
  const [activeSection, setActiveSection] = useState<AdminSection>('capacity')

  // SECTIONS מוגדר בתוך הפונקציה כדי למנוע כשל קומפילציה של RSC
  const SECTIONS: SectionDef[] = [
    {
      id: 'capacity',
      label: 'קיבולת אזורים',
      icon: <Users size={18} />,
      description: 'כמה ילדים ניתן לרשום לכל אזור',
      component: <CapacitySettings />,
    },
    // עתידי — פשוט להוסיף כאן
    // { id: 'bot-texts', label: 'טקסטים לבוט', icon: <Bot size={18} />, description: 'עריכת כל הודעות הבוט', component: <BotTexts /> },
    // { id: 'hours',     label: 'שעות פעילות',  icon: <Clock size={18} />, description: 'ימים ושעות פתוחים',   component: <BusinessHours /> },
    // { id: 'general',   label: 'כללי',          icon: <Settings size={18} />, description: 'שם, לוגו, מייל',  component: <GeneralSettings /> },
  ]

  const current = SECTIONS.find(s => s.id === activeSection)!

  return (
    <div className="min-h-screen bg-[#fdf6ef]" dir="rtl">

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings size={20} className="text-[#5c3d2e]" />
            <span className="font-bold text-[#3d2b1f] text-lg">פאנל ניהול</span>
            <span className="text-gray-300 mx-1">|</span>
            <span className="text-[#5c3d2e] font-semibold text-sm">🌟 Kids &amp; Fun</span>
          </div>
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#5c3d2e] transition-colors"
          >
            <ChevronLeft size={16} />
            חזרה לדשבורד
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 flex gap-6">

        {/* Sidebar */}
        <aside className="w-56 shrink-0">
          <nav className="bg-white rounded-2xl shadow-sm p-2 space-y-1">
            {SECTIONS.map(section => {
              const isActive = activeSection === section.id
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-right ${
                    isActive
                      ? 'bg-[#5c3d2e] text-white'
                      : 'text-[#3d2b1f] hover:bg-[#f5e6d8]'
                  }`}
                >
                  <span className={isActive ? 'text-white' : 'text-[#5c3d2e]'}>
                    {section.icon}
                  </span>
                  <div className="text-right">
                    <div>{section.label}</div>
                    <div className={`text-xs font-normal mt-0.5 ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                      {section.description}
                    </div>
                  </div>
                </button>
              )
            })}

            {/* placeholders לסעיפים עתידיים */}
            <div className="pt-2 border-t border-[#f0e0d0]">
              {['טקסטים לבוט', 'שעות פעילות', 'הגדרות כלליות'].map(label => (
                <div key={label}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-gray-300 cursor-not-allowed">
                  <div className="w-4 h-4 rounded bg-gray-100" />
                  <div>
                    <div>{label}</div>
                    <div className="text-xs mt-0.5">בקרוב</div>
                  </div>
                </div>
              ))}
            </div>
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {current.component}
        </main>

      </div>
    </div>
  )
}
