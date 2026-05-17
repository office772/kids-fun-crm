'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Users, ClipboardList, AlertCircle, MessageSquare } from 'lucide-react'
import { Parent, Task } from '@/lib/types'
import { Navigation } from '@/components/dashboard/Navigation'
import { ParentsList } from '@/components/dashboard/ParentsList'
import { TaskList } from '@/components/dashboard/TaskList'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { AddParentModal } from '@/components/dashboard/AddParentModal'
import { BotContentManager } from '@/components/dashboard/BotContentManager'
import { SystemSettings } from '@/components/dashboard/SystemSettings'

type ActiveTab = 'overview' | 'parents' | 'tasks' | 'simulator' | 'bot'

export default function DashboardPage() {
  const [parents, setParents] = useState<Parent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [loading, setLoading] = useState(true)
  const [showAddParent, setShowAddParent] = useState(false)
  const [editingParent, setEditingParent] = useState<Parent | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [statusFilter, setStatusFilter] = useState<string>('הכל')

  const fetchData = useCallback(async () => {
    try {
      const [parentsRes, tasksRes] = await Promise.all([
        fetch('/api/parents'),
        fetch('/api/tasks'),
      ])
      const [parentsData, tasksData] = await Promise.all([
        parentsRes.json(),
        tasksRes.json(),
      ])
      if (Array.isArray(parentsData)) setParents(parentsData)
      if (Array.isArray(tasksData)) setTasks(tasksData)
    } catch (e) {
      console.error('Failed to fetch data:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleAddParent = async (data: Parameters<typeof fetch>[1] & object) => {
    await fetch('/api/parents/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await fetchData()
  }

  const handleEditParent = async (data: Parameters<typeof fetch>[1] & object) => {
    if (!editingParent) return
    await fetch(`/api/parents/${editingParent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setEditingParent(null)
    await fetchData()
  }

  const handleDeleteParent = async (id: string) => {
    await fetch(`/api/parents/${id}`, { method: 'DELETE' })
    await fetchData()
  }

  const handleTaskStatusChange = async (id: string, status: string) => {
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    setTasks(prev =>
      prev.map(t => (t.id === id ? { ...t, status: status as Task['status'] } : t))
    )
  }

  // Stats
  const failedPayments = parents.filter(p => p.payments?.some(pay => pay.status === 'נכשל'))
  const openTasks = tasks.filter(t => t.status !== 'טופל')
  const urgentTasks = openTasks.filter(t => t.priority === 'דחוף')
  const todayConversations = parents.reduce((acc, p) => {
    const today = new Date().toDateString()
    const todayMsgs =
      p.conversations?.filter(c => new Date(c.created_at).toDateString() === today) || []
    return acc + todayMsgs.length
  }, 0)

  // Filtered parents for the parents tab
  const statusFilters = ['הכל', 'שולם', 'ממתין', 'נכשל']
  const filteredParents = parents.filter(p => {
    if (statusFilter !== 'הכל') {
      const hasStatus = p.payments?.some(pay => pay.status === statusFilter)
      if (!hasStatus) return false
    }
    return true
  })

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--crm-bg)' }}
      >
        <div className="text-center">
          <div className="text-5xl mb-4 animate-pulse">🌟</div>
          <p className="text-xl font-semibold" style={{ color: 'var(--crm-primary)' }}>
            טוען נתונים...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--crm-bg)', color: 'var(--crm-text)' }}
      dir="rtl"
    >
      {/* Top navigation */}
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Page content */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">

        {/* ── סקירה כללית ─────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Page header */}
            <div className="flex items-end justify-between">
              <div>
                <h1
                  className="text-5xl font-bold leading-none mb-1"
                  style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}
                >
                  סקירה כללית
                </h1>
                <p className="text-sm" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
                  ברוכה הבאה לממשק הניהול של Kids &amp; Fun
                </p>
              </div>
            </div>

            {/* Urgent alerts */}
            {(failedPayments.length > 0 || urgentTasks.length > 0) && (
              <div className="rounded-2xl p-4 shadow-sm border-r-4" style={{ background: '#FAF5EE', borderColor: '#9d3d5e' }}>
                <h2 className="font-bold text-base mb-3" style={{ color: '#7d2d4a' }}>⚠️ התראות דחופות</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {failedPayments.map(parent => (
                    <div
                      key={parent.id}
                      className="bg-white rounded-xl p-3 flex items-center justify-between shadow-sm border"
                      style={{ borderColor: '#e8c4d0' }}
                    >
                      <div>
                        <p className="font-semibold" style={{ color: 'var(--crm-text)' }}>
                          {parent.name || parent.phone}
                        </p>
                        <p className="text-sm" style={{ color: '#9d3d5e' }}>💳 כשל בתשלום — יצירת קשר נדרשת</p>
                      </div>
                      <StatusBadge status="נכשל" size="sm" />
                    </div>
                  ))}
                  {urgentTasks
                    .filter(t => !failedPayments.find(p => p.id === t.parent_id))
                    .map(task => (
                      <div
                        key={task.id}
                        className="bg-white rounded-xl p-3 flex items-center justify-between shadow-sm border"
                        style={{ borderColor: '#e8c4d0' }}
                      >
                        <div>
                          <p className="font-semibold" style={{ color: 'var(--crm-text)' }}>
                            {task.parent?.name || 'פנייה'}
                          </p>
                          <p className="text-sm" style={{ color: '#a05a4f' }}>
                            ⚠️ {task.description.slice(0, 60)}...
                          </p>
                        </div>
                        <StatusBadge status="דחוף" size="sm" />
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={<Users size={22} color="#fff" />} label="הורים במערכת" value={parents.length} accent="primary" />
              <StatCard icon={<ClipboardList size={22} color="#fff" />} label="פניות פתוחות" value={openTasks.length} accent="accent" />
              <StatCard icon={<AlertCircle size={22} color="#fff" />} label="כשלי תשלום" value={failedPayments.length} accent="red" />
              <StatCard icon={<MessageSquare size={22} color="#5E4B35" />} label="שיחות היום" value={todayConversations} accent="action" />
            </div>

            {/* Two-column: tasks + parents preview */}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h2
                  className="text-3xl font-bold mb-4"
                  style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}
                >
                  📋 פניות אחרונות
                </h2>
                <TaskList tasks={openTasks.slice(0, 5)} onStatusChange={handleTaskStatusChange} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2
                    className="text-3xl font-bold"
                    style={{
                      fontFamily: 'var(--font-rubik), Rubik, sans-serif',
                      color: 'var(--crm-primary)',
                    }}
                  >
                    👥 הורים אחרונים
                  </h2>
                  <button
                    onClick={() => setShowAddParent(true)}
                    className="text-sm font-semibold px-4 py-2 rounded-full transition-colors hover:opacity-90"
                    style={{ background: 'var(--crm-action)', color: 'var(--crm-text)' }}
                  >
                    ➕ הוסף
                  </button>
                </div>
                {/* List view for the overview sidebar */}
                <ParentsList
                  parents={parents.slice(0, 8)}
                  searchQuery=""
                  onEdit={setEditingParent}
                  onDelete={handleDeleteParent}
                  viewMode="list"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── הורים ────────────────────────────────────────────── */}
        {activeTab === 'parents' && (
          <div className="space-y-6">
            {/* Page header row */}
            <div className="flex items-end justify-between">
              <div>
                <h1
                  className="text-5xl font-bold leading-none mb-1"
                  style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}
                >
                  הורים
                </h1>
                <p className="text-sm" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
                  {parents.length} הורים רשומים במערכת
                </p>
              </div>
              <button
                onClick={() => setShowAddParent(true)}
                className="font-bold px-5 py-2.5 rounded-full text-sm transition-colors hover:opacity-90 flex items-center gap-2"
                style={{ background: 'var(--crm-action)', color: 'var(--crm-text)' }}
              >
                הורה חדש +
              </button>
            </div>

            {/* Status filter pills */}
            <div className="flex items-center gap-2 flex-wrap">
              {statusFilters.map(filter => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
                  style={
                    statusFilter === filter
                      ? { background: 'var(--crm-action)', color: 'var(--crm-text)' }
                      : {
                          background: '#fff',
                          color: 'var(--crm-text)',
                          opacity: 0.65,
                          border: '1px solid #e5e7eb',
                        }
                  }
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Search + view toggle */}
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="🔍  חיפוש לפי שם הורה, שם ילד, או טלפון..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-full px-5 py-3 text-base focus:outline-none bg-white text-right placeholder:text-gray-400 transition-colors"
                  onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
                  onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Grid / List toggle */}
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-full px-1 py-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className="p-1.5 rounded-full transition-colors"
                  style={
                    viewMode === 'grid'
                      ? { background: 'var(--crm-primary)', color: '#fff' }
                      : { color: 'var(--crm-text)', opacity: 0.5 }
                  }
                  title="תצוגת כרטיסים"
                >
                  {/* Grid icon */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className="p-1.5 rounded-full transition-colors"
                  style={
                    viewMode === 'list'
                      ? { background: 'var(--crm-primary)', color: '#fff' }
                      : { color: 'var(--crm-text)', opacity: 0.5 }
                  }
                  title="תצוגת רשימה"
                >
                  {/* List icon */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                    <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Parents grid/list */}
            <ParentsList
              parents={filteredParents}
              searchQuery={searchQuery}
              onEdit={setEditingParent}
              onDelete={handleDeleteParent}
              viewMode={viewMode}
            />
          </div>
        )}

        {/* ── פניות ─────────────────────────────────────────────── */}
        {activeTab === 'tasks' && (
          <div className="space-y-6">
            <div className="flex items-end justify-between">
              <div>
                <h1
                  className="text-5xl font-bold leading-none mb-1"
                  style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}
                >
                  פניות
                </h1>
                <p className="text-sm" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
                  {openTasks.length} פתוחות · {tasks.filter(t => t.status === 'טופל').length} טופלו
                </p>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <TaskList tasks={tasks} onStatusChange={handleTaskStatusChange} />
            </div>
          </div>
        )}

        {/* ── ניהול בוט ─────────────────────────────────────────── */}
        {activeTab === 'bot' && (
          <BotManagementTab />
        )}

        {/* ── סימולטור ──────────────────────────────────────────── */}
        {activeTab === 'simulator' && (
          <div className="space-y-6">
            <div>
              <h1
                className="text-5xl font-bold leading-none mb-1"
                style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}
              >
                סימולטור בוט
              </h1>
              <p className="text-sm" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
                בדקי את הבוט לפני חיבור WhatsApp
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <BotSimulator />
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      {showAddParent && (
        <AddParentModal
          onClose={() => setShowAddParent(false)}
          onSave={handleAddParent}
        />
      )}

      {editingParent && (
        <AddParentModal
          onClose={() => setEditingParent(null)}
          onSave={handleEditParent}
          editParent={editingParent}
        />
      )}
    </div>
  )
}

// =========================================
// BotManagementTab
// =========================================
function BotManagementTab() {
  const [subTab, setSubTab] = useState<'content' | 'settings'>('content')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1
            className="text-5xl font-bold leading-none mb-1"
            style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}
          >
            ניהול בוט
          </h1>
          <p className="text-sm" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
            הגדרת תכני הבוט, הודעות ופרמטרים מערכתיים
          </p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setSubTab('content')}
          className="px-5 py-2 rounded-full text-sm font-semibold transition-all"
          style={
            subTab === 'content'
              ? { background: 'var(--crm-primary)', color: '#fff' }
              : { background: '#fff', color: 'var(--crm-text)', border: '1px solid #e5e7eb', opacity: 0.7 }
          }
        >
          💬 תכני הודעות
        </button>
        <button
          onClick={() => setSubTab('settings')}
          className="px-5 py-2 rounded-full text-sm font-semibold transition-all"
          style={
            subTab === 'settings'
              ? { background: 'var(--crm-primary)', color: '#fff' }
              : { background: '#fff', color: 'var(--crm-text)', border: '1px solid #e5e7eb', opacity: 0.7 }
          }
        >
          ⚙️ הגדרות מערכת
        </button>
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        {subTab === 'content' && <BotContentManager />}
        {subTab === 'settings' && <SystemSettings />}
      </div>
    </div>
  )
}

// =========================================
// StatCard
// =========================================
function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: number
  accent: 'primary' | 'accent' | 'red' | 'action'
}) {
  const iconBg = {
    primary: '#6D436D',
    accent: '#D29486',
    red: '#ef4444',
    action: '#FAD980',
  }[accent]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
        style={{ backgroundColor: iconBg }}
      >
        {icon}
      </div>
      <div className="text-3xl font-bold mb-1" style={{ color: 'var(--crm-text)' }}>
        {value}
      </div>
      <div className="text-sm font-medium" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
        {label}
      </div>
    </div>
  )
}

// =========================================
// BotSimulator (inline)
// =========================================
const FLOW_LABELS: Record<string, { label: string; emoji: string; steps: string[] }> = {
  register_child_name: { label: 'רישום לצהרון', emoji: '🎒', steps: ['שם ילד/ה', 'כיתה', 'אישור'] },
  register_class:      { label: 'רישום לצהרון', emoji: '🎒', steps: ['שם ילד/ה ✓', 'כיתה', 'אישור'] },
  camp_late_name:      { label: 'קייטנה (אחרי סגירה)', emoji: '🏕️', steps: ['שם ילד/ה', 'כיתה', 'המתנה'] },
  camp_late_class:     { label: 'קייטנה (אחרי סגירה)', emoji: '🏕️', steps: ['שם ילד/ה ✓', 'כיתה', 'המתנה'] },
}

const INTENT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  'רישום_צהרון':  { label: 'רישום צהרון', color: '#6D436D', bg: '#e8d5e8' },
  'רישום_קייטנה': { label: 'רישום קייטנה', color: '#2A6B6B', bg: '#d5e8e8' },
  'ביטול':        { label: 'ביטול', color: '#7d2d4a', bg: '#f5dde5' },
  'שאלת_לוז':     { label: 'שאלת לו"ז', color: '#b45309', bg: '#fef3c7' },
  'בדיקת_תשלום':  { label: 'תשלום', color: '#a05a4f', bg: '#fce9e6' },
  'כשל_תשלום':    { label: 'כשל תשלום', color: '#7d2d4a', bg: '#f5dde5' },
  'איסוף_מוקדם':  { label: 'איסוף מוקדם', color: '#854d0e', bg: '#fef9c3' },
  'שאלה_כללית':   { label: 'ברכה כללית', color: '#78716c', bg: '#f5f5f4' },
  'לא_ידוע':      { label: 'לא זוהה', color: '#9ca3af', bg: '#f9fafb' },
}

const QUICK_TESTS = [
  { label: 'רישום לצהרון', msg: 'אני רוצה לרשום את הילד לצהרון' },
  { label: 'קייטנה', msg: 'מה עם הקייטנה בקיץ?' },
  { label: 'ביטול', msg: 'אני רוצה לבטל' },
  { label: 'שעות', msg: 'מה השעות שלכם?' },
  { label: 'בעיה בתשלום', msg: 'יש לי בעיה עם התשלום' },
  { label: 'איסוף מוקדם', msg: 'אני צריכה לאסוף מוקדם היום' },
]

interface SimMessage {
  role: 'user' | 'bot'
  text: string
  intent?: string
  isComplete?: boolean
  createdTask?: boolean
}

function BotSimulator() {
  const [messages, setMessages] = useState<SimMessage[]>([
    {
      role: 'bot',
      text: 'שלום! 😊 כאן Kids & Fun!\n\n*1* — רישום לצהרון\n*2* — רישום לקייטנה\n*3* — ביטול\n*4* — שעות ולוח זמנים\n*5* — תשלומים\n*6* — איסוף מוקדם\n\nאו פשוט כתוב/י מה צריך 💬',
    },
  ])
  const [input, setInput] = useState('')
  const [botLoading, setBotLoading] = useState(false)
  const [currentFlow, setCurrentFlow] = useState<string | null>(null)
  const [collectedData, setCollectedData] = useState<Record<string, string>>({})
  const [lastIntent, setLastIntent] = useState<string | null>(null)
  const [msgCount, setMsgCount] = useState(0)
  const chatRef = useRef<HTMLDivElement>(null)
  // stable session id per mount
  const sessionIdRef = useRef('sim_' + Date.now())

  // auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [messages, botLoading])

  const reset = () => {
    setMessages([{
      role: 'bot',
      text: 'שלום! 😊 כאן Kids & Fun!\n\n*1* — רישום לצהרון\n*2* — רישום לקייטנה\n*3* — ביטול\n*4* — שעות ולוח זמנים\n*5* — תשלומים\n*6* — איסוף מוקדם\n\nאו פשוט כתוב/י מה צריך 💬',
    }])
    setCurrentFlow(null)
    setCollectedData({})
    setLastIntent(null)
    setMsgCount(0)
    fetch('/api/bot/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '__reset__', sessionId: sessionIdRef.current, reset: true }),
    }).catch(() => {})
  }

  const sendMessage = async (text?: string) => {
    const userMsg = (text ?? input).trim()
    if (!userMsg || botLoading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setMsgCount(n => n + 1)
    setBotLoading(true)

    try {
      const res = await fetch('/api/bot/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, sessionId: sessionIdRef.current }),
      })
      const data = await res.json() as {
        reply?: string
        intent?: string
        currentFlow?: string | null
        collectedData?: Record<string, string>
        isComplete?: boolean
        createTask?: object | null
        escalate?: boolean
      }
      setMessages(prev => [...prev, {
        role: 'bot',
        text: data.reply || 'שגיאה בתשובה',
        intent: data.intent,
        isComplete: data.isComplete,
        createdTask: !!data.createTask,
      }])
      setCurrentFlow(data.currentFlow ?? null)
      setCollectedData(data.collectedData ?? {})
      if (data.intent) setLastIntent(data.intent)
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: 'שגיאה בחיבור לשרת' }])
    } finally {
      setBotLoading(false)
    }
  }

  const flowInfo = currentFlow ? FLOW_LABELS[currentFlow] : null
  const intentInfo = lastIntent ? INTENT_LABELS[lastIntent] : null
  const collectedEntries = Object.entries(collectedData).filter(([, v]) => v)

  return (
    <div className="flex gap-6 min-h-[580px]" dir="rtl">

      {/* ── Chat window ── */}
      <div className="flex-1 min-w-0 flex flex-col">

        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-semibold" style={{ color: 'var(--crm-text)' }}>בוט פעיל</span>
            {msgCount > 0 && (
              <span className="text-xs rounded-full px-2 py-0.5" style={{ background: '#f5f5f4', color: '#78716c' }}>
                {msgCount} הודעות
              </span>
            )}
          </div>
          <button
            onClick={reset}
            className="text-xs px-3 py-1.5 rounded-full font-medium hover:opacity-80 transition-opacity"
            style={{ background: '#f5f5f4', color: '#78716c' }}
          >
            🔄 התחל שיחה חדשה
          </button>
        </div>

        {/* WhatsApp chat area */}
        <div className="flex-1 rounded-2xl overflow-hidden flex flex-col bg-[#E5DDD5]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cg fill='%23C4B9B0' fill-opacity='0.2'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>

          {/* WA header */}
          <div className="bg-[#128C7E] text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-green-600 flex items-center justify-center">🌟</div>
            <div>
              <p className="font-bold text-sm">Kids &amp; Fun</p>
              <p className="text-green-200 text-xs">{currentFlow ? `מסלול: ${flowInfo?.label ?? currentFlow}` : 'ממתין להודעה'}</p>
            </div>
          </div>

          {/* Messages */}
          <div ref={chatRef} className="flex-1 p-4 overflow-y-auto space-y-3" style={{ minHeight: 0, maxHeight: '420px' }}>
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm text-sm whitespace-pre-line ${
                    msg.role === 'user'
                      ? 'bg-[#DCF8C6] text-stone-800 rounded-tl-sm'
                      : 'bg-white text-stone-800 rounded-tr-sm'
                  }`}
                >
                  {msg.text}
                </div>
                {/* Intent tag on bot messages */}
                {msg.role === 'bot' && msg.intent && INTENT_LABELS[msg.intent] && (
                  <div className="flex items-center gap-1.5 mt-1 mx-1">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: INTENT_LABELS[msg.intent].bg, color: INTENT_LABELS[msg.intent].color }}
                    >
                      {INTENT_LABELS[msg.intent].label}
                    </span>
                    {msg.isComplete && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#dcfce7', color: '#15803d' }}>
                        ✓ מסלול הסתיים
                      </span>
                    )}
                    {msg.createdTask && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#fef3c7', color: '#b45309' }}>
                        📋 נוצרה משימה
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {botLoading && (
              <div className="flex justify-start">
                <div className="bg-white rounded-2xl px-4 py-3 shadow-sm text-stone-400 text-sm animate-pulse">מקלידה...</div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="bg-[#F0F0F0] p-3 flex items-center gap-2 flex-shrink-0">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="כתוב הודעה..."
              className="flex-1 bg-white rounded-full px-4 py-2.5 text-sm focus:outline-none text-right"
              dir="rtl"
            />
            <button
              onClick={() => sendMessage()}
              disabled={botLoading || !input.trim()}
              className="bg-[#128C7E] hover:bg-[#0e7268] disabled:opacity-50 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Quick test chips */}
        <div className="mt-3">
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--crm-text)', opacity: 0.5 }}>בדיקות מהירות:</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_TESTS.map(t => (
              <button
                key={t.label}
                onClick={() => sendMessage(t.msg)}
                disabled={botLoading}
                className="text-xs px-3 py-1.5 rounded-full font-medium border transition-all hover:opacity-80 disabled:opacity-40"
                style={{ background: '#FAF5EE', color: 'var(--crm-text)', borderColor: '#e8c4d0' }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Debug / Status panel ── */}
      <div className="w-64 flex-shrink-0 space-y-4">

        {/* Current flow */}
        <div className="rounded-2xl border p-4" style={{ background: '#fff', borderColor: '#f0e8e8' }}>
          <p className="text-xs font-bold mb-3 uppercase tracking-wide" style={{ color: '#a8a29e' }}>מסלול נוכחי</p>
          {currentFlow && flowInfo ? (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{flowInfo.emoji}</span>
                <span className="text-sm font-bold" style={{ color: 'var(--crm-primary)' }}>{flowInfo.label}</span>
              </div>
              <div className="space-y-1.5">
                {flowInfo.steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs" style={{ color: step.includes('✓') ? '#15803d' : '#78716c' }}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${step.includes('✓') ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                      {step.includes('✓') ? '✓' : i + 1}
                    </span>
                    {step.replace(' ✓', '')}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-3">
              <div className="text-2xl mb-1">💬</div>
              <p className="text-xs" style={{ color: '#a8a29e' }}>אין מסלול פעיל</p>
            </div>
          )}
        </div>

        {/* Collected data */}
        <div className="rounded-2xl border p-4" style={{ background: '#fff', borderColor: '#f0e8e8' }}>
          <p className="text-xs font-bold mb-3 uppercase tracking-wide" style={{ color: '#a8a29e' }}>נתונים שנאספו</p>
          {collectedEntries.length > 0 ? (
            <div className="space-y-2">
              {collectedEntries.map(([key, val]) => (
                <div key={key} className="flex flex-col">
                  <span className="text-xs" style={{ color: '#a8a29e' }}>
                    {key === 'child_name' ? 'שם ילד/ה' : key === 'class_name' ? 'כיתה' : key === 'parent_phone' ? 'טלפון' : key}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--crm-text)' }}>{val}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-center py-2" style={{ color: '#a8a29e' }}>עדיין לא נאספו נתונים</p>
          )}
        </div>

        {/* Intent */}
        {intentInfo && (
          <div className="rounded-2xl border p-4" style={{ background: '#fff', borderColor: '#f0e8e8' }}>
            <p className="text-xs font-bold mb-2 uppercase tracking-wide" style={{ color: '#a8a29e' }}>כוונה אחרונה</p>
            <span
              className="text-xs px-3 py-1 rounded-full font-semibold"
              style={{ background: intentInfo.bg, color: intentInfo.color }}
            >
              {intentInfo.label}
            </span>
          </div>
        )}

        {/* Flow map */}
        <div className="rounded-2xl border p-4" style={{ background: '#FAF5EE', borderColor: '#e8c4d0' }}>
          <p className="text-xs font-bold mb-3 uppercase tracking-wide" style={{ color: '#a8a29e' }}>מסלולים זמינים</p>
          <div className="space-y-1.5 text-xs" style={{ color: '#78716c' }}>
            {[
              { e: '🎒', t: 'רישום לצהרון', k: '1' },
              { e: '🏕️', t: 'רישום לקייטנה', k: '2' },
              { e: '❌', t: 'ביטול', k: '3' },
              { e: '📅', t: 'שעות ולו"ז', k: '4' },
              { e: '💳', t: 'תשלום / כשל', k: '5' },
              { e: '🚗', t: 'איסוף מוקדם', k: '6' },
            ].map(f => (
              <div key={f.k} className="flex items-center gap-2">
                <span>{f.e}</span>
                <span>{f.t}</span>
                <span className="mr-auto font-mono opacity-50">{f.k}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
