// ─── רשימת משתתפים / נוכחות לפי מסגרת ────────────────────────────────────────
// צהרון: קבוצה לפי מסגרות (frameworks type=צהרון), התאמה לפי child.school.
// קייטנה: קבוצה לפי שם הקייטנה (child.program מ-WooCommerce), צוות ממסגרת תואמת.
// משמש את מודולי הנוכחות בדשבורד + ה-cron השבועי ששולח מייל לצוות (רק אם יש
// צוות פעיל עם מייל; מסגרת בלי צוות → לא נשלחת).
// ─────────────────────────────────────────────────────────────────────────────

import { createServiceClient } from '@/lib/supabase/server'

export type FrameworkKind = 'צהרון' | 'קייטנה'

export interface Participant {
  childName:   string
  className:   string
  parentName:  string
  parentPhone: string
  parentEmail: string
}

export interface FrameworkRoster {
  frameworkId:   string
  frameworkName: string
  areaCode:      string
  type:          string
  staffEmails:   { name: string; email: string }[]
  participants:  Participant[]
}

const ACTIVE_STATUSES = ['מאושר', 'פעיל']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function one(v: any) { return Array.isArray(v) ? v[0] : v }

function nameMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  const x = a.trim(), y = b.trim()
  return x === y || x.includes(y) || y.includes(x)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toParticipant(r: any): Participant {
  const c = one(r.child), p = one(r.parent)
  return {
    childName:   c?.name ?? '',
    className:   c?.class_name ?? '',
    parentName:  p?.name ?? '',
    parentPhone: p?.phone ?? '',
    parentEmail: p?.email ?? '',
  }
}

const byName = (a: Participant, b: Participant) => a.childName.localeCompare(b.childName, 'he')

// kind לא מצוין → מחזיר את שני הסוגים יחד (ל-cron השבועי).
export async function buildFrameworkRosters(kind?: FrameworkKind): Promise<FrameworkRoster[]> {
  const supabase = createServiceClient()

  const [{ data: fwsRaw }, { data: regs }] = await Promise.all([
    supabase
      .from('frameworks')
      .select('id, name, area_code, type, is_active, staff:framework_staff(name, email, is_active)')
      .eq('is_active', true),
    supabase
      .from('registrations')
      .select('status, area_code, parent:parents(name, phone, email), child:children(name, class_name, school, program, framework)')
      .in('status', ACTIVE_STATUSES),
  ])

  const fws = (fwsRaw ?? []) as any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  const allRegs = (regs ?? []) as any[] // eslint-disable-line @typescript-eslint/no-explicit-any

  const staffEmailsOf = (fw: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
    ((fw?.staff ?? []) as { name: string; email: string | null; is_active: boolean }[])
      .filter(s => s.is_active && s.email && s.email.includes('@'))
      .map(s => ({ name: s.name, email: s.email as string }))

  const rosters: FrameworkRoster[] = []

  // ── צהרון: לפי מסגרות, התאמה ב-child.school ──────────────────────────────
  if (!kind || kind === 'צהרון') {
    for (const fw of fws.filter(f => f.type === 'צהרון')) {
      const participants = allRegs
        .filter(r => one(r.child)?.framework === 'צהרון' && nameMatch(one(r.child)?.school, fw.name))
        .map(toParticipant)
        .sort(byName)
      rosters.push({
        frameworkId: fw.id, frameworkName: fw.name, areaCode: fw.area_code, type: 'צהרון',
        staffEmails: staffEmailsOf(fw), participants,
      })
    }
  }

  // ── קייטנה: לפי שם הקייטנה (child.program), צוות ממסגרת תואמת ──────────────
  if (!kind || kind === 'קייטנה') {
    const campFws = fws.filter(f => f.type === 'קייטנה')
    const campRegs = allRegs.filter(r => one(r.child)?.framework === 'קייטנה')
    const byProgram = new Map<string, any[]>() // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const r of campRegs) {
      const prog = (one(r.child)?.program ?? '').trim()
      if (!prog) continue
      if (!byProgram.has(prog)) byProgram.set(prog, [])
      byProgram.get(prog)!.push(r)
    }
    for (const [program, list] of Array.from(byProgram.entries())) {
      const matchFw = campFws.find(f => nameMatch(f.name, program))
      rosters.push({
        frameworkId: matchFw?.id ?? `camp:${program}`,
        frameworkName: program,
        areaCode: matchFw?.area_code ?? '',
        type: 'קייטנה',
        staffEmails: matchFw ? staffEmailsOf(matchFw) : [],
        participants: list.map(toParticipant).sort(byName),
      })
    }
  }

  return rosters
}
