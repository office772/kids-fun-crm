'use client'

import { useState, useEffect } from 'react'
import { Users, Building2, CheckCircle2, Download, Search, Mail, ChevronDown, ClipboardCheck } from 'lucide-react'
import { StatCard } from './StatCard'

interface Participant { childName: string; className: string; parentName: string; parentPhone: string; parentEmail: string }
interface Roster {
  frameworkId: string
  frameworkName: string
  areaCode: string
  type: string
  staffEmails: { name: string; email: string }[]
  participants: Participant[]
}

export function AttendanceList() {
  const [kind, setKind] = useState<'צהרון' | 'קייטנה'>('צהרון')
  const unit = kind === 'קייטנה' ? 'קייטנות' : 'מסגרות'
  const [rosters, setRosters] = useState<Roster[]>([])
  const [loading, setLoading] = useState(true)
  const [fwFilter, setFwFilter] = useState('הכל')
  const [staffFilter, setStaffFilter] = useState<'all' | 'withStaff'>('all')   // נשלט מכרטיסי הסטטיסטיקה
  const [search, setSearch] = useState('')
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  const toggle = (id: string) => setOpenIds(prev => {
    const s = new Set(prev)
    if (s.has(id)) s.delete(id); else s.add(id)
    return s
  })

  useEffect(() => {
    setLoading(true)
    fetch(`/api/attendance?kind=${encodeURIComponent(kind)}`)
      .then(r => r.json())
      .then((d: Roster[]) => { setRosters(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [kind])

  const totalParticipants = rosters.reduce((a, r) => a + r.participants.length, 0)
  const withStaff = rosters.filter(r => r.staffEmails.length > 0).length

  const q = search.trim().toLowerCase()
  const shown = rosters
    .filter(r => fwFilter === 'הכל' || r.frameworkName === fwFilter)
    .filter(r => staffFilter === 'all' || r.staffEmails.length > 0)
    .map(r => ({
      ...r,
      participants: q
        ? r.participants.filter(p => p.childName.toLowerCase().includes(q) || p.parentName.toLowerCase().includes(q))
        : r.participants,
    }))

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header + segmented toggle (צהרון / קייטנה) */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-1"
            style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}>
            נוכחות {kind}
          </h1>
          <p className="text-sm text-crm-text-muted">משתתפים לפי {kind === 'קייטנה' ? 'קייטנה' : 'מסגרת'} — לצפייה, ייצוא ושליחה שבועית לצוות</p>
        </div>
        <div className="inline-flex items-center gap-1 bg-crm-surface border border-crm-border rounded-full p-1 self-start">
          {(['צהרון', 'קייטנה'] as const).map(k => (
            <button key={k}
              onClick={() => { setKind(k); setFwFilter('הכל'); setOpenIds(new Set()) }}
              className="px-4 py-1.5 rounded-full text-sm font-semibold transition-colors"
              style={kind === k ? { background: 'var(--crm-primary)', color: '#fff' } : { color: 'var(--crm-text-muted)' }}>
              {k === 'קייטנה' ? '☀️ קייטנה' : '🎒 צהרון'}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards — לחיצה פותחת את כל המסגרות (תצוגה מלאה) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(() => {
          // לחיצה על סטטיסטיקה: מחילה סינון ומשאירה את כל המסגרות סגורות
          const showAll = () => { setFwFilter('הכל'); setStaffFilter('all'); setOpenIds(new Set()) }
          const onlyWithStaff = () => { setFwFilter('הכל'); setStaffFilter('withStaff'); setOpenIds(new Set()) }
          return <>
            <StatCard icon={<Users size={22} />} label="סה״כ משתתפים" value={totalParticipants} accent="primary" onClick={showAll} />
            <StatCard icon={<Building2 size={22} />} label={unit} value={rosters.length} accent="accent" onClick={showAll} />
            <StatCard icon={<CheckCircle2 size={22} />} label={`${unit} עם צוות`} value={withStaff} accent="success" onClick={onlyWithStaff} />
            <StatCard icon={<Mail size={22} />} label="מקבלות מייל שבועי" value={withStaff} accent="action" onClick={onlyWithStaff} />
          </>
        })()}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--crm-text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש ילד/ה או הורה..."
            className="w-full border rounded-full pr-9 pl-3 py-2 text-sm focus:outline-none bg-crm-surface text-right"
            style={{ borderColor: 'var(--crm-border)' }} />
        </div>
        <select value={fwFilter} onChange={e => setFwFilter(e.target.value)}
          className="rounded-full border bg-crm-surface px-4 py-2 text-sm cursor-pointer focus:outline-none"
          style={fwFilter !== 'הכל'
            ? { borderColor: 'var(--crm-primary)', color: 'var(--crm-primary)', fontWeight: 600 }
            : { borderColor: 'var(--crm-border)', color: 'var(--crm-text)' }}>
          <option value="הכל">כל ה{unit}</option>
          {rosters.map(r => <option key={r.frameworkId} value={r.frameworkName}>{r.frameworkName}</option>)}
        </select>
        {shown.length > 0 && (
          <button
            onClick={() => {
              const allOpen = shown.every(r => openIds.has(r.frameworkId))
              setOpenIds(allOpen ? new Set() : new Set(shown.map(r => r.frameworkId)))
            }}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-full transition-colors hover:bg-crm-surface-soft"
            style={{ color: 'var(--crm-primary)', border: '1px solid var(--crm-border)' }}
          >
            {shown.every(r => openIds.has(r.frameworkId)) ? '⌃ סגור הכל' : '⌄ פתח הכל'}
          </button>
        )}
        {staffFilter === 'withStaff' && (
          <button onClick={() => setStaffFilter('all')}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full"
            style={{ background: 'var(--crm-surface-soft)', border: '1px solid var(--crm-border)', color: 'var(--crm-text)' }}>
            מסונן: {unit} עם צוות · ✕ נקה
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-14 text-crm-text-muted">טוען רשימות...</div>
      ) : shown.length === 0 ? (
        <div className="text-center py-14 text-crm-text-muted">
          <div className="text-4xl mb-2">📋</div>
          <p>{kind === 'קייטנה' ? 'אין קייטנות להצגה — ייווצרו מרישומי האתר' : 'אין מסגרות להצגה'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(r => {
            const isOpen = openIds.has(r.frameworkId) || fwFilter !== 'הכל'
            return (
            <section key={r.frameworkId} className="bg-crm-surface border border-crm-border rounded-crm shadow-crm overflow-hidden">
              {/* Accordion header row */}
              <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5">
                <button onClick={() => toggle(r.frameworkId)} className="flex items-center gap-2 flex-1 min-w-0 text-right" aria-expanded={isOpen}>
                  <ChevronDown size={18} style={{ color: 'var(--crm-text-muted)', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                  <span className="font-bold text-base sm:text-lg truncate" style={{ color: 'var(--crm-primary)' }}>{r.frameworkName}</span>
                  <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full border flex-shrink-0"
                    style={{ background: 'var(--crm-surface)', borderColor: 'var(--crm-border)', color: 'var(--crm-text-muted)' }}>
                    {r.type} · {r.participants.length}
                  </span>
                  {r.staffEmails.length === 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full border flex-shrink-0 hidden md:inline" style={{ borderColor: 'var(--crm-warning)', color: 'var(--crm-warning)' }}>
                      ⚠️ אין צוות
                    </span>
                  )}
                </button>
                <a href={`/api/export?type=participants&kind=${encodeURIComponent(kind)}&framework=${encodeURIComponent(r.frameworkName)}`}
                  className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full transition-colors hover:bg-crm-surface-soft flex-shrink-0"
                  style={{ color: 'var(--crm-primary)', border: '1px solid var(--crm-border)' }}
                  title="ייצוא רשימה מלאה (שמות + פרטי קשר)">
                  <Download size={14} /> <span className="hidden sm:inline">רשימה</span>
                </a>
                <a href={`/api/export?type=attendance-sheet&kind=${encodeURIComponent(kind)}&framework=${encodeURIComponent(r.frameworkName)}`}
                  className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full transition-colors hover:opacity-90 flex-shrink-0 text-white"
                  style={{ background: 'var(--crm-primary)' }}
                  title="דף נוכחות לסימון V (עמודות לכל יום בשבוע)">
                  <ClipboardCheck size={14} /> <span className="hidden sm:inline">דף נוכחות</span>
                </a>
              </div>

              {/* Participants table — accordion body */}
              {isOpen && (
                <div className="border-t border-crm-border">
                  {r.participants.length === 0 ? (
                    <p className="text-center py-8 text-crm-text-muted text-sm">אין משתתפים רשומים במסגרת זו</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" dir="rtl">
                        <thead>
                          <tr className="border-b border-crm-border" style={{ background: 'var(--crm-surface-soft)' }}>
                            <th className="text-center px-3 py-2.5 font-semibold w-10" style={{ color: 'var(--crm-primary)' }}>#</th>
                            <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--crm-primary)' }}>שם הילד/ה</th>
                            <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--crm-primary)' }}>כיתה</th>
                            <th className="text-right px-3 py-2.5 font-semibold hidden sm:table-cell" style={{ color: 'var(--crm-primary)' }}>הורה</th>
                            <th className="text-right px-3 py-2.5 font-semibold hidden sm:table-cell" style={{ color: 'var(--crm-primary)' }}>טלפון</th>
                            <th className="text-right px-3 py-2.5 font-semibold hidden lg:table-cell" style={{ color: 'var(--crm-primary)' }}>מייל</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.participants.map((p, i) => (
                            <tr key={i} className="border-b border-crm-border"
                              style={i % 2 !== 0 ? { background: 'var(--crm-surface-soft)' } : {}}>
                              <td className="px-3 py-2.5 text-center text-crm-text-muted">{i + 1}</td>
                              <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--crm-text)' }}>{p.childName || '—'}</td>
                              <td className="px-3 py-2.5 text-crm-text-muted">{p.className || '—'}</td>
                              <td className="px-3 py-2.5 text-crm-text-muted hidden sm:table-cell">{p.parentName || '—'}</td>
                              <td className="px-3 py-2.5 text-crm-text-muted hidden sm:table-cell" dir="ltr">{p.parentPhone || '—'}</td>
                              <td className="px-3 py-2.5 text-crm-text-muted hidden lg:table-cell" dir="ltr">{p.parentEmail || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
