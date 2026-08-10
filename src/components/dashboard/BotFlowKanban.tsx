'use client'

// ─── קנבן מסלולי הבוט ─────────────────────────────────────────────────────────
// תצוגת עמודות: עמודה = מסלול (בסדר הכרונולוגי של תפריט הבוט), כרטיס = שלב
// בשיחה עם ההודעה האמיתית של הבוט. פילטר לפי מסלול. הנתונים ב-content-map.ts
// (נוצרים מהקוד האמיתי ב-flows.ts — זה מה שהבוט באמת שולח).

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { BOT_FLOW_MAP, type BotFlow, type BotFlowStep } from '@/lib/bot/content-map'

const MODE_STYLE: Record<BotFlowStep['mode'], { label: string; bg: string; color: string; border: string }> = {
  'FP':    { label: 'אוטומטי (מסלול)', bg: '#E1F5EE', color: '#0F6E56', border: '#1D9E75' },
  'LLM':   { label: 'AI חכם',          bg: '#EEEDFE', color: '#3C3489', border: '#7F77DD' },
  'ידני':  { label: 'ידני / נציגה',    bg: '#FAEEDA', color: '#854F0B', border: '#EF9F27' },
}

function StepCard({ step }: { step: BotFlowStep }) {
  const [expanded, setExpanded] = useState(false)
  const mode = MODE_STYLE[step.mode]
  const long = step.botMessage.length > 220

  return (
    <div
      className="rounded-xl bg-white border p-3 text-sm"
      style={{ borderColor: 'var(--crm-border)', borderRightWidth: 4, borderRightColor: mode.border }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="font-bold" style={{ color: 'var(--crm-primary-deep)' }}>
          {step.order}. {step.title}
        </span>
        <span className="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: mode.bg, color: mode.color }}>
          {mode.label}
        </span>
      </div>

      {step.userInput && (
        <div className="text-xs mb-1.5" style={{ color: '#1565C0' }}>
          👤 ההורה: {step.userInput}
        </div>
      )}

      <div
        className="rounded-lg px-3 py-2 text-[13px] whitespace-pre-line leading-relaxed"
        style={{ background: '#E7F6E7', color: '#2c3e2d' }}
      >
        🤖 {long && !expanded ? step.botMessage.slice(0, 220) + '…' : step.botMessage}
      </div>
      {long && (
        <button onClick={() => setExpanded(e => !e)} className="text-xs mt-1 underline" style={{ color: 'var(--crm-primary)' }}>
          {expanded ? 'צמצום' : 'להודעה המלאה'}
        </button>
      )}

      {(step.branches || step.sideEffects) && (
        <div className="mt-1.5 text-[11.5px] space-y-0.5" style={{ color: 'var(--crm-text)', opacity: 0.75 }}>
          {step.branches && <div>🔀 {step.branches}</div>}
          {step.sideEffects && <div>⚙️ {step.sideEffects}</div>}
        </div>
      )}
    </div>
  )
}

export function BotFlowKanban() {
  const [flowFilter, setFlowFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const flows = useMemo(() => {
    let list: BotFlow[] = BOT_FLOW_MAP
    if (flowFilter !== 'all') list = list.filter(f => f.flowId === flowFilter)
    if (search.trim()) {
      const q = search.trim()
      list = list
        .map(f => ({ ...f, steps: f.steps.filter(s => s.botMessage.includes(q) || s.title.includes(q) || (s.userInput ?? '').includes(q)) }))
        .filter(f => f.steps.length > 0)
    }
    return list
  }, [flowFilter, search])

  return (
    <div>
      {/* פילטרים */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setFlowFilter('all')}
          className="px-3 py-1.5 rounded-full text-xs font-semibold"
          style={flowFilter === 'all'
            ? { background: 'var(--crm-primary)', color: '#fff' }
            : { background: '#fff', border: '1px solid var(--crm-border)', color: 'var(--crm-text)' }}
        >
          כל המסלולים ({BOT_FLOW_MAP.length})
        </button>
        {BOT_FLOW_MAP.map(f => (
          <button
            key={f.flowId}
            onClick={() => setFlowFilter(flowFilter === f.flowId ? 'all' : f.flowId)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold"
            style={flowFilter === f.flowId
              ? { background: 'var(--crm-primary)', color: '#fff' }
              : { background: '#fff', border: '1px solid var(--crm-border)', color: 'var(--crm-text)' }}
          >
            {f.emoji} {f.title}
          </button>
        ))}
        <div className="relative mr-auto">
          <Search size={14} className="absolute right-2.5 top-2.5 opacity-40" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש בהודעות..."
            className="pr-8 pl-3 py-1.5 rounded-full text-xs border w-44"
            style={{ borderColor: 'var(--crm-border)' }}
          />
        </div>
      </div>

      {/* מקרא */}
      <div className="flex gap-2 mb-4 text-[11px]" style={{ color: 'var(--crm-text)' }}>
        {Object.values(MODE_STYLE).map(m => (
          <span key={m.label} className="px-2 py-0.5 rounded-full" style={{ background: m.bg, color: m.color }}>{m.label}</span>
        ))}
        <span className="px-2 py-0.5" style={{ opacity: 0.6 }}>👤 = מה ההורה כותב · 🤖 = תגובת הבוט</span>
      </div>

      {/* עמודות קנבן */}
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: 'thin' }}>
        {flows.map(flow => (
          <div key={flow.flowId} className="flex-shrink-0 w-[340px]">
            <div className="rounded-t-2xl px-4 py-3" style={{ background: 'var(--crm-primary)', color: '#fff' }}>
              <div className="font-bold">{flow.emoji} {flow.title}</div>
              <div className="text-[11.5px] opacity-85 mt-0.5">{flow.entry}</div>
              <div className="text-[11px] opacity-70 mt-0.5">{flow.steps.length} שלבים</div>
            </div>
            <div className="rounded-b-2xl p-3 space-y-3" style={{ background: 'var(--crm-surface-soft)', minHeight: 120 }}>
              {flow.steps.map(step => <StepCard key={`${flow.flowId}-${step.order}`} step={step} />)}
            </div>
          </div>
        ))}
        {flows.length === 0 && (
          <div className="text-sm py-10 px-4" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>לא נמצאו תוצאות 🔍</div>
        )}
      </div>
    </div>
  )
}
