import { createServiceClient } from '@/lib/supabase/server'

// ─── אזורים ────────────────────────────────────────────────────────────────
export const AREAS: Record<string, { label: string; formLink: string }> = {
  sharon:  { label: 'דרום השרון / חוף השרון', formLink: 'https://kidsandfun.co.il/register-sharon/' },
  carmel:  { label: 'חוף הכרמל',              formLink: 'https://kidsandfun.co.il/%d7%98%d7%95%d7%a4%d7%a1-%d7%a8%d7%99%d7%a9%d7%95%d7%9d-%d7%9c%d7%a6%d7%94%d7%a8%d7%95%d7%a0%d7%99%d7%9d-%d7%97%d7%95%d7%a3-%d7%94%d7%9b%d7%a8%d7%9e%d7%9c/' },
  telaviv: { label: 'גני ילדים תל אביב',      formLink: 'https://kidsandfun.co.il/%d7%98%d7%95%d7%a4%d7%a1-%d7%a8%d7%99%d7%a9%d7%95%d7%9d-%d7%9c%d7%a6%d7%94%d7%a8%d7%95%d7%a0%d7%99-%d7%aa%d7%9c-%d7%90%d7%91%d7%99%d7%91/' },
}

export function areaFromMessage(msg: string): string | null {
  const m = msg.trim()
  if (m === '1' || /שרון|דרום|חוף השרון/i.test(m))  return 'sharon'
  if (m === '2' || /כרמל/i.test(m))                  return 'carmel'
  if (m === '3' || /תל אביב|תלאביב|גן|גני/i.test(m)) return 'telaviv'
  return null
}

// ─── בדיקת קיבולת ──────────────────────────────────────────────────────────
export async function checkCapacity(areaCode: string): Promise<{
  hasSpots:            boolean
  available:           number
  maxCapacity:         number
  waitingListPosition: number
  formLink:            string
  areaName:            string
}> {
  const supabase = createServiceClient()

  // שלוף הגדרות אזור מ-branches
  const { data: branch } = await supabase
    .from('branches')
    .select('id, name, max_capacity, form_link')
    .eq('area_code', areaCode)
    .maybeSingle()

  const maxCapacity  = branch?.max_capacity ?? 30
  const formLinkDB   = branch?.form_link    ?? AREAS[areaCode]?.formLink ?? ''
  const areaName     = branch?.name         ?? AREAS[areaCode]?.label   ?? ''

  // ספור רישומים פעילים
  const { count: registered } = await supabase
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('area_code', areaCode)
    .eq('type', 'צהרון')
    .in('status', ['ממתין לאישור', 'מאושר'])

  // ספור רשימת המתנה
  const { count: waiting } = await supabase
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('area_code', areaCode)
    .eq('type', 'צהרון')
    .eq('status', 'רשימת המתנה')

  const available = Math.max(0, maxCapacity - (registered ?? 0))

  return {
    hasSpots:            available > 0,
    available,
    maxCapacity,
    waitingListPosition: (waiting ?? 0) + 1,
    formLink:            formLinkDB,
    areaName,
  }
}

// ─── שמירת רשימת המתנה ─────────────────────────────────────────────────────
export async function saveWaitingListEntry(params: {
  phone:      string
  parentName: string
  childName:  string
  className:  string
  areaCode:   string
}): Promise<{ position: number }> {
  const supabase = createServiceClient()
  const cleanPhone = params.phone.replace(/\D/g, '').replace(/^0/, '972')

  // צור / מצא הורה
  let { data: parent } = await supabase
    .from('parents')
    .select('id')
    .eq('phone', cleanPhone)
    .maybeSingle()

  if (!parent) {
    const { data: newParent } = await supabase
      .from('parents')
      .insert({ phone: cleanPhone, name: params.parentName })
      .select('id')
      .single()
    parent = newParent
  }

  if (!parent) return { position: 0 }

  // צור ילד
  const { data: child } = await supabase
    .from('children')
    .insert({
      parent_id:  parent.id,
      name:       params.childName,
      class_name: params.className,
      framework:  'צהרון',
      area_code:  params.areaCode,
    })
    .select('id')
    .single()

  // ספור מיקום ברשימה
  const { count: waitingCount } = await supabase
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('area_code', params.areaCode)
    .eq('type', 'צהרון')
    .eq('status', 'רשימת המתנה')

  const position = (waitingCount ?? 0) + 1

  // שמור רישום
  await supabase.from('registrations').insert({
    parent_id:             parent.id,
    child_id:              child?.id,
    type:                  'צהרון',
    status:                'רשימת המתנה',
    area_code:             params.areaCode,
    waiting_list_position: position,
    notes:                 `נוסף לרשימת המתנה דרך הבוט`,
  })

  return { position }
}

// ─── בניית קישור לטופס הפנימי ──────────────────────────────────────────────
export function buildRegisterLink(params: {
  areaCode:   string
  childName?: string
  className?: string
  phone?:     string
}): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
  const url  = new URL('/register', base)
  url.searchParams.set('area', params.areaCode)
  if (params.childName) url.searchParams.set('child', params.childName)
  if (params.className) url.searchParams.set('class', params.className)
  if (params.phone)     url.searchParams.set('phone', params.phone)
  return url.toString()
}
