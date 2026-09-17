'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Users, ClipboardList, AlertCircle, MessageSquare, ChevronDown, CheckCircle2, Clock, UserPlus, Filter, Check, Trash2 } from 'lucide-react'
import { Parent, Task, SyncSource } from '@/lib/types'
import { Navigation } from '@/components/dashboard/Navigation'
import { ParentsList } from '@/components/dashboard/ParentsList'
import { TaskList } from '@/components/dashboard/TaskList'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { AddParentModal } from '@/components/dashboard/AddParentModal'
import { BotContentManager } from '@/components/dashboard/BotContentManager'
import { BotFlowKanban } from '@/components/dashboard/BotFlowKanban'
import { BotFAQManager } from '@/components/dashboard/BotFAQManager'
import { BotAssets } from '@/components/dashboard/BotAssets'
import { SystemSettings } from '@/components/dashboard/SystemSettings'
import { BotVoiceSettings } from '@/components/dashboard/BotVoiceSettings'
import { RegistrationsList } from '@/components/dashboard/RegistrationsList'
import { AttendanceList } from '@/components/dashboard/AttendanceList'
import { ParentDetail } from '@/components/dashboard/ParentDetail'
import { GlobalSearch } from '@/components/dashboard/GlobalSearch'
import { SuppliersList } from '@/components/dashboard/SuppliersList'
import { ArchiveList } from '@/components/dashboard/ArchiveList'
import { ExportButton } from '@/components/dashboard/ExportButton'
import { StatCard } from '@/components/dashboard/StatCard'
import { Tutorial } from '@/components/dashboard/Tutorial'

type ActiveTab = 'overview' | 'parents' | 'tasks' | 'registrations' | 'attendance' | 'bot' | 'assets' | 'suppliers' | 'archive'

export default function DashboardPage() {
  const [parents, setParents] = useState<Parent[]>([])
  const [suppliers, setSuppliers] = useState<Parent[]>([])
  const [archivedParents, setArchivedParents] = useState<Parent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [loading, setLoading] = useState(true)
  const [showAddParent, setShowAddParent] = useState(false)
  const [editingParent, setEditingParent] = useState<Parent | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [statusFilter, setStatusFilter] = useState<string>('הכל')
  const [frameworkFilter, setFrameworkFilter] = useState<string>('הכל')
  const [areaFilter, setAreaFilter] = useState<string>('הכל')
  const [sourceFilter, setSourceFilter] = useState<string>('הכל')
  const [showMissingChild, setShowMissingChild] = useState(false)
  const [detailParentId, setDetailParentId] = useState<string | null>(null)
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [showRecentTasks, setShowRecentTasks] = useState(true)     // אקורדיון "פניות אחרונות" בסקירה
  const [showRecentParents, setShowRecentParents] = useState(true) // אקורדיון "הורים אחרונים" בסקירה
  const [taskFilter, setTaskFilter] = useState<string>('הכל')   // סינון לשונית פניות (נשלט גם מכרטיסי הסטטיסטיקה)

  // מעבר ללשונית הורים עם סינון נקי (מאפס את כל הסינונים האחרים כדי שלא יצטברו)
  const showParents = (opts: { status?: string; missingChild?: boolean } = {}) => {
    setStatusFilter(opts.status ?? 'הכל')
    setFrameworkFilter('הכל')
    setAreaFilter('הכל')
    setSourceFilter('הכל')
    setShowMissingChild(opts.missingChild ?? false)
    setActiveTab('parents')
  }

  const fetchData = useCallback(async () => {
    try {
      const [parentsRes, suppliersRes, archivedRes, tasksRes] = await Promise.all([
        fetch('/api/parents?contact_type=parent'),
        fetch('/api/parents?contact_type=supplier'),
        fetch('/api/parents?contact_type=parent&archived=true'),
        fetch('/api/tasks'),
      ])
      const [parentsData, suppliersData, archivedData, tasksData] = await Promise.all([
        parentsRes.json(),
        suppliersRes.json(),
        archivedRes.json(),
        tasksRes.json(),
      ])
      if (Array.isArray(parentsData))   setParents(parentsData)
      if (Array.isArray(suppliersData)) setSuppliers(suppliersData)
      if (Array.isArray(archivedData))  setArchivedParents(archivedData)
      if (Array.isArray(tasksData))     setTasks(tasksData)
    } catch (e) {
      console.error('Failed to fetch data:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Ctrl+K → global search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setShowGlobalSearch(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

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

  const handleBulkDeleteParents = async (ids: string[]) => {
    await fetch('/api/parents', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
    await fetchData()
  }

  const handleDeleteTask = async (id: string) => {
    await fetch('/api/tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id] }) })
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const handleBulkDeleteTasks = async (ids: string[]) => {
    await fetch('/api/tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
    setTasks(prev => prev.filter(t => !ids.includes(t.id)))
  }

  // התראות כשל תשלום: סימון כטופל (סטטוס → בוטל) או מחיקה (ג'אנק בדיקות)
  const failedPaymentId = (parentId: string) =>
    parents.find(p => p.id === parentId)?.payments?.find(pay => pay.status === 'נכשל')?.id
  const handleResolveFailedPayment = async (parentId: string) => {
    const payId = failedPaymentId(parentId)
    if (!payId) return
    await fetch('/api/payments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: payId, status: 'בוטל' }) })
    await fetchData()
  }
  const handleDeleteFailedPayment = async (parentId: string) => {
    const payId = failedPaymentId(parentId)
    if (!payId) return
    await fetch('/api/payments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: payId }) })
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
  const frameworkFilters = ['הכל', 'צהרון', 'קייטנה']
  const areaLabels: Record<string, string> = { carmel: 'כרמל', sharon: 'שרון', telaviv: 'תל אביב' }
  const sourceLabels: Record<string, string> = {
    manual:             'ידני',
    payplus_recurring:  'PayPlus',
    greeninvoice:       'חשבונית ירוקה',
    excel_import:       'ייבוא אקסל',
    woocommerce:        'אתר (קייטנות)',
  }
  // Derive dynamic area options from loaded parents
  const areaOptions: string[] = ['הכל', ...Array.from(
    new Set(parents.flatMap(p => (p.children ?? []).map(c => c.area_code).filter((a): a is string => !!a)))
  ).sort()]
  // Derive source options from loaded parents (only values that actually exist)
  const sourceOptions: string[] = ['הכל', ...Array.from(
    new Set(parents.map(p => p.sync_source).filter((s): s is SyncSource => !!s))
  ).sort()]

  const filteredParents = parents.filter(p => {
    // Payment status filter
    if (statusFilter !== 'הכל') {
      const hasStatus = p.payments?.some(pay => pay.status === statusFilter)
      if (!hasStatus) return false
    }
    // Framework filter (צהרון / קייטנה)
    if (frameworkFilter !== 'הכל') {
      const hasFramework = p.children?.some(c => c.framework === frameworkFilter)
      if (!hasFramework) return false
    }
    // Area filter
    if (areaFilter !== 'הכל') {
      const hasArea = p.children?.some(c => c.area_code === areaFilter)
      if (!hasArea) return false
    }
    // Source filter
    if (sourceFilter !== 'הכל') {
      if (p.sync_source !== sourceFilter) return false
    }
    // Missing child name filter — הורים עם תשלום אך ללא שם ילד אמיתי
    if (showMissingChild) {
      const isPlaceholder = (n?: string) => {
        if (!n) return true
        const t = n.trim()
        return t.length < 3 || ['—','–','-','*','?'].includes(t)
      }
      const hasRealChild = p.children?.some(c => !isPlaceholder(c.name))
      const hasPayment = (p.payments?.length ?? 0) > 0
      if (hasRealChild || !hasPayment) return false
    }
    return true
  })

  const missingChildCount = parents.filter(p => {
    const isPlaceholder = (n?: string) => {
      if (!n) return true
      const t = n.trim()
      return t.length < 3 || ['—','–','-','*','?'].includes(t)
    }
    const hasRealChild = p.children?.some(c => !isPlaceholder(c.name))
    const hasPayment = (p.payments?.length ?? 0) > 0
    return hasPayment && !hasRealChild
  }).length

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
      className="min-h-screen overflow-x-hidden"
      style={{ background: 'var(--crm-bg)', color: 'var(--crm-text)' }}
      dir="rtl"
    >
      {/* Top navigation */}
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} onSearchOpen={() => setShowGlobalSearch(true)} />

      {/* Page content */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">

        {/* ── סקירה כללית ─────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Page header */}
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1
                  className="text-3xl md:text-5xl font-bold leading-tight mb-1"
                  style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}
                >
                  סקירה כללית
                </h1>
                <p className="text-sm" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
                  ברוכה הבאה לממשק הניהול של Kids &amp; Fun
                </p>
              </div>
            </div>

            {/* Urgent alerts — accordion (collapsed by default to keep the overview calm) */}
            {(failedPayments.length > 0 || urgentTasks.length > 0) && (
              <div className="rounded-crm overflow-hidden border-r-4" style={{ background: 'var(--crm-danger-bg)', borderColor: 'var(--crm-danger)' }}>
                <button
                  onClick={() => setAlertsOpen(o => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 text-right"
                  aria-expanded={alertsOpen}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-bold text-base" style={{ color: 'var(--crm-danger)' }}>⚠️ התראות דחופות</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--crm-danger)', color: '#fff' }}>
                      {failedPayments.length + urgentTasks.filter(t => !failedPayments.find(p => p.id === t.parent_id)).length}
                    </span>
                  </span>
                  <ChevronDown size={20} style={{ color: 'var(--crm-danger)', transform: alertsOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                </button>
                {alertsOpen && (
                <div className="grid gap-3 md:grid-cols-2 px-4 pb-4">
                  {failedPayments.map(parent => (
                    <div
                      key={parent.id}
                      className="bg-white rounded-xl p-3 flex items-center justify-between gap-2 shadow-sm border"
                      style={{ borderColor: '#e8c4d0' }}
                    >
                      <button
                        onClick={() => setDetailParentId(parent.id)}
                        className="flex-1 min-w-0 text-right hover:opacity-80 transition-opacity"
                        title="פתח כרטיס הורה"
                      >
                        <p className="font-semibold truncate" style={{ color: 'var(--crm-text)' }}>
                          {parent.name || parent.phone}
                        </p>
                        <p className="text-sm truncate" style={{ color: '#9d3d5e' }}>💳 כשל בתשלום — לחץ לפרטים</p>
                      </button>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => handleResolveFailedPayment(parent.id)} title="סמן כטופל"
                          className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-crm-surface-soft"
                          style={{ color: 'var(--crm-success)' }}>
                          <Check size={16} />
                        </button>
                        <button onClick={() => { if (confirm('למחוק התראת כשל תשלום זו? (רשומת התשלום תימחק)')) handleDeleteFailedPayment(parent.id) }} title="מחק התראה"
                          className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-crm-surface-soft"
                          style={{ color: 'var(--crm-danger)' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {urgentTasks
                    .filter(t => !failedPayments.find(p => p.id === t.parent_id))
                    .map(task => (
                      <div
                        key={task.id}
                        className="bg-white rounded-xl p-3 flex items-center justify-between gap-2 shadow-sm border"
                        style={{ borderColor: '#e8c4d0' }}
                      >
                        <button
                          onClick={() => { if (task.parent_id) setDetailParentId(task.parent_id) }}
                          className="flex-1 min-w-0 text-right hover:opacity-80 transition-opacity"
                          title={task.parent_id ? 'פתח כרטיס הורה' : undefined}
                        >
                          <p className="font-semibold truncate" style={{ color: 'var(--crm-text)' }}>
                            {task.parent?.name || 'פנייה'}
                          </p>
                          <p className="text-sm truncate" style={{ color: '#a05a4f' }}>
                            ⚠️ {task.description.slice(0, 60)}...
                          </p>
                        </button>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => handleTaskStatusChange(task.id, 'טופל')} title="סמן כטופל"
                            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-crm-surface-soft"
                            style={{ color: 'var(--crm-success)' }}>
                            <Check size={16} />
                          </button>
                          <button onClick={() => { if (confirm('למחוק התראה זו? (הפנייה תימחק לצמיתות)')) handleDeleteTask(task.id) }} title="מחק התראה"
                            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-crm-surface-soft"
                            style={{ color: 'var(--crm-danger)' }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
                )}
              </div>
            )}

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={<Users size={22} color="#fff" />} label="הורים במערכת" value={parents.length} accent="primary" onClick={() => showParents()} />
              <StatCard icon={<ClipboardList size={22} color="#fff" />} label="פניות פתוחות" value={openTasks.length} accent="accent" onClick={() => { setTaskFilter('פתוח'); setActiveTab('tasks') }} />
              <StatCard icon={<AlertCircle size={22} color="#fff" />} label="כשלי תשלום" value={failedPayments.length} accent="danger" onClick={() => showParents({ status: 'נכשל' })} />
              <StatCard icon={<MessageSquare size={22} color="#5E4B35" />} label="שיחות היום" value={todayConversations} accent="action" onClick={() => setActiveTab('tasks')} />
            </div>

            {/* Two-column: tasks + parents preview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="bg-crm-surface border border-crm-border rounded-crm shadow-crm p-5">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <button
                    onClick={() => setShowRecentTasks(v => !v)}
                    className="flex items-center gap-2 text-right"
                    aria-expanded={showRecentTasks}
                  >
                    <ChevronDown size={20} style={{ color: 'var(--crm-text-muted)', transform: showRecentTasks ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                    <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}>
                      📋 פניות אחרונות
                    </h2>
                  </button>
                  <button
                    onClick={() => setActiveTab('tasks')}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors hover:bg-crm-surface-soft text-crm-text-muted flex-shrink-0"
                  >
                    כל הפניות ←
                  </button>
                </div>
                {showRecentTasks && <TaskList tasks={openTasks.slice(0, 5)} onStatusChange={handleTaskStatusChange} compact />}
              </section>
              <section className="bg-crm-surface border border-crm-border rounded-crm shadow-crm p-5">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <button
                    onClick={() => setShowRecentParents(v => !v)}
                    className="flex items-center gap-2 text-right"
                    aria-expanded={showRecentParents}
                  >
                    <ChevronDown size={20} style={{ color: 'var(--crm-text-muted)', transform: showRecentParents ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                    <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}>
                      👥 הורים אחרונים
                    </h2>
                  </button>
                  <button
                    onClick={() => setShowAddParent(true)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors hover:opacity-90 flex-shrink-0"
                    style={{ background: 'var(--crm-action)', color: 'var(--crm-text)' }}
                  >
                    ➕ הוסף
                  </button>
                </div>
                {/* List view for the overview sidebar */}
                {showRecentParents && (
                  <ParentsList
                    parents={parents.slice(0, 8)}
                    searchQuery=""
                    viewMode="list"
                    preview
                  />
                )}
              </section>
            </div>
          </div>
        )}

        {/* ── הורים ────────────────────────────────────────────── */}
        {activeTab === 'parents' && (
          <div className="space-y-6">
            {/* Page header row */}
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1
                  className="text-3xl md:text-5xl font-bold leading-tight mb-1"
                  style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}
                >
                  הורים
                </h1>
                <p className="text-sm" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
                  {filteredParents.length === parents.length
                    ? `${parents.length} הורים רשומים במערכת`
                    : `מציג ${filteredParents.length} מתוך ${parents.length} הורים`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ExportButton type="parents" label="ייצוא הורים" />
                <ExportButton type="payments" label="ייצוא תשלומים" />
                <button
                  onClick={() => setShowAddParent(true)}
                  className="font-bold px-5 py-2.5 rounded-full text-sm transition-colors hover:opacity-90 flex items-center gap-2"
                  style={{ background: 'var(--crm-action)', color: 'var(--crm-text)' }}
                >
                  הורה חדש +
                </button>
              </div>
            </div>

            {/* Stat cards — אחיד עם הדשבורד */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={<Users size={22} />} label="סה״כ הורים" value={parents.length} accent="primary" onClick={() => showParents()} />
              <StatCard icon={<Filter size={22} />} label="מוצגים כעת" value={filteredParents.length} accent="neutral" onClick={() => showParents()} />
              <StatCard icon={<AlertCircle size={22} />} label="כשלי תשלום" value={failedPayments.length} accent="danger" onClick={() => showParents({ status: 'נכשל' })} />
              <StatCard icon={<UserPlus size={22} />} label="חסרי פרטי ילד" value={missingChildCount} accent="action" onClick={() => showParents({ missingChild: true })} />
            </div>

            {/* Filters row — clean dropdowns (פחות עומס מ-pills) */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Payment status */}
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="rounded-full border bg-crm-surface px-4 py-2 text-sm cursor-pointer focus:outline-none transition-colors"
                style={statusFilter !== 'הכל'
                  ? { borderColor: 'var(--crm-primary)', color: 'var(--crm-primary)', fontWeight: 600 }
                  : { borderColor: 'var(--crm-border)', color: 'var(--crm-text)' }}
              >
                {statusFilters.map(f => (
                  <option key={f} value={f}>{f === 'הכל' ? 'כל התשלומים' : `תשלום: ${f}`}</option>
                ))}
              </select>

              {/* Framework filter */}
              <select
                value={frameworkFilter}
                onChange={e => setFrameworkFilter(e.target.value)}
                className="rounded-full border bg-crm-surface px-4 py-2 text-sm cursor-pointer focus:outline-none transition-colors"
                style={frameworkFilter !== 'הכל'
                  ? { borderColor: 'var(--crm-primary)', color: 'var(--crm-primary)', fontWeight: 600 }
                  : { borderColor: 'var(--crm-border)', color: 'var(--crm-text)' }}
              >
                {frameworkFilters.map(f => (
                  <option key={f} value={f}>{f === 'הכל' ? 'כל המסגרות' : f}</option>
                ))}
              </select>

              {/* Area filter (dynamic) */}
              {areaOptions.length > 1 && (
                <select
                  value={areaFilter}
                  onChange={e => setAreaFilter(e.target.value)}
                  className="rounded-full border bg-crm-surface px-4 py-2 text-sm cursor-pointer focus:outline-none transition-colors"
                  style={areaFilter !== 'הכל'
                    ? { borderColor: 'var(--crm-primary)', color: 'var(--crm-primary)', fontWeight: 600 }
                    : { borderColor: 'var(--crm-border)', color: 'var(--crm-text)' }}
                >
                  {areaOptions.map(a => (
                    <option key={a} value={a}>{a === 'הכל' ? 'כל האזורים' : (areaLabels[a] ?? a)}</option>
                  ))}
                </select>
              )}

              {/* Missing child name — נראה רק אם יש כאלה */}
              {missingChildCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowMissingChild(v => !v)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={
                      showMissingChild
                        ? { background: '#f5a623', color: '#fff' }
                        : { background: '#fff', color: '#7B6010', opacity: 0.9, border: '1px solid #f5a623' }
                    }
                    title="הורים עם תשלום פעיל אבל ללא שם ילד אמיתי במערכת"
                  >
                    🟡 חסרים פרטי ילד ({missingChildCount})
                  </button>
                </div>
              )}

              {/* Source filter */}
              {sourceOptions.length > 1 && (
                <select
                  value={sourceFilter}
                  onChange={e => setSourceFilter(e.target.value)}
                  className="rounded-full border bg-crm-surface px-4 py-2 text-sm cursor-pointer focus:outline-none transition-colors"
                  style={sourceFilter !== 'הכל'
                    ? { borderColor: 'var(--crm-primary)', color: 'var(--crm-primary)', fontWeight: 600 }
                    : { borderColor: 'var(--crm-border)', color: 'var(--crm-text)' }}
                >
                  {sourceOptions.map(s => (
                    <option key={s} value={s}>{s === 'הכל' ? 'כל המקורות' : (sourceLabels[s] ?? s)}</option>
                  ))}
                </select>
              )}

              {/* Active filter count + clear */}
              {(statusFilter !== 'הכל' || frameworkFilter !== 'הכל' || areaFilter !== 'הכל' || sourceFilter !== 'הכל') && (
                <button
                  onClick={() => { setStatusFilter('הכל'); setFrameworkFilter('הכל'); setAreaFilter('הכל'); setSourceFilter('הכל') }}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={{ background: '#fee2e2', color: '#9d3d5e' }}
                >
                  ✕ נקה סינון
                </button>
              )}
            </div>

            {/* Search */}
            <div className="flex-1 relative max-w-lg">
              <input
                type="text"
                placeholder="🔍  חיפוש לפי שם הורה, שם ילד, או טלפון..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full border-2 border-crm-border rounded-full px-5 py-3 text-base focus:outline-none bg-white text-right placeholder:text-crm-text-muted transition-colors"
                onFocus={e => (e.target.style.borderColor = 'var(--crm-primary)')}
                onBlur={e => (e.target.style.borderColor = 'var(--crm-border)')}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-crm-text-muted hover:text-crm-text-muted text-lg">
                  ✕
                </button>
              )}
            </div>

            {/* Parents grid/list */}
            <ParentsList
              parents={filteredParents}
              searchQuery={searchQuery}
              onEdit={setEditingParent}
              onDelete={handleDeleteParent}
              onBulkDelete={handleBulkDeleteParents}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          </div>
        )}

        {/* ── פניות ─────────────────────────────────────────────── */}
        {activeTab === 'tasks' && (
          <div className="space-y-6">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1
                  className="text-3xl md:text-5xl font-bold leading-tight mb-1"
                  style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}
                >
                  פניות
                </h1>
                <p className="text-sm" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
                  {openTasks.length} פתוחות · {tasks.filter(t => t.status === 'טופל').length} טופלו
                </p>
              </div>
              <ExportButton type="tasks" label="ייצוא פניות" />
            </div>
            {/* Stat cards — אחיד עם הדשבורד */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={<ClipboardList size={22} />} label="סה״כ פניות" value={tasks.length} accent="primary" onClick={() => setTaskFilter('הכל')} />
              <StatCard icon={<AlertCircle size={22} />} label="פתוחות" value={tasks.filter(t => t.status === 'פתוח').length} accent="accent" onClick={() => setTaskFilter('פתוח')} />
              <StatCard icon={<Clock size={22} />} label="בטיפול" value={tasks.filter(t => t.status === 'בטיפול').length} accent="action" onClick={() => setTaskFilter('בטיפול')} />
              <StatCard icon={<CheckCircle2 size={22} />} label="טופלו" value={tasks.filter(t => t.status === 'טופל').length} accent="success" onClick={() => setTaskFilter('טופל')} />
            </div>
            <div className="bg-crm-surface rounded-crm shadow-crm border border-crm-border p-6">
              <TaskList
                tasks={tasks}
                onStatusChange={handleTaskStatusChange}
                onDelete={handleDeleteTask}
                onBulkDelete={handleBulkDeleteTasks}
                filter={taskFilter}
                onFilterChange={setTaskFilter}
              />
            </div>
          </div>
        )}

        {/* ── ספקים ─────────────────────────────────────────────── */}
        {activeTab === 'suppliers' && (
          <div className="space-y-6">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-1"
                  style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}>
                  ספקים ושותפים
                </h1>
                <p className="text-sm" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
                  {suppliers.length} גופים — ייבוא מחשבונית ירוקה
                </p>
              </div>
            </div>
            <SuppliersList suppliers={suppliers} onRefresh={fetchData} />
          </div>
        )}

        {/* ── ארכיון (קייטנות ואירועים חד-פעמיים) ───────────────── */}
        {activeTab === 'archive' && (
          <div className="space-y-6">
            <ArchiveList archived={archivedParents} onRefresh={fetchData} />
          </div>
        )}

        {/* ── רישומים ───────────────────────────────────────────── */}
        {activeTab === 'registrations' && (
          <div className="space-y-6">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1
                  className="text-3xl md:text-5xl font-bold leading-tight mb-1"
                  style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}
                >
                  רישומים
                </h1>
                <p className="text-sm" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
                  ניהול רישומים לצהרון ולקייטנה — שינוי סטטוס, אישור והכנסה לתור המתנה
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ExportButton type="registrations" label="ייצוא רישומים" />
                <ExportButton type="waiting" label="ייצוא רשימת המתנה" />
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-crm-border p-6">
              <RegistrationsList onOpenParent={id => setDetailParentId(id)} />
            </div>
          </div>
        )}

        {/* ── נוכחות ────────────────────────────────────────────── */}
        {activeTab === 'attendance' && (
          <AttendanceList />
        )}

        {/* ── ניהול בוט ─────────────────────────────────────────── */}
        {activeTab === 'bot' && (
          <BotManagementTab />
        )}

        {/* ── קבצים וקישורים ───────────────────────────────────── */}
        {activeTab === 'assets' && (
          <div className="space-y-6">
            <div>
              <h1
                className="text-3xl md:text-5xl font-bold leading-tight mb-1"
                style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}
              >
                קבצים וקישורים
              </h1>
              <p className="text-sm" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
                ניהול קישורים, קבצי PDF ותמונות שהבוט שולח
              </p>
            </div>
            <BotAssets />
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

      {/* Parent detail slide-in */}
      {detailParentId && (
        <ParentDetail
          parentId={detailParentId}
          onClose={() => setDetailParentId(null)}
          onRefresh={fetchData}
        />
      )}

      {/* Global search overlay */}
      {showGlobalSearch && (
        <GlobalSearch
          parents={parents}
          suppliers={suppliers}
          tasks={tasks}
          onClose={() => setShowGlobalSearch(false)}
          onNavigate={(tab, itemId) => {
            setActiveTab(tab)
            if (itemId) setDetailParentId(itemId)
          }}
        />
      )}

      {/* מדריך אינטראקטיבי — כפתור ? צף + סיור מודרך */}
      <Tutorial onGoToTab={(t) => setActiveTab(t as ActiveTab)} />
    </div>
  )
}

// =========================================
// BotManagementTab
// =========================================
function BotManagementTab() {
  const [subTab, setSubTab] = useState<'kanban' | 'content' | 'faq' | 'settings'>('kanban')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            className="text-3xl md:text-5xl font-bold leading-tight mb-1"
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
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSubTab('kanban')}
          className="px-5 py-2 rounded-full text-sm font-semibold transition-all"
          style={
            subTab === 'kanban'
              ? { background: 'var(--crm-primary)', color: '#fff' }
              : { background: '#fff', color: 'var(--crm-text)', border: '1px solid var(--crm-border)', opacity: 0.7 }
          }
        >
          🗺️ מסלולים (קנבן)
        </button>
        <button
          onClick={() => setSubTab('content')}
          className="px-5 py-2 rounded-full text-sm font-semibold transition-all"
          style={
            subTab === 'content'
              ? { background: 'var(--crm-primary)', color: '#fff' }
              : { background: '#fff', color: 'var(--crm-text)', border: '1px solid var(--crm-border)', opacity: 0.7 }
          }
        >
          💬 תכני הודעות
        </button>
        <button
          onClick={() => setSubTab('faq')}
          className="px-5 py-2 rounded-full text-sm font-semibold transition-all"
          style={
            subTab === 'faq'
              ? { background: 'var(--crm-primary)', color: '#fff' }
              : { background: '#fff', color: 'var(--crm-text)', border: '1px solid var(--crm-border)', opacity: 0.7 }
          }
        >
          ❓ שאלות ותשובות
        </button>
        <button
          onClick={() => setSubTab('settings')}
          className="px-5 py-2 rounded-full text-sm font-semibold transition-all"
          style={
            subTab === 'settings'
              ? { background: 'var(--crm-primary)', color: '#fff' }
              : { background: '#fff', color: 'var(--crm-text)', border: '1px solid var(--crm-border)', opacity: 0.7 }
          }
        >
          ⚙️ הגדרות מערכת
        </button>
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-crm-border p-6">
        {subTab === 'kanban' && <BotFlowKanban />}
        {subTab === 'content' && <BotContentManager />}
        {subTab === 'faq' && <BotFAQManager />}
        {subTab === 'settings' && <SettingsSection />}
      </div>
    </div>
  )
}

// =========================================
// SettingsSection — ניווט פנימי: כללי / קול הבוט
// =========================================
function SettingsSection() {
  const [inner, setInner] = useState<'general' | 'voice'>('general')

  const pill = (active: boolean) =>
    active
      ? { background: 'var(--crm-primary)', color: '#fff' }
      : { background: '#fff', color: 'var(--crm-text)', border: '1px solid var(--crm-border)', opacity: 0.7 }

  return (
    <div className="space-y-5">
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setInner('general')}
          className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all"
          style={pill(inner === 'general')}
        >
          ⚙️ כללי
        </button>
        <button
          onClick={() => setInner('voice')}
          className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all"
          style={pill(inner === 'voice')}
        >
          🗣️ קול הבוט
        </button>
      </div>

      {inner === 'general' && <SystemSettings />}
      {inner === 'voice' && <BotVoiceSettings />}
    </div>
  )
}


