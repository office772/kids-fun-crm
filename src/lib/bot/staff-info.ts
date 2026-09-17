// ─── פרטי הצוות/המסגרת של ההורה — כהקשר ל-LLM ────────────────────────────────
// לא מסלול נפרד: המידע מוזרק לתוך ההקשר של הבוט, כדי שכשהורה שואל על הגן/הצוות
// שלו (או כל דבר) — הבוט "יודע" גם את זה ויכול לשלב בתשובה.
import { createServiceClient } from '@/lib/supabase/server'
import { phoneVariants } from '@/lib/phone'

function nameMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  const x = a.trim(), y = b.trim()
  return x === y || x.includes(y) || y.includes(x)
}

function one<T>(x: T | T[] | null | undefined): T | undefined {
  return Array.isArray(x) ? x[0] : (x ?? undefined)
}

// מחזיר משפט הקשר עם המסגרת+צוות של ההורה, או null אם לא ניתן לזהות.
export async function buildStaffContext(phone: string): Promise<string | null> {
  if (!phone) return null
  const supabase = createServiceClient()
  const cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '972')

  const { data: parents } = await supabase
    .from('parents')
    .select('id, children:children(name, school, framework)')
    .or(`phone.eq.${cleanPhone},phone.eq.${phone}`)
    .limit(1)
  const parent = one(parents as unknown as { children?: unknown }[])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children = ((parent?.children ?? []) as any[])
  if (children.length === 0) return null

  const { data: fwsRaw } = await supabase
    .from('frameworks')
    .select('name, type, is_active, staff:framework_staff(name, role, is_active)')
    .eq('is_active', true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fws = (fwsRaw ?? []) as any[]

  const parts: string[] = []
  for (const child of children) {
    if (!child.school) continue
    const match = fws.find(fw =>
      nameMatch(child.school, fw.name) &&
      (child.framework === 'שניהם' || !child.framework || child.framework === fw.type)
    )
    if (!match) {
      parts.push(`${child.name} רשום/ה ל${child.school}.`)
      continue
    }
    const staff = ((match.staff ?? []) as { name: string; role?: string; is_active: boolean }[])
      .filter(s => s.is_active !== false && s.name)
      .map(s => `${s.name}${s.role ? ` (${s.role})` : ''}`)
    if (staff.length > 0) {
      parts.push(`${child.name} במסגרת "${match.name}" (${match.type}); הצוות: ${staff.join(', ')}.`)
    } else {
      parts.push(`${child.name} במסגרת "${match.name}" (${match.type}).`)
    }
  }

  if (parts.length === 0) return null
  return 'מסגרת/צוות ההורה (השתמש במידע הזה אם ההורה שואל על הגן/הצוות שלו; אל תמציא פרטים שאינם כאן): ' + parts.join(' ')
}

// ─── הקשר רישומים/תשלומים של ההורה — כהקשר ל-LLM ─────────────────────────────
// נמצא בלוגים (09/2026): הבוט הציג "ראיתי שיש לכם רישום: נועם בירן", ודקות אחר כך
// ענה "אני לא יודעת לגשת לנתוני הרישום" והעביר לקורלי — כי ל-LLM לא הוזרקו
// הרישומים בכלל. כאן נבנה ההקשר הזה, ותמיד *במפורש* (יש רישום / אין רישום).
// ⚠️ כל חיפוש לפי טלפון חייב לעבור דרך phoneVariants (+972/972/0…).

interface ParentChildRow {
  id:         string
  name:       string
  school?:    string | null
  class_name?: string | null
  framework?: string | null
  area_code?: string | null
}

interface ParentRecord {
  id:       string
  name:     string | null
  children: ParentChildRow[]
}

async function loadParentByPhone(phone: string): Promise<ParentRecord | null> {
  if (!phone || phone === 'simulator') return null
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('parents')
    .select('id, name, children:children(id, name, school, class_name, framework, area_code)')
    .in('phone', phoneVariants(phone))
    .limit(1)
  const parent = one(data as unknown as ParentRecord[])
  if (!parent) return null
  return { ...parent, children: (parent.children ?? []) as ParentChildRow[] }
}

// placeholder = ילד/ה שיובא מ-PayPlus/חשבונית ירוקה בלי שם אמיתי ("—", "*", "?")
function isPlaceholderName(n?: string | null): boolean {
  if (!n) return true
  const t = n.trim()
  return t.length < 3 || ['—', '–', '-', '*', '?'].includes(t)
}

function childLine(c: ParentChildRow): string {
  const bits = [
    c.school     ? `מסגרת: ${c.school}`   : '',
    c.class_name ? `כיתה: ${c.class_name}` : '',
    c.framework  ? `סוג: ${c.framework}`   : '',
  ].filter(Boolean)
  return `${c.name}${bits.length ? ` (${bits.join(', ')})` : ''}`
}

export interface ParentContext {
  text:        string
  hasChildren: boolean
}

// מחזיר הקשר מלא על ההורה: ילדים, סטטוס רישום ותשלום אחרון.
// כשאין כלום — מחזיר משפט מפורש ("לא מצאתי רישום"), כדי שה-LLM יאמר את זה
// במקום להסלים לקורלי בטענה שאין לו גישה לנתונים.
export async function buildParentContext(phone: string): Promise<ParentContext | null> {
  if (!phone || phone === 'simulator') return null
  try {
    const parent = await loadParentByPhone(phone)
    if (!parent) {
      return {
        text: 'נתוני ההורה במערכת: מספר הטלפון הזה *לא נמצא* אצלנו — אין לך רישומים או תשלומים עליו. ' +
              'אם ההורה שואל אם נרשם — אמור בכנות שלא מצאת רישום על המספר הזה ובקש שם מלא של הילד/ה לבדיקה.',
        hasChildren: false,
      }
    }

    const supabase = createServiceClient()
    const kids = parent.children.filter(c => !isPlaceholderName(c.name))

    const { data: regsRaw } = await supabase
      .from('registrations')
      .select('child_id, type, status, area_label, created_at')
      .eq('parent_id', parent.id)
      .order('created_at', { ascending: false })
    const regs = (regsRaw ?? []) as Array<{
      child_id: string | null; type: string; status: string; area_label: string | null
    }>

    const { data: paysRaw } = await supabase
      .from('payments')
      .select('amount, status, payment_type, paid_at, created_at')
      .eq('parent_id', parent.id)
      .order('created_at', { ascending: false })
      .limit(1)
    const pay = (paysRaw ?? [])[0] as
      { amount: number | null; status: string; payment_type: string | null; paid_at: string | null } | undefined

    const lines: string[] = []
    lines.push(`נתוני ההורה במערכת${parent.name ? ` (${parent.name})` : ''}:`)

    if (kids.length === 0) {
      lines.push('• ההורה קיים אצלנו אבל *אין ילדים רשומים* על המספר הזה.')
    } else {
      for (const c of kids) {
        const childRegs = regs.filter(r => r.child_id === c.id)
        const regText = childRegs.length
          ? childRegs.map(r => `${r.type} — ${r.status}${r.area_label ? ` (${r.area_label})` : ''}`).join('; ')
          : 'אין רשומת רישום פורמלית, אבל הילד/ה קיים/ת אצלנו במערכת'
        lines.push(`• ${childLine(c)} — ${regText}.`)
      }
      lines.push(
        'כלומר: כן, יש רישום/ים אצלנו. אם ההורה שואל "האם X רשום" — ענה מהנתונים האלה בביטחון, ' +
        'ואל תעביר לקורלי רק בגלל השאלה הזו.'
      )
    }

    if (pay) {
      const when = pay.paid_at ? new Date(pay.paid_at).toLocaleDateString('he-IL') : ''
      lines.push(
        `• תשלום אחרון: ${pay.status}${pay.amount ? ` — ₪${pay.amount}` : ''}` +
        `${pay.payment_type ? ` (${pay.payment_type})` : ''}${when ? `, ${when}` : ''}.`
      )
    } else {
      lines.push('• אין עדיין רשומת תשלום פעילה.')
    }

    return { text: lines.join('\n'), hasChildren: kids.length > 0 }
  } catch (err) {
    console.error('[buildParentContext] error:', err)
    return null
  }
}

// ─── מסלול מהיר: "האם נרשמתי / האם זה נשמר?" ─────────────────────────────────
// עונה ישירות מה-DB במקום להעביר לקורלי. מחזיר null כשאין מה לענות
// (ואז ה-LLM עונה עם ההקשר של buildParentContext — בלי הסלמה).
// question: ניסוח ההורה. אם נשאל על *קייטנה* — עונים רק על רישומי קייטנה,
// אחרת ההורה קיבל "כן, נרשמת!" בזמן שהרישום שבידינו הוא לצהרון (אתגור 17.9).
export async function buildRegistrationStatusAnswer(phone: string, question?: string): Promise<string | null> {
  if (!phone || phone === 'simulator') return null
  try {
    const parent = await loadParentByPhone(phone)
    const kids = (parent?.children ?? []).filter(c => !isPlaceholderName(c.name))
    if (!parent || kids.length === 0) return null

    const supabase = createServiceClient()
    const { data: regsRaw } = await supabase
      .from('registrations')
      .select('child_id, type, status, area_label, created_at')
      .eq('parent_id', parent.id)
      .order('created_at', { ascending: false })
    const regs = (regsRaw ?? []) as Array<{
      child_id: string | null; type: string; status: string; area_label: string | null
    }>

    // ── שאלה על קייטנה → רק רישומי קייטנה ────────────────────────────────────
    const asksCamp = /קייטנ|קיטנ|קמפ/.test(question ?? '')
    if (asksCamp) {
      const campRegs = regs.filter(r => r.type === 'קייטנה')
      if (campRegs.length === 0) {
        const tzaharon = regs.filter(r => r.type === 'צהרון')
        const names = kids
          .filter(c => tzaharon.some(r => r.child_id === c.id))
          .map(c => c.name)
        return (
          `בדקתי — *לא מצאתי רישום לקייטנה* על המספר הזה 🤔\n\n` +
          (names.length
            ? `לצהרון כן רשום/ים אצלנו: *${names.join(', ')}*.\n\n`
            : '') +
          `הרישום לקייטנה מתבצע דרך האתר. אם נרשמתם לאחרונה — כתבו לי ונבדוק שוב 💛`
        )
      }
      const campBlocks = kids
        .filter(c => campRegs.some(r => r.child_id === c.id))
        .map(c => {
          const r = campRegs.find(x => x.child_id === c.id)!
          return `✅ *${c.name}* — קייטנה, סטטוס: *${r.status}*${r.area_label ? ` (${r.area_label})` : ''}`
        })
      return (
        `בדקתי אצלנו — הרישום לקייטנה *נקלט* 💛\n\n` +
        campBlocks.join('\n\n') +
        `\n\nאם משהו לא נכון — כתבו לי ונתקן 😊`
      )
    }

    const blocks = kids.map(c => {
      const r = regs.find(x => x.child_id === c.id)
      const details = [
        c.school     && `מסגרת: *${c.school}*`,
        c.class_name && `כיתה: *${c.class_name}*`,
        r            && `סטטוס: *${r.status}*${r.area_label ? ` (${r.area_label})` : ''}`,
        !r && c.framework && `רשום/ה ל*${c.framework}*`,
      ].filter(Boolean).join('\n')
      return `✅ *${c.name}*${details ? `\n${details}` : ''}`
    })

    return (
      `בדקתי אצלנו — הפרטים שלכם *נשמרו* 💛\n\n` +
      blocks.join('\n\n') +
      `\n\nאם משהו לא נכון או שחסר פרט — כתבו לי ונתקן 😊`
    )
  } catch (err) {
    console.error('[buildRegistrationStatusAnswer] error:', err)
    return null
  }
}
