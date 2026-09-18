// ─── מסלול הניהול של קורלי (אדמין) בוואטסאפ ──────────────────────────────────
// קורלי (וכל מספר אדמין) יכולה לנהל את המערכת ישירות מהוואטסאפ:
//   "ניהול"  → תפריט ניהול (פניות, מצב הורה, סיכום יומי, השתקה/החזרה)
//   "יציאה"  → חזרה למצב הורה-בודקת (הבדיקות כהורה ממשיכות כרגיל)
//   פקודות בזק מכל מצב: "החזר 05..." / "השתק 05..."
//
// הפרדת מצבים: מצב הניהול חי ב-bot_sessions (current_flow = admin_*). כל עוד
// קורלי בתוך מצב ניהול - שום הודעה לא מגיעה למסלולי ההורה. כל תשובת ניהול
// מסומנת 👩‍💼 כדי שתמיד יהיה ברור באיזה מצב היא.

import type { createServiceClient } from '@/lib/supabase/server'

type Supa = ReturnType<typeof createServiceClient>

const SITE_BASE = 'https://kids-fun-app-psi.vercel.app'

const ADMIN_MENU =
  `👩‍💼 *מסלול ניהול - Kids & Fun*\n\n` +
  `*1* - 📋 פניות פתוחות\n` +
  `*2* - 🔍 מצב הורה (טלפון או שם)\n` +
  `*3* - 📊 סיכום היום\n` +
  `*4* - 🔇 השתקת בוט לפונה\n` +
  `*5* - ▶️ החזרת בוט לפונה\n\n` +
  `*יציאה* - חזרה למצב הורה-בודקת 🧪`

// ⚠️ "מנהל" הוסר מהכניסה (אתגור 07/2026): הורה-בודק שכותב "מנהל" מתכוון
//    לדבר עם מנהל - לא לפתוח תפריט ניהול. נשארות מילים שהן חד-משמעית פקודה.
const ENTRY_RE = /^(ניהול|אדמין|תפריט ניהול)$/
const EXIT_RE  = /^(יציאה|סיום|חזרה|exit)$/i

// ─── עזרי פורמט ───────────────────────────────────────────────────────────────
function fmtPhone(p?: string | null): string {
  if (!p) return '-'
  return p.replace(/^\+?972/, '0')
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

// תחילת היום הנוכחי בשעון ישראל, כ-ISO (לסינון "היום" בשאילתות)
function startOfTodayIsraelISO(): string {
  const nowIL = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
  const offsetMs = Date.now() - nowIL.getTime()
  const midnightIL = new Date(nowIL.getFullYear(), nowIL.getMonth(), nowIL.getDate())
  return new Date(midnightIL.getTime() + offsetMs).toISOString()
}

// ─── session ניהול (על גבי bot_sessions הקיים) ───────────────────────────────
interface AdminState {
  flow: string
  taskIds?: string[]   // מיפוי מספרי הפריטים ברשימת הפניות האחרונה שהוצגה
}

async function loadAdminState(supabase: Supa, phone: string): Promise<AdminState | null> {
  const { data } = await supabase
    .from('bot_sessions')
    .select('current_flow, collected_data, expires_at')
    .eq('phone', phone).maybeSingle()
  if (!data?.current_flow?.startsWith('admin_')) return null
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null
  const collected = (data.collected_data ?? {}) as Record<string, unknown>
  return {
    flow: data.current_flow,
    taskIds: Array.isArray(collected.admin_task_ids) ? (collected.admin_task_ids as string[]) : undefined,
  }
}

async function saveAdminState(supabase: Supa, phone: string, state: AdminState | null): Promise<void> {
  if (!state) {
    await supabase.from('bot_sessions').delete().eq('phone', phone)
    return
  }
  const now = Date.now()
  await supabase.from('bot_sessions').upsert({
    phone,
    current_flow:    state.flow,
    collected_data:  state.taskIds ? { admin_task_ids: state.taskIds } : {},
    last_message_at: new Date(now).toISOString(),
    expires_at:      new Date(now + 30 * 60 * 1000).toISOString(),
  }, { onConflict: 'phone' })
}

// ─── פעולות ───────────────────────────────────────────────────────────────────

// 1 - פניות פתוחות (ממוינות: דחוף → גבוה → רגיל, חדשות קודם)
async function listOpenTasks(supabase: Supa, phone: string): Promise<string> {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, type, description, priority, created_at, parents(name, phone)')
    .eq('status', 'פתוח')
    .order('created_at', { ascending: false })
    .limit(30)

  if (!tasks?.length) {
    await saveAdminState(supabase, phone, { flow: 'admin_menu' })
    return `👩‍💼 אין פניות פתוחות - הכל טופל! 🎉\n\n${ADMIN_MENU}`
  }

  const weight = (p: string) => (p === 'דחוף' ? 0 : p === 'גבוה' ? 1 : 2)
  const sorted = [...tasks].sort((a, b) => weight(a.priority) - weight(b.priority)).slice(0, 8)

  const lines = sorted.map((t, i) => {
    const parent = (Array.isArray(t.parents) ? t.parents[0] : t.parents) as { name?: string; phone?: string } | null
    const dot = t.priority === 'דחוף' ? '🔴' : t.priority === 'גבוה' ? '🟠' : '🔵'
    const who = parent?.name ? `${parent.name} (${fmtPhone(parent.phone)})` : 'ללא הורה מזוהה'
    const desc = (t.description ?? '').replace(/\n/g, ' ').slice(0, 60)
    return `*${i + 1}* ${dot} ${t.type} - ${who}\n${desc}${(t.description?.length ?? 0) > 60 ? '…' : ''}`
  })

  await saveAdminState(supabase, phone, { flow: 'admin_tasks', taskIds: sorted.map(t => t.id) })

  return (
    `👩‍💼 *פניות פתוחות* (${tasks.length} סה"כ, מציגה עד 8):\n\n` +
    lines.join('\n\n') +
    `\n\n✏️ לסגירת פנייה: *סגור 1* (לפי המספר)\n*תפריט* - חזרה · *יציאה* - סיום`
  )
}

// סגירת פנייה לפי מספר מהרשימה האחרונה
async function closeTask(supabase: Supa, phone: string, state: AdminState, msg: string): Promise<string | null> {
  const m = msg.match(/^סגור\s+(\d{1,2})$/)
  if (!m) return null
  const idx = parseInt(m[1], 10) - 1
  const taskId = state.taskIds?.[idx]
  if (!taskId) return `👩‍💼 אין פנייה מספר ${m[1]} ברשימה. כתבי *1* להצגת הרשימה מחדש.`
  const { error } = await supabase.from('tasks').update({ status: 'טופל' }).eq('id', taskId)
  return error
    ? `👩‍💼 לא הצלחתי לסגור את הפנייה 😕 אפשר לנסות דרך הדשבורד.`
    : `👩‍💼 ✅ פנייה ${m[1]} נסגרה (סומנה "טופל").\n\nכתבי *1* לרשימה מעודכנת, *תפריט* לתפריט, או *יציאה*.`
}

// 2 - מצב הורה לפי טלפון או שם
async function parentStatus(supabase: Supa, adminPhone: string, query: string): Promise<string> {
  const digits = query.replace(/\D/g, '')
  let parent: { id: string; name: string | null; phone: string | null; payplus_recurring_status: string | null } | null = null

  if (digits.length >= 9) {
    const { phoneVariants } = await import('@/lib/phone')
    const { data } = await supabase
      .from('parents').select('id, name, phone, payplus_recurring_status')
      .in('phone', phoneVariants(query)).limit(1)
    parent = data?.[0] ?? null
  } else {
    const { data } = await supabase
      .from('parents').select('id, name, phone, payplus_recurring_status')
      .ilike('name', `%${query.trim()}%`).limit(2)
    if (data?.length === 1) parent = data[0]
    else if ((data?.length ?? 0) > 1) {
      await saveAdminState(supabase, adminPhone, { flow: 'admin_status_wait' })
      return `👩‍💼 מצאתי כמה הורים בשם דומה:\n${data!.map((p: { name: string | null; phone: string | null }) => `• ${p.name} (${fmtPhone(p.phone)})`).join('\n')}\n\nשלחי את מספר הטלפון המדויק 📱`
    }
  }

  await saveAdminState(supabase, adminPhone, { flow: 'admin_menu' })
  if (!parent) return `👩‍💼 לא מצאתי הורה לפי "${query}" 🤔\nאפשר לנסות שוב מהתפריט (*2*), או *יציאה*.`

  const [children, regs, lastPayment, openTasks] = await Promise.all([
    supabase.from('children').select('name, school').eq('parent_id', parent.id).limit(5),
    supabase.from('registrations').select('type, status').eq('parent_id', parent.id).limit(5),
    supabase.from('payments').select('status, amount, paid_at, failure_reason, created_at')
      .eq('parent_id', parent.id).order('created_at', { ascending: false }).limit(1),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('parent_id', parent.id).eq('status', 'פתוח'),
  ])

  const kidsLine = children.data?.length
    ? children.data.map((c: { name: string | null; school: string | null }) => `${c.name}${c.school ? ` (${c.school})` : ''}`).join(', ')
    : '-'
  const regsLine = regs.data?.length
    ? regs.data.map((r: { type: string | null; status: string | null }) => `${r.type}: ${r.status}`).join(' · ')
    : 'אין רישומים'
  const pay = lastPayment.data?.[0]
  const payLine = pay
    ? `${pay.status}${pay.amount ? ` ₪${pay.amount}` : ''} (${fmtDate(pay.paid_at ?? pay.created_at)})${pay.failure_reason ? ` - ${pay.failure_reason}` : ''}`
    : 'אין תשלומים רשומים'
  const hokLine = parent.payplus_recurring_status === 'active' ? 'פעילה ✅'
    : parent.payplus_recurring_status === 'failed' ? 'כשל חיוב 🔴'
    : parent.payplus_recurring_status === 'expired' ? 'כרטיס פג תוקף 🟡'
    : '-'

  return (
    `👩‍💼 *${parent.name ?? 'ללא שם'}* · ${fmtPhone(parent.phone)}\n\n` +
    `👧 ילדים: ${kidsLine}\n` +
    `📝 רישומים: ${regsLine}\n` +
    `💳 תשלום אחרון: ${payLine}\n` +
    `🏦 הוראת קבע: ${hokLine}\n` +
    `📌 פניות פתוחות: ${openTasks.count ?? 0}\n\n` +
    `💬 לשיחה המלאה: ${SITE_BASE}/c/${parent.id}\n\n` +
    `*תפריט* - חזרה · *יציאה* - סיום`
  )
}

// 3 - סיכום היום (שעון ישראל)
async function dailySummary(supabase: Supa, phone: string): Promise<string> {
  const since = startOfTodayIsraelISO()

  const [convs, escalations, newTasks, closedTasks, regs, failures] = await Promise.all([
    supabase.from('conversations').select('phone').eq('direction', 'נכנס').gte('created_at', since),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).gte('created_at', since).in('priority', ['דחוף', 'גבוה']),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'טופל').gte('updated_at', since),
    supabase.from('registrations').select('id', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'פתוח').eq('type', 'כשל תשלום'),
  ])

  const incoming = convs.data ?? []
  const uniqueParents = new Set(incoming.map((c: { phone: string | null }) => c.phone)).size

  await saveAdminState(supabase, phone, { flow: 'admin_menu' })
  return (
    `👩‍💼 *סיכום היום* 📊\n\n` +
    `💬 הודעות נכנסות: ${incoming.length} (מ-${uniqueParents} פונים)\n` +
    `📌 פניות חדשות: ${newTasks.count ?? 0} (מהן דחופות/גבוהות: ${escalations.count ?? 0})\n` +
    `✅ פניות שנסגרו: ${closedTasks.count ?? 0}\n` +
    `📝 רישומים חדשים: ${regs.count ?? 0}\n` +
    `💳 כשלי תשלום פתוחים (סה"כ): ${failures.count ?? 0}\n\n` +
    `*תפריט* - חזרה · *יציאה* - סיום`
  )
}

// 4/5 - השתקה/החזרה של הבוט לפונה.
// ⚠️ פקודת בזק - לא נוגעת במצב ה-session: אם קורלי באמצע בדיקת-הורה היא נשארת שם,
//    ואם היא במצב ניהול היא נשארת בו. כך "החזר 05..." לא גורר אותה לתפריט בלי כוונה.
async function muteOrResume(supabase: Supa, adminPhone: string, targetRaw: string, action: 'mute' | 'resume'): Promise<string> {
  const phoneMatch = targetRaw.match(/972\d{8,9}|0\d{8,9}/)
  if (!phoneMatch) {
    return action === 'mute'
      ? `👩‍💼 לא זיהיתי מספר. כתבי: *השתק 0541234567*`
      : `👩‍💼 לא זיהיתי מספר. כתבי: *החזר 0541234567*`
  }
  const { getUserNsByPhone, pauseBot, resumeBot } = await import('@/lib/uchat')
  const targetNs = await getUserNsByPhone(phoneMatch[0])
  if (!targetNs) return `👩‍💼 לא מצאתי פונה פעיל עם המספר ${phoneMatch[0]} 🤔`
  const ok = action === 'mute' ? await pauseBot(targetNs) : await resumeBot(targetNs)
  if (!ok) return `👩‍💼 הייתה תקלה מול uChat 😕 אפשר לנסות שוב או דרך המערכת.`
  return action === 'mute'
    ? `👩‍💼 🔇 הבוט הושתק עבור ${phoneMatch[0]} - עכשיו את מדברת איתו ישירות.\nלהחזרה: *החזר ${phoneMatch[0]}*`
    : `👩‍💼 ▶️ הבוט חזר לפעולה עבור ${phoneMatch[0]} 💛`
}

// ─── עוזרת AI לניהול - שאלות חופשיות בתוך מצב ניהול ──────────────────────────
// משוב עינת (05/07): התפריט לבד "לא חכם" - "תפרט לי מה ההודעות?" נתקל ב"לא הבנתי".
// כל קלט שאינו מספר/פקודה נשלח ל-Claude עם תמונת-מצב חיה של המערכת.

async function buildAdminContext(supabase: Supa): Promise<string> {
  const since = startOfTodayIsraelISO()
  const [tasksRes, convsRes, regsRes, failuresRes] = await Promise.all([
    supabase.from('tasks')
      .select('type, description, priority, created_at, parents(name, phone)')
      .eq('status', 'פתוח').order('created_at', { ascending: false }).limit(30),
    supabase.from('conversations')
      .select('phone, message_text, created_at, parents:parent_id(name)')
      .eq('direction', 'נכנס').gte('created_at', since)
      .order('created_at', { ascending: true }).limit(25),
    supabase.from('registrations').select('id', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'פתוח').eq('type', 'כשל תשלום'),
  ])

  const weight = (p: string) => (p === 'דחוף' ? 0 : p === 'גבוה' ? 1 : 2)
  const tasks = [...(tasksRes.data ?? [])].sort((a, b) => weight(a.priority) - weight(b.priority))
  const taskLines = tasks.map((t, i) => {
    const parent = (Array.isArray(t.parents) ? t.parents[0] : t.parents) as { name?: string; phone?: string } | null
    return `${i + 1}. [${t.priority}] ${t.type} - ${parent?.name ?? 'ללא הורה'} (${fmtPhone(parent?.phone)}): ${(t.description ?? '').replace(/\n/g, ' ').slice(0, 120)} (${fmtDate(t.created_at)})`
  })

  const convLines = (convsRes.data ?? []).map((c: { phone: string | null; message_text: string | null; created_at: string; parents: unknown }) => {
    const parent = (Array.isArray(c.parents) ? c.parents[0] : c.parents) as { name?: string } | null
    return `- ${fmtDate(c.created_at)} · ${parent?.name ?? fmtPhone(c.phone)}: "${(c.message_text ?? '').replace(/\n/g, ' ').slice(0, 100)}"`
  })

  return (
    `== פניות פתוחות (${taskLines.length}) ==\n${taskLines.join('\n') || 'אין'}\n\n` +
    `== הודעות נכנסות היום (${convLines.length}) ==\n${convLines.join('\n') || 'אין'}\n\n` +
    `== מספרים ==\nרישומים חדשים היום: ${regsRes.count ?? 0} | כשלי תשלום פתוחים: ${failuresRes.count ?? 0}`
  )
}

async function adminLLM(supabase: Supa, phone: string, question: string, currentFlow: string): Promise<string> {
  // רענון תוקף המצב (שלא יפוג באמצע שיחה)
  await saveAdminState(supabase, phone, { flow: currentFlow })
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const context = await buildAdminContext(supabase)

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      system:
        `את עוזרת הניהול של "Kids & Fun" (צהרונים וקייטנות), עונה לנציגה קורלי בוואטסאפ.\n` +
        `כללים:\n` +
        `• עברית בלבד, קצר וברור, פתיחה ב-👩‍💼. מותר אמוג'י מדוד.\n` +
        `• פורמט וואטסאפ בלבד: הדגשה עם *כוכבית בודדת* (לא **כפולה**), בלי כותרות #, בלי טבלאות. ענייני ותמציתי - עד ~12 שורות.\n` +
        `• עני *רק* לפי נתוני המערכת שלמטה - אל תמציאי כלום. אם אין תשובה בנתונים, אמרי בכנות והפני לדשבורד.\n` +
        `• לשאלה על הורה ספציפי שלא בנתונים - הציעי לכתוב את הטלפון או השם המלא (אפשרות 2 בתפריט).\n` +
        `• מספרי הפניות ברשימה תואמים ל"סגור N".\n\n` +
        `== נתוני המערכת (עדכני לעכשיו) ==\n${context}`,
      messages: [{ role: 'user', content: question }],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
    if (text) return `${text}\n\n*תפריט* - חזרה · *יציאה* - סיום`
  } catch (err) {
    console.error('[admin-llm] failed:', err)
  }
  return `👩‍💼 לא הצלחתי לעבד את השאלה כרגע 😕 אפשר לבחור מהתפריט:\n\n${ADMIN_MENU}`
}

// ─── הנתב הראשי ───────────────────────────────────────────────────────────────
// מחזיר טקסט תשובה אם ההודעה טופלה כניהול, או null → ממשיכה למסלול ההורה הרגיל.
export async function handleAdminFlow(supabase: Supa, phone: string, message: string): Promise<string | null> {
  const msg = message.trim()
  const state = await loadAdminState(supabase, phone)

  // פקודות בזק - עובדות מכל מצב, בלי להיכנס לתפריט.
  // ⚠️ לא להשתמש ב-\b אחרי עברית - word boundary ב-JS הוא ASCII בלבד ולא נתפס.
  // ⚠️ תנאי (אתגור 07/2026): רק אם יש מספר טלפון בהודעה או שאנחנו במצב ניהול.
  //    אחרת "החזר לי את הכסף" מהורה-בודק היה נתפס כפקודת אדמין (קטגוריה 21).
  const hasPhone = /972\d{8,9}|0\d{8,9}/.test(msg)
  if (/^(החזר|להחזיר|resume)(\s|$)/i.test(msg) && (hasPhone || state)) {
    return muteOrResume(supabase, phone, msg, 'resume')
  }
  if (/^(השתק|להשתיק|mute|עצור בוט)(\s|$)/i.test(msg) && (hasPhone || state)) {
    return muteOrResume(supabase, phone, msg, 'mute')
  }

  // "סגור N" אחרי שמצב הניהול פג (30 דק') - הכוונה ברורה, לא שולחים למסלול הורה
  if (!state && /^סגור\s+\d{1,2}$/.test(msg)) {
    return `👩‍💼 מצב הניהול הסתיים (עברו 30 דקות) ⏳\nכתבי *ניהול*, ואז *1* להצגת הרשימה מחדש - ואז אפשר לסגור.`
  }

  // כניסה למצב ניהול
  if (ENTRY_RE.test(msg)) {
    await saveAdminState(supabase, phone, { flow: 'admin_menu' })
    return ADMIN_MENU
  }

  // לא במצב ניהול ולא ביקשה להיכנס → מסלול הורה רגיל
  if (!state) return null

  // יציאה ממצב ניהול
  if (EXIT_RE.test(msg)) {
    await saveAdminState(supabase, phone, null)
    return `✅ יצאת ממצב ניהול - חזרת למצב הורה-בודקת 🧪\nלחזרה: כתבי *ניהול*`
  }

  // חזרה לתפריט
  if (/^(תפריט|menu)$/i.test(msg)) {
    await saveAdminState(supabase, phone, { flow: 'admin_menu' })
    return ADMIN_MENU
  }

  // סגירת פנייה (אחרי שהוצגה רשימה)
  if (state.flow === 'admin_tasks') {
    const closed = await closeTask(supabase, phone, state, msg)
    if (closed) return closed
    // מספר בודד ברשימת פניות = בחירה מהתפריט (נופל להמשך)
  }

  // המתנה לקלט "מצב הורה"
  if (state.flow === 'admin_status_wait' && !/^[1-5]$/.test(msg)) {
    return parentStatus(supabase, phone, msg)
  }

  // בחירות תפריט
  switch (msg) {
    case '1': return listOpenTasks(supabase, phone)
    case '2':
      await saveAdminState(supabase, phone, { flow: 'admin_status_wait' })
      return `👩‍💼 שלחי טלפון או שם של ההורה 🔍`
    case '3': return dailySummary(supabase, phone)
    case '4':
      await saveAdminState(supabase, phone, { flow: 'admin_menu' })
      return `👩‍💼 את מי להשתיק? כתבי: *השתק 0541234567* 🔇`
    case '5':
      await saveAdminState(supabase, phone, { flow: 'admin_menu' })
      return `👩‍💼 את מי להחזיר? כתבי: *החזר 0541234567* ▶️`
  }

  // שאלה חופשית בתוך מצב ניהול → עוזרת ה-AI עם נתוני המערכת החיים
  // (לא דולף למסלול הורה; משוב עינת 05/07 - "חייב מסלול שהוא גם חכם")
  return adminLLM(supabase, phone, msg, state.flow)
}
