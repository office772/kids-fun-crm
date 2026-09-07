'use client'

import { useState, useEffect, useRef } from 'react'
import { Users, Settings, ChevronLeft, RefreshCw, CheckCircle, AlertCircle, Info, UsersRound, MessageSquare, BookOpen, Building2 } from 'lucide-react'
import { CapacitySettings } from '@/components/admin/CapacitySettings'
import { SchoolCapacitySettings } from '@/components/admin/SchoolCapacitySettings'
import { FrameworkStaffManager } from '@/components/dashboard/FrameworkStaffManager'
import { BotSimulator, TesterReset } from '@/components/dashboard/BotSimulator'
import { TestPhonesManager } from '@/components/dashboard/TestPhonesManager'
import { HelpGuide } from '@/components/admin/HelpGuide'
import Link from 'next/link'

const SYNC_TIMEOUT_MS = 90_000 // לא להשאיר את הכפתור תקוע על "מסנכרן..." לנצח

// ─── כפתור סנכרון ────────────────────────────────────────────────────────────
function SyncButton({ label, endpoint, color }: { label: string; endpoint: string; color: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error' | 'info'>('idle')
  const [result, setResult] = useState<string>('')
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // מונה שניות בזמן סנכרון — נותן feedback שמשהו קורה
  useEffect(() => {
    if (state === 'loading') {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [state])

  async function handleSync() {
    setState('loading')
    setResult('')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS)

    try {
      const res  = await fetch(endpoint, { method: 'POST', signal: controller.signal })
      const data = await res.json()
      if (data.success || data.message) {
        const s = data.stats
        const hasStats = s && (s.parents_created || s.parents_updated || s.payments_created || s.payments_skipped)
        if (data.blocked) {
          setResult(String(data.message))
          setState('info')
        } else {
          setResult(hasStats
            ? `הורים חדשים: ${s.parents_created} | עדכונים: ${s.parents_updated} | תשלומים: ${s.payments_created} | דולגו: ${s.payments_skipped}`
            : String(data.message ?? 'הושלם'))
          setState('done')
        }
      } else {
        setResult(data.error ?? 'שגיאה לא ידועה')
        setState('error')
      }
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      setResult(aborted
        ? `הסנכרון לקח יותר מ-${SYNC_TIMEOUT_MS / 1000} שניות והופסק. ייתכן שהוא עדיין רץ ברקע — רענן את הרשימה בעוד דקה.`
        : String(e))
      setState('error')
    } finally {
      clearTimeout(timeout)
    }
  }

  const boxStyle =
    state === 'done' ? 'bg-green-50 text-green-700'
    : state === 'info' ? 'bg-blue-50 text-blue-700'
    : 'bg-red-50 text-red-700'

  return (
    <div className="bg-white rounded-xl border border-crm-border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-crm-text text-sm">{label}</span>
        <button
          onClick={handleSync}
          disabled={state === 'loading'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors"
          style={{ background: color }}
        >
          <RefreshCw size={14} className={state === 'loading' ? 'animate-spin' : ''} />
          {state === 'loading' ? `מסנכרן... ${elapsed}s` : 'סנכרן עכשיו'}
        </button>
      </div>
      {result && (
        <div className={`text-xs px-3 py-2 rounded-lg flex items-start gap-1.5 ${boxStyle}`}>
          {state === 'done'
            ? <CheckCircle size={12} className="mt-0.5 shrink-0" />
            : state === 'info'
              ? <Info size={12} className="mt-0.5 shrink-0" />
              : <AlertCircle size={12} className="mt-0.5 shrink-0" />}
          {result}
        </div>
      )}
    </div>
  )
}

type AdminSection = 'guide' | 'capacity' | 'school-capacity' | 'sync' | 'staff-tzaharon' | 'staff-kaytana' | 'simulator'
// עתידי: | 'bot-texts' | 'hours' | 'general' | 'payments' ...

interface SectionDef {
  id: AdminSection
  label: string
  icon: React.ReactNode
  description: string
  component: React.ReactNode
}

export default function AdminPage() {
  const [activeSection, setActiveSection] = useState<AdminSection>('guide')

  // SECTIONS מוגדר בתוך הפונקציה כדי למנוע כשל קומפילציה של RSC
  const SECTIONS: SectionDef[] = [
    {
      id: 'guide',
      label: 'מדריך שימוש',
      icon: <BookOpen size={18} />,
      description: 'מדריך מלא למערכת ולמסלולי הבוט',
      component: <HelpGuide />,
    },
    {
      id: 'capacity',
      label: 'קיבולת אזורים',
      icon: <Users size={18} />,
      description: 'כמה ילדים ניתן לרשום לכל אזור',
      component: <CapacitySettings />,
    },
    {
      id: 'school-capacity',
      label: 'קיבולת לפי מסגרת',
      icon: <Building2 size={18} />,
      description: 'מקסימום נרשמים לכל בי"ס/גן',
      component: <SchoolCapacitySettings />,
    },
    {
      id: 'staff-tzaharon',
      label: 'צוותי צהרון',
      icon: <UsersRound size={18} />,
      description: 'רכזות וצוות לבתי"ס/גנים (צהרון)',
      component: <FrameworkStaffManager typeFilter="צהרון" />,
    },
    {
      id: 'staff-kaytana',
      label: 'צוותי קייטנה',
      icon: <UsersRound size={18} />,
      description: 'צוות לקייטנות',
      component: <FrameworkStaffManager typeFilter="קייטנה" />,
    },
    {
      id: 'simulator',
      label: 'סימולטור בוט',
      icon: <MessageSquare size={18} />,
      description: 'בדיקת הבוט לפני/אחרי חיבור WhatsApp',
      component: (
        <div className="space-y-6">
          <div>
            <h3 className="font-bold text-lg" style={{ color: 'var(--crm-primary)' }}>סימולטור בוט</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--crm-text-muted)' }}>בדקי את הבוט בסביבה בטוחה — בדיוק כמו בוואטסאפ.</p>
          </div>
          <div className="bg-crm-surface rounded-crm border border-crm-border p-4 md:p-6">
            <BotSimulator />
          </div>
          <TestPhonesManager />
          <TesterReset />
        </div>
      ),
    },
    {
      id: 'sync',
      label: 'סנכרון נתונים',
      icon: <RefreshCw size={18} />,
      description: 'ייבוא הורים ותשלומים מPayPlus וחשבונית ירוקה',
      component: (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-crm-text mb-1">סנכרון נתונים חיצוניים</h3>
            <p className="text-xs text-crm-text-muted mb-4">
              מייבא הורים ותשלומים ממערכות חיצוניות לתוך ה-CRM. קריאה בלבד — לא משנה כלום אצל הספקים.
            </p>
          </div>
          <SyncButton
            label="📥 ייבוא מחשבונית ירוקה (קישורי תשלום)"
            endpoint="/api/sync/greeninvoice"
            color="#5c3d2e"
          />

          {/* PayPlus — אין סנכרון ידני: PayPlus חוסם קריאות שרת. הכל אוטומטי דרך webhook */}
          <div className="bg-white rounded-xl border border-crm-border p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-crm-text text-sm">💳 PayPlus (הוראות קבע + כרטיסי אשראי)</span>
              <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-green-50 text-green-700">
                ✓ אוטומטי
              </span>
            </div>
            <p className="text-xs text-crm-text-muted mt-2 leading-relaxed">
              אין צורך בסנכרון ידני. PayPlus חוסם קריאות מהשרת, אבל כל תשלום חדש —
              כולל כשלי חיוב והוראות קבע — נכנס אוטומטית בזמן אמת דרך webhook.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
            💡 נתונים חדשים מ-PayPlus ומחשבונית ירוקה מגיעים אוטומטית דרך webhook בזמן אמת.
            הכפתור למעלה הוא רק לייבוא היסטורי חד-פעמי מחשבונית ירוקה.
          </div>
        </div>
      ),
    },
    // עתידי — פשוט להוסיף כאן
    // { id: 'bot-texts', label: 'טקסטים לבוט', icon: <Bot size={18} />, description: 'עריכת כל הודעות הבוט', component: <BotTexts /> },
    // { id: 'hours',     label: 'שעות פעילות',  icon: <Clock size={18} />, description: 'ימים ושעות פתוחים',   component: <BusinessHours /> },
    // { id: 'general',   label: 'כללי',          icon: <Settings size={18} />, description: 'שם, לוגו, מייל',  component: <GeneralSettings /> },
  ]

  const current = SECTIONS.find(s => s.id === activeSection)!

  return (
    <div className="min-h-screen bg-crm-bg" dir="rtl">

      {/* Header */}
      <header className="bg-crm-surface border-b border-crm-border sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <Settings size={20} className="text-crm-primary shrink-0" />
            <span className="font-bold text-crm-text text-lg">פאנל ניהול</span>
            <span className="text-crm-text-muted mx-1 hidden sm:inline">|</span>
            <span className="text-crm-primary font-semibold text-sm hidden sm:inline">🌟 Kids &amp; Fun</span>
          </div>
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-sm text-crm-text-muted hover:text-crm-primary transition-colors"
          >
            <ChevronLeft size={16} />
            חזרה לדשבורד
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 flex flex-col md:flex-row gap-4 md:gap-6">

        {/* Sidebar — שורת לשוניות אופקית במובייל, אנכית בדסקטופ */}
        <aside className="w-full md:w-56 md:shrink-0">
          <nav className="bg-crm-surface rounded-2xl border border-crm-border p-2 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
            {SECTIONS.map(section => {
              const isActive = activeSection === section.id
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex-shrink-0 md:w-full flex items-center md:items-start gap-3 px-4 py-2.5 md:py-3 rounded-xl text-sm font-medium transition-all text-right whitespace-nowrap md:whitespace-normal ${
                    isActive
                      ? 'bg-crm-primary text-white'
                      : 'text-crm-text hover:bg-crm-surface-soft'
                  }`}
                >
                  <span className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-crm-primary'}`}>
                    {section.icon}
                  </span>
                  <div className="text-right min-w-0">
                    <div>{section.label}</div>
                    <div className={`hidden md:block text-xs font-normal mt-0.5 ${isActive ? 'text-white/70' : 'text-crm-text-muted'}`}>
                      {section.description}
                    </div>
                  </div>
                </button>
              )
            })}

            {/* placeholders לסעיפים עתידיים — דסקטופ בלבד */}
            <div className="hidden md:block pt-2 border-t border-crm-border">
              {['טקסטים לבוט', 'שעות פעילות', 'הגדרות כלליות'].map(label => (
                <div key={label}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-crm-text-muted cursor-not-allowed">
                  <div className="w-4 h-4 rounded bg-crm-surface-soft" />
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
