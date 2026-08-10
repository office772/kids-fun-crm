'use client'

import { useState, useEffect, useCallback } from 'react'
import { HelpCircle, X, List, Play, ChevronLeft, ChevronRight, Zap } from 'lucide-react'
import TUTORIAL_STEPS from '@/lib/tutorialSteps'

const STORAGE_KEY = 'kf_tutorial_seen_v1'

// onGoToTab — מאפשר למדריך לקפוץ ללשונית הרלוונטית בכל שלב (דשבורד מבוסס-טאבים)
export function Tutorial({ onGoToTab }: { onGoToTab?: (tab: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [practicing, setPracticing] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const total = TUTORIAL_STEPS.length
  const step = TUTORIAL_STEPS[currentStep]

  // פתיחה אוטומטית בביקור ראשון
  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const t = setTimeout(() => setIsOpen(true), 800)
        return () => clearTimeout(t)
      }
    } catch { /* private mode */ }
  }, [])

  // קפיצה ללשונית של השלב הנוכחי (כשלא במצב תרגול)
  useEffect(() => {
    if (isOpen && !practicing && step?.tab && onGoToTab) onGoToTab(step.tab)
  }, [isOpen, practicing, currentStep, step, onGoToTab])

  const markSeen = () => { try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ } }
  const start = useCallback(() => { setCurrentStep(0); setPracticing(false); setIsOpen(true) }, [])
  const close = useCallback(() => { setIsOpen(false); setPracticing(false); setShowMenu(false); markSeen() }, [])
  const next = useCallback(() => {
    setShowMenu(false)
    if (currentStep < total - 1) { setCurrentStep(s => s + 1); setPracticing(false) }
    else close()
  }, [currentStep, total, close])
  const prev = useCallback(() => { setShowMenu(false); if (currentStep > 0) { setCurrentStep(s => s - 1); setPracticing(false) } }, [currentStep])

  const isFirst = currentStep === 0
  const isLast = currentStep === total - 1
  const Icon = step.icon

  // כפתור צף תמידי
  const fab = (
    <button
      onClick={start}
      className="fixed bottom-6 left-6 z-[9990] w-12 h-12 rounded-full shadow-crm-lg flex items-center justify-center text-white hover:scale-110 transition-transform"
      style={{ backgroundColor: 'var(--crm-primary)' }}
      title="מדריך אינטראקטיבי"
      aria-label="מדריך אינטראקטיבי"
    >
      <HelpCircle className="w-6 h-6" />
    </button>
  )

  if (!isOpen) return fab

  // מצב תרגול — כפתור חזרה צף, בלי כיסוי המסך
  if (practicing) {
    return (
      <button
        onClick={() => setPracticing(false)}
        dir="rtl"
        className="fixed bottom-6 left-6 z-[10001] flex items-center gap-2 px-4 py-3 rounded-full shadow-crm-lg text-white hover:opacity-90 transition-opacity"
        style={{ backgroundColor: 'var(--crm-primary)' }}
      >
        <Play className="w-4 h-4" />
        <span className="text-sm font-medium">חזרה למדריך</span>
      </button>
    )
  }

  return (
    <>
      {fab}
      {/* Dark overlay */}
      <div className="fixed inset-0 z-[10000] bg-black/50" onClick={close} />

      {/* Centered card */}
      <div className="fixed inset-0 z-[10001] flex items-center justify-center pointer-events-none p-4" dir="rtl">
        <div
          className="pointer-events-auto bg-crm-surface border border-crm-border rounded-crm-lg shadow-crm-lg p-5 w-[400px] max-w-[92vw]"
          style={{ animation: 'kfTutIn .2s ease-out' }}
        >
          <style>{`@keyframes kfTutIn{from{opacity:0;transform:scale(.95) translateY(10px)}to{opacity:1;transform:none}}`}</style>

          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-xl flex-shrink-0" style={{ background: 'var(--crm-surface-soft)' }}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-crm-text-muted">שלב {currentStep + 1} מתוך {total}</p>
                <h3 className="font-bold text-sm leading-tight" style={{ color: 'var(--crm-primary)' }}>{step.title}</h3>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => setShowMenu(m => !m)} title="כל השלבים"
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-crm-surface-soft text-crm-text-muted">
                <List className="w-4 h-4" />
              </button>
              <button onClick={close} aria-label="סגירה"
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-crm-surface-soft text-crm-text-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Step menu */}
          {showMenu && (
            <div className="mb-3 bg-crm-surface rounded-xl border border-crm-border max-h-[240px] overflow-y-auto">
              {TUTORIAL_STEPS.map((s, i) => (
                <button key={s.id} onClick={() => { setCurrentStep(i); setPracticing(false); setShowMenu(false) }}
                  className="w-full text-right px-3 py-2 text-xs hover:bg-crm-surface-soft flex items-center gap-2"
                  style={i === currentStep ? { background: 'var(--crm-surface-soft)', color: 'var(--crm-primary)', fontWeight: 700 } : { color: 'var(--crm-text)' }}>
                  <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                    style={i === currentStep ? { background: 'var(--crm-primary)', color: '#fff' } : { background: 'var(--crm-surface-soft)', border: '1px solid var(--crm-border)', color: 'var(--crm-text-muted)' }}>
                    {i < currentStep ? '✓' : i + 1}
                  </span>
                  <span className="truncate">{s.title}</span>
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="mb-3 rounded-xl p-3" style={{ background: 'var(--crm-surface-soft)' }}>
            <p className="text-sm leading-relaxed whitespace-pre-line text-crm-text">{step.content}</p>
          </div>

          {step.autoNote && (
            <div className="mb-2 flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--crm-warning-bg)', border: '1px solid var(--crm-action)' }}>
              <Zap className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--crm-warning)' }} />
              <p className="text-xs text-crm-text">{step.autoNote}</p>
            </div>
          )}
          {step.tip && (
            <div className="mb-3 p-2.5 rounded-lg" style={{ background: 'var(--crm-surface-soft)', border: '1px solid var(--crm-border)' }}>
              <p className="text-xs text-crm-text">💡 {step.tip}</p>
            </div>
          )}

          {/* Progress */}
          <div className="flex gap-1 mb-3">
            {Array.from({ length: total }, (_, i) => (
              <div key={i} className="h-1.5 rounded-full flex-1 transition-all"
                style={{ background: i <= currentStep ? 'var(--crm-primary)' : 'var(--crm-border)' }} />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {step.tab && (
              <button onClick={() => { if (step.tab && onGoToTab) onGoToTab(step.tab); setPracticing(true) }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full transition-colors hover:opacity-80"
                style={{ color: 'var(--crm-primary)', background: 'var(--crm-surface-soft)' }}>
                <Play className="w-3 h-3" /> תרגלי
              </button>
            )}
            <div className="flex-1" />
            {!isFirst && (
              <button onClick={prev} className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors hover:bg-crm-surface-soft text-crm-text-muted">
                <ChevronRight className="w-4 h-4" /> הקודם
              </button>
            )}
            <button onClick={next}
              className="flex items-center gap-1 px-4 py-1.5 text-sm font-medium text-white rounded-full transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--crm-primary)' }}>
              {isLast ? 'סיום 🎉' : 'הבא'}
              {!isLast && <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
