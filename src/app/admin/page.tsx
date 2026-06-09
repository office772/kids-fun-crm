'use client'

import { useState, useEffect, useRef } from 'react'
import { Users, Settings, ChevronLeft, RefreshCw, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { CapacitySettings } from '@/components/admin/CapacitySettings'
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
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-[#3d2b1f] text-sm">{label}</span>
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

type AdminSection = 'capacity' | 'sync'
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
    {
      id: 'sync',
      label: 'סנכרון נתונים',
      icon: <RefreshCw size={18} />,
      description: 'ייבוא הורים ותשלומים מPayPlus וחשבונית ירוקה',
      component: (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-[#3d2b1f] mb-1">סנכרון נתונים חיצוניים</h3>
            <p className="text-xs text-gray-500 mb-4">
              מייבא הורים ותשלומים ממערכות חיצוניות לתוך ה-CRM. קריאה בלבד — לא משנה כלום אצל הספקים.
            </p>
          </div>
          <SyncButton
            label="📥 ייבוא מחשבונית ירוקה (קישורי תשלום)"
            endpoint="/api/sync/greeninvoice"
            color="#5c3d2e"
          />

          {/* PayPlus — אין סנכרון ידני: PayPlus חוסם קריאות שרת. הכל אוטומטי דרך webhook */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[#3d2b1f] text-sm">💳 PayPlus (הוראות קבע + כרטיסי אשראי)</span>
              <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-green-50 text-green-700">
                ✓ אוטומטי
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
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
