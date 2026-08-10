export const dynamic = 'force-dynamic'

// ─── ייצוא דוחות ל-Excel ──────────────────────────────────────────────────────
// GET /api/export?type=registrations|payments|parents|tasks|waiting
// מחזיר קובץ .xlsx (RTL עברית) של כל הרשומות מהסוג המבוקש.

import { NextRequest, NextResponse } from 'next/server'
import { buildXlsx, one, fmtDate, type ExportColumn } from '@/lib/export'
import { buildFrameworkRosters } from '@/lib/attendance'

type Report = {
  sheet:   string
  columns: ExportColumn[] | ((params: URLSearchParams) => ExportColumn[])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build:   (supabase: any, params: URLSearchParams) => Promise<Record<string, unknown>[]>
}

// ימי השבוע (ראשון–חמישי) של השבוע שמתחיל ב-weekStart (או השבוע הנוכחי)
const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
function weekDays(weekStart?: string | null): { key: string; label: string }[] {
  let sunday: Date
  if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    sunday = new Date(weekStart + 'T00:00:00')
  } else {
    const now = new Date()
    sunday = new Date(now)
    sunday.setDate(now.getDate() - now.getDay()) // אחורה ליום ראשון
  }
  const days: { key: string; label: string }[] = []
  for (let d = 0; d < 5; d++) {           // ראשון–חמישי
    const dt = new Date(sunday)
    dt.setDate(sunday.getDate() + d)
    const dd = String(dt.getDate()).padStart(2, '0')
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    days.push({ key: `d${d}`, label: `${DAY_NAMES[d]} ${dd}/${mm}` })
  }
  return days
}

const REPORTS: Record<string, Report> = {
  registrations: {
    sheet: 'רישומים',
    columns: [
      { header: 'ילד/ה', key: 'child', width: 22 },
      { header: 'כיתה', key: 'class_name', width: 12 },
      { header: 'מסגרת', key: 'framework', width: 16 },
      { header: 'הורה', key: 'parent', width: 22 },
      { header: 'טלפון', key: 'phone', width: 16 },
      { header: 'אזור', key: 'area', width: 16 },
      { header: 'סטטוס', key: 'status', width: 16 },
      { header: 'נרשם בתאריך', key: 'created', width: 16 },
    ],
    build: async (supabase) => {
      const { data } = await supabase
        .from('registrations')
        .select('status, area_label, area_code, created_at, parent:parents(name, phone), child:children(name, class_name, framework)')
        .order('created_at', { ascending: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => {
        const p = one(r.parent), c = one(r.child)
        return {
          child: c?.name ?? '', class_name: c?.class_name ?? '', framework: c?.framework ?? '',
          parent: p?.name ?? '', phone: p?.phone ?? '',
          area: r.area_label ?? r.area_code ?? '', status: r.status ?? '', created: fmtDate(r.created_at),
        }
      })
    },
  },

  payments: {
    sheet: 'תשלומים',
    columns: [
      { header: 'הורה', key: 'parent', width: 22 },
      { header: 'טלפון', key: 'phone', width: 16 },
      { header: 'סכום (₪)', key: 'amount', width: 12 },
      { header: 'סטטוס', key: 'status', width: 14 },
      { header: 'סוג תשלום', key: 'ptype', width: 16 },
      { header: 'תשלום', key: 'seq', width: 12 },
      { header: 'שולם בתאריך', key: 'paid', width: 16 },
      { header: 'נוצר', key: 'created', width: 16 },
    ],
    build: async (supabase) => {
      const { data } = await supabase
        .from('payments')
        .select('amount, status, payment_type, payment_number, total_payments, paid_at, created_at, parent:parents(name, phone)')
        .order('created_at', { ascending: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => {
        const p = one(r.parent)
        const seq = r.payment_number && r.total_payments ? `${r.payment_number}/${r.total_payments}`
          : r.payment_number ? String(r.payment_number) : ''
        return {
          parent: p?.name ?? '', phone: p?.phone ?? '',
          amount: r.amount ?? '', status: r.status ?? '', ptype: r.payment_type ?? '',
          seq, paid: fmtDate(r.paid_at), created: fmtDate(r.created_at),
        }
      })
    },
  },

  parents: {
    sheet: 'הורים',
    columns: [
      { header: 'שם', key: 'name', width: 24 },
      { header: 'טלפון', key: 'phone', width: 16 },
      { header: 'אימייל', key: 'email', width: 26 },
      { header: 'עיר', key: 'city', width: 16 },
      { header: 'סוג', key: 'contact_type', width: 14 },
      { header: 'נוצר', key: 'created', width: 16 },
    ],
    build: async (supabase) => {
      const { data } = await supabase
        .from('parents')
        .select('name, phone, email, city, contact_type, created_at')
        .eq('is_archived', false)
        .order('name', { ascending: true })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        name: r.name ?? '', phone: r.phone ?? '', email: r.email ?? '',
        city: r.city ?? '', contact_type: r.contact_type ?? '', created: fmtDate(r.created_at),
      }))
    },
  },

  tasks: {
    sheet: 'פניות',
    columns: [
      { header: 'סוג', key: 'type', width: 18 },
      { header: 'תיאור', key: 'description', width: 50 },
      { header: 'סטטוס', key: 'status', width: 14 },
      { header: 'עדיפות', key: 'priority', width: 12 },
      { header: 'הורה', key: 'parent', width: 22 },
      { header: 'נוצר', key: 'created', width: 16 },
    ],
    build: async (supabase) => {
      const { data } = await supabase
        .from('tasks')
        .select('type, description, status, priority, created_at, parent:parents(name)')
        .order('created_at', { ascending: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        type: r.type ?? '', description: r.description ?? '', status: r.status ?? '',
        priority: r.priority ?? '', parent: one(r.parent)?.name ?? '', created: fmtDate(r.created_at),
      }))
    },
  },

  waiting: {
    sheet: 'רשימת המתנה',
    columns: [
      { header: 'מיקום בתור', key: 'pos', width: 12 },
      { header: 'ילד/ה', key: 'child', width: 22 },
      { header: 'הורה', key: 'parent', width: 22 },
      { header: 'טלפון', key: 'phone', width: 16 },
      { header: 'אזור', key: 'area', width: 16 },
      { header: 'נרשם בתאריך', key: 'created', width: 16 },
    ],
    build: async (supabase) => {
      const { data } = await supabase
        .from('registrations')
        .select('waiting_list_position, area_label, area_code, created_at, parent:parents(name, phone), child:children(name)')
        .not('waiting_list_position', 'is', null)
        .order('waiting_list_position', { ascending: true })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => {
        const p = one(r.parent), c = one(r.child)
        return {
          pos: r.waiting_list_position ?? '', child: c?.name ?? '',
          parent: p?.name ?? '', phone: p?.phone ?? '',
          area: r.area_label ?? r.area_code ?? '', created: fmtDate(r.created_at),
        }
      })
    },
  },

  participants: {
    sheet: 'רשימת נוכחות',
    columns: [
      { header: '#', key: 'idx', width: 6 },
      { header: 'מסגרת', key: 'framework', width: 22 },
      { header: 'שם הילד/ה', key: 'child', width: 22 },
      { header: 'כיתה', key: 'class_name', width: 12 },
      { header: 'הורה', key: 'parent', width: 22 },
      { header: 'טלפון', key: 'phone', width: 16 },
      { header: 'מייל', key: 'email', width: 26 },
    ],
    build: async (_supabase, params) => {
      const k = params.get('kind')
      const kind = k === 'צהרון' || k === 'קייטנה' ? k : undefined
      const rosters = await buildFrameworkRosters(kind)
      const fw = params.get('framework')
      const filtered = fw ? rosters.filter(r => r.frameworkName === fw) : rosters
      const rows: Record<string, unknown>[] = []
      let i = 0
      for (const r of filtered) {
        for (const p of r.participants) {
          rows.push({ idx: ++i, framework: r.frameworkName, child: p.childName, class_name: p.className, parent: p.parentName, phone: p.parentPhone, email: p.parentEmail })
        }
      }
      return rows
    },
  },

  // דף נוכחות לסימון ידני: שם + כיתה + עמודות תאריך ריקות (V) לכל יום בשבוע
  'attendance-sheet': {
    sheet: 'דף נוכחות',
    columns: (params) => [
      { header: '#', key: 'idx', width: 5 },
      { header: 'שם הילד/ה', key: 'child', width: 24 },
      { header: 'כיתה', key: 'class_name', width: 10 },
      ...weekDays(params.get('weekStart')).map(d => ({ header: d.label, key: d.key, width: 9 })),
      { header: 'הערות', key: 'notes', width: 20 },
    ],
    build: async (_supabase, params) => {
      const k = params.get('kind')
      const kind = k === 'צהרון' || k === 'קייטנה' ? k : undefined
      const rosters = await buildFrameworkRosters(kind)
      const fw = params.get('framework')
      const filtered = fw ? rosters.filter(r => r.frameworkName === fw) : rosters
      const rows: Record<string, unknown>[] = []
      let i = 0
      for (const r of filtered) {
        for (const p of r.participants) {
          rows.push({ idx: ++i, child: p.childName, class_name: p.className }) // עמודות התאריך נשארות ריקות לסימון
        }
      }
      return rows
    },
  },
}

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const type = params.get('type') || ''
  const report = REPORTS[type]
  if (!report) {
    return NextResponse.json(
      { error: 'type לא תקין', validTypes: Object.keys(REPORTS) },
      { status: 400 },
    )
  }

  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const rows = await report.build(supabase, params)
    const columns = typeof report.columns === 'function' ? report.columns(params) : report.columns
    const buf = await buildXlsx(report.sheet, columns, rows)

    const date = new Date().toISOString().slice(0, 10)
    const filename = encodeURIComponent(`${report.sheet}-${date}.xlsx`)

    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } catch (err) {
    console.error('[export] error:', err)
    const msg = err instanceof Error ? err.message : 'שגיאה'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
