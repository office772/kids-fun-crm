import { BotSession } from '@/lib/types'
import {
  createPayPlusPaymentLink,
  getInvoiceLink,
  formatBankTransferMessage,
  loadParentRegistrationContext,
  getPaymentStatusByPhone,
  getPaymentStatusByChildName,
  DEFAULT_MONTHLY_FEE,
  type PaymentMethod,
} from './payment-helpers'

export interface BotResponse {
  text: string
  escalate?: boolean
  createTask?: {
    type: string
    description: string
    priority: 'דחוף' | 'גבוה' | 'רגיל'
  }
  nextFlow?: string
  isComplete?: boolean
}

const BOT_NAME = 'Kids & Fun'

// ─── utils ────────────────────────────────────────────────────────────────────
export function isBusinessHours(): boolean {
  const now = new Date()
  const day = now.getDay() // 0=ראשון
  const hour = now.getHours()
  return [0, 1, 2, 3, 4].includes(day) && hour >= 8 && hour < 17
}

function isYes(msg: string): boolean {
  return /^(כן|אכן|בטח|כן בבקשה|רוצה|אוקי|ok|yes|מאשר|מאשרת|בסדר|טוב|ברור|בטח שכן|בהחלט)/i.test(msg.trim())
}

function isNo(msg: string): boolean {
  return /^(לא|לא רוצה|לא תודה|no|אין צורך|לא עכשיו)/i.test(msg.trim())
}

const MENU_TEXT =
  `*1* — רישום לצהרון\n` +
  `*2* — רישום לקייטנה\n` +
  `*3* — ביטול\n` +
  `*4* — שעות ולוח זמנים\n` +
  `*5* — תשלומים\n` +
  `*6* — איסוף מוקדם`


// ─── ברכה ─────────────────────────────────────────────────────────────────────
export function buildWelcomeMessage(parentName?: string): string {
  const greeting = parentName ? `היי ${parentName.split(' ')[0]} 😊\n\n` : `שלום! 😊\n\n`
  return greeting +
    `כאן ${BOT_NAME}! איך אפשר לעזור?\n\n` +
    MENU_TEXT +
    `\n\nאו פשוט כתוב/י מה צריך 💬`
}

// ─── לא הבנתי ─────────────────────────────────────────────────────────────────
export function buildDidNotUnderstand(): string {
  return `לא הצלחתי להבין 😊\n\nאפשר לבחור מהתפריט:\n\n` + MENU_TEXT
}

// ─── הסלמה לנציג ─────────────────────────────────────────────────────────────
export function buildEscalationMessage(): string {
  if (isBusinessHours()) {
    return `בוקר טוב! העברתי את פנייתך לנציגה שלנו — היא תחזור אליך בהקדם 💛`
  }
  return `קיבלתי! הפנייה שלך תועברת לנציגה בשעות הפעילות (ראשון-חמישי 8:00-17:00) 📬\n\nלילה טוב! 🌙`
}

// ─── פנייה יזומה (מהמערכת) ───────────────────────────────────────────────────
// זו ההודעה שהמערכת שולחת כשמזוהה כשל תשלום
export function buildProactivePaymentMessage(parentName: string): string {
  const firstName = parentName.split(' ')[0] || parentName
  return `היי ${firstName}, מה שלומך? 😊\n\n` +
    `הבנק ניסה לחייב אצלינו אבל הפעם לא הצלחנו לעבור.\n\n` +
    `אין מה לדאוג — פשוט צריך לסדר את זה ביחד 💛\n\n` +
    `האם החלפת כרטיס לאחרונה?\n` +
    `*1* — כן, יש לי כרטיס חדש\n` +
    `*2* — לא, תחזרו אלי קצת אחר כך\n` +
    `*3* — יש בעיה אחרת`
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 1: רישום לצהרון (async)
// שלבים: אזור → שם ילד → כיתה → בדיקת מקום (Supabase) → טופס / רשימת המתנה
// ═══════════════════════════════════════════════════════════════════════════════
export async function handleRegistrationFlow(session: BotSession, userMessage: string): Promise<BotResponse> {
  const step = session.currentFlow

  // ─── שלב התחלה: זיהוי לפי טלפון ── אם יש רישום קיים, להציג אותו ──────────
  if (!step || step === 'register_start') {
    if (session.phone && session.phone !== 'simulator') {
      try {
        const { createServiceClient } = await import('@/lib/supabase/server')
        const supabase = createServiceClient()
        const normalized = session.phone.replace(/\D/g, '').replace(/^972/, '0')
        const intl       = '972' + normalized.replace(/^0/, '')

        const { data: parent } = await supabase
          .from('parents')
          .select('id, name, children(id, name, class_name, area_code, framework)')
          .or(`phone.eq.${normalized},phone.eq.${intl},phone.eq.${session.phone}`)
          .maybeSingle()

        const tzaharonKids = (parent?.children ?? []).filter((c: { framework?: string }) =>
          c.framework === 'צהרון' || c.framework === 'שניהם'
        )

        if (tzaharonKids.length > 0) {
          const kidsText = tzaharonKids
            .map((k: { name: string; class_name?: string | null }) =>
              `• *${k.name}*${k.class_name ? ` (כיתה ${k.class_name})` : ''}`).join('\n')
          const firstName = parent?.name?.split(' ')[0] ?? ''
          return {
            text:
              `היי${firstName ? ' ' + firstName : ''}! 💛\n\nראיתי שיש לכם כבר רישום אצלנו:\n${kidsText}\n\n` +
              `*במה אפשר לעזור?*\n` +
              `*1* — לרשום ילד/ה נוסף/ת מהמשפחה\n` +
              `*2* — לעדכן פרטים של ילד קיים\n` +
              `*3* — לבדוק סטטוס תשלום\n` +
              `*4* — שאלה אחרת`,
            nextFlow: 'register_existing_parent',
          }
        }
      } catch (err) {
        console.error('[register_start] phone lookup error:', err)
      }
    }

    // הורה לא מזוהה / חדש → תהליך רישום רגיל
    return {
      text:
        `שמחים שאתם רוצים להצטרף למשפחת Kids & Fun! 🎉\n\n` +
        `*לאיזה אזור מבקשים רישום לצהרון?*\n\n` +
        `*1* — דרום השרון / חוף השרון\n` +
        `*2* — חוף הכרמל\n` +
        `*3* — גני ילדים תל אביב`,
      nextFlow: 'register_area',
    }
  }

  // ─── הורה מזוהה — בחירה מה לעשות ───────────────────────────────────────
  if (step === 'register_existing_parent') {
    const msg = userMessage.trim()
    if (msg === '1' || /נוסף|אח|אחות/i.test(msg)) {
      return {
        text: `מעולה! 🌟\n\nלאיזה אזור מבקשים לרשום?\n\n*1* — דרום השרון / חוף השרון\n*2* — חוף הכרמל\n*3* — גני ילדים תל אביב`,
        nextFlow: 'register_area',
      }
    }
    if (msg === '2' || /עדכון|לעדכן|פרטים|לשנות/i.test(msg)) {
      return {
        text: `בסדר 😊\n\n*מה תרצו לעדכן?* (לדוגמה: "להעביר את שם הילד לגלי עתלית", "אלרגיה חדשה", "שינוי בית ספר")`,
        nextFlow: 'register_update_details',
      }
    }
    if (msg === '3' || /סטטוס|תשלום/i.test(msg)) {
      session.currentFlow = 'payment_status_menu'
      return handlePaymentStatusFlow(session.parentName)
    }
    if (msg === '4' || /שאלה|אחר/i.test(msg)) {
      return {
        text: `בסדר גמור 😊\n\nכתבו את שאלתכם ונציגה תחזור אליכם בהקדם 💛`,
        nextFlow: 'register_existing_question',
      }
    }
    return {
      text:
        `לא הבנתי 😊\n\n` +
        `*1* — לרשום ילד/ה נוסף/ת\n*2* — לעדכן פרטים\n*3* — לבדוק סטטוס תשלום\n*4* — שאלה אחרת`,
      nextFlow: 'register_existing_parent',
    }
  }

  // עדכון פרטים → משימה לנציגה
  if (step === 'register_update_details') {
    return {
      text: `קיבלתי 💛\n\nנציגה תטפל בעדכון ותחזור אליכם לאישור!`,
      isComplete: true,
      createTask: {
        type:        'שאלה כללית',
        description: `עדכון פרטי רישום — "${userMessage.slice(0, 150)}" | טלפון פונה: ${session.phone}`,
        priority:    'גבוה',
      },
    }
  }

  if (step === 'register_existing_question') {
    return {
      text: `תודה! נציגה תחזור אליכם בהקדם 💛`,
      isComplete: true,
      createTask: {
        type:        'שאלה כללית',
        description: `שאלה מהורה קיים: "${userMessage.slice(0, 200)}" | טלפון: ${session.phone}`,
        priority:    'רגיל',
      },
    }
  }

  // ─── שלב אזור ────────────────────────────────────────────────────────────
  if (step === 'register_area') {
    const { areaFromMessage } = await import('./registration-helpers')
    const area = areaFromMessage(userMessage)
    if (!area) {
      return {
        text:
          `לא הבנתי 😊 אנא בחרו:\n\n` +
          `*1* — דרום השרון / חוף השרון\n` +
          `*2* — חוף הכרמל\n` +
          `*3* — גני ילדים תל אביב`,
        nextFlow: 'register_area',
      }
    }
    session.collectedData.area_code = area
    return {
      text: `מצוין! 💛\n\n*מה שם הילד/ה?* (שם פרטי + שם משפחה)`,
      nextFlow: 'register_child_name',
    }
  }

  // ─── שלב שם ילד ──────────────────────────────────────────────────────────
  if (step === 'register_child_name') {
    const trimmed = userMessage.trim()
    const parts = trimmed.split(/\s+/)
    if (parts.length < 2) {
      return {
        text: `אנא כתבו *שם פרטי ושם משפחה* ביחד (לדוגמה: נועה כהן) 😊`,
        nextFlow: 'register_child_name',
      }
    }
    session.collectedData.child_name = trimmed

    // ⚡ זיהוי משני: אולי הילד הזה כבר רשום אצלנו (גיבוי לטלפון לא-מזוהה)
    try {
      const { createServiceClient } = await import('@/lib/supabase/server')
      const supabase = createServiceClient()
      const { data: kids } = await supabase
        .from('children')
        .select('id, name, class_name, area_code, framework, parent_id')
        .ilike('name', trimmed)
        .limit(2)

      if (kids?.length === 1) {
        const kid = kids[0]

        // נחשיב את הילד כ"רשום פעיל" אם יש רישום פורמלי, או אם framework=צהרון
        // (חלק גדול מהילדים יובאו מאקסל בלי רשומת registrations)
        const isTzaharon = kid.framework === 'צהרון' || kid.framework === 'שניהם'

        const { data: reg } = await supabase
          .from('registrations')
          .select('status')
          .eq('child_id', kid.id).eq('type', 'צהרון')
          .in('status', ['מאושר', 'ממתין לאישור'])
          .order('created_at', { ascending: false }).limit(1).maybeSingle()

        // שם ההורה — לאישור זיהוי חוזר ("הורה רשום: ...")
        const { data: parentRec } = await supabase
          .from('parents').select('name').eq('id', kid.parent_id).maybeSingle()

        if (reg || isTzaharon) {
          const areaLabels: Record<string, string> = {
            sharon: 'דרום השרון / חוף השרון', carmel: 'חוף הכרמל', telaviv: 'תל אביב',
          }
          const areaName = kid.area_code ? (areaLabels[kid.area_code] ?? kid.area_code) : ''
          const lines = [
            kid.class_name && `כיתה: *${kid.class_name}*`,
            areaName && `אזור: *${areaName}*`,
            parentRec?.name && `הורה רשום: *${parentRec.name}*`,
            reg && `סטטוס: *${reg.status}*`,
          ].filter(Boolean).join('\n')

          return {
            text:
              `מצאתי! 💛\n\n*${kid.name}* כבר רשום/ה אצלנו:\n${lines}\n\n` +
              `*במה אפשר לעזור?*\n` +
              `*1* — לרשום ילד/ה נוסף/ת מהמשפחה\n` +
              `*2* — לעדכן פרטים של ${kid.name}\n` +
              `*3* — לבדוק סטטוס תשלום\n` +
              `*4* — שאלה אחרת`,
            nextFlow: 'register_existing_parent',
          }
        }
      }
    } catch (err) {
      console.error('[register_child_name] lookup error:', err)
    }

    // ילד חדש — המשך לשלב הכיתה
    return {
      text: `שם יפה 😊\n\n*באיזו כיתה לומד/ת ${trimmed}?*\n_(לדוגמה: א׳, ב׳, גן חובה)_`,
      nextFlow: 'register_class',
    }
  }

  // ─── שלב כיתה + בדיקת קיבולת ─────────────────────────────────────────────
  if (step === 'register_class') {
    session.collectedData.class_name = userMessage
    const childName = session.collectedData.child_name || 'הילד/ה'
    const areaCode  = session.collectedData.area_code  || 'sharon'

    const { checkCapacity, buildRegisterLink, AREAS } = await import('./registration-helpers')
    const capacity = await checkCapacity(areaCode)
    const areaLabel = AREAS[areaCode]?.label ?? areaCode

    if (capacity.hasSpots) {
      const formUrl = buildRegisterLink({
        areaCode,
        childName,
        className: userMessage,
        phone:     session.phone,
      })
      return {
        text:
          `בדקתי — *יש מקום* עבור ${childName} ב${areaLabel}! 🎉\n\n` +
          `📋 *למילוי הטופס הרשמי:*\n${formUrl}\n\n` +
          `בסיום מילוי הטופס יופיע קישור להסדרת התשלום 💳\n` +
          `(אפשר גם לשלם אחרת — פשוט כתבו לנו אחרי הרישום)`,
        isComplete: true,
        createTask: {
          type:        'רישום',
          description: `בקשת רישום לצהרון — ${childName} כיתה ${userMessage} | אזור: ${areaLabel} | ממתין למילוי טופס`,
          priority:    'רגיל',
        },
      }
    } else {
      return {
        text:
          `כרגע *אין מקום פנוי* לצהרון ב${areaLabel} 😔\n\n` +
          `אבל לא הכל אבוד! אפשר להוסיף את *${childName}* לרשימת ההמתנה — ` +
          `אתם מספר *${capacity.waitingListPosition}* ברשימה 💛\n\n` +
          `ברגע שיתפנה מקום ניצור קשר.\n\n*להצטרף לרשימת ההמתנה?* (כן / לא)`,
        nextFlow: 'register_waiting_confirm',
      }
    }
  }

  // ─── שלב אישור רשימת המתנה ────────────────────────────────────────────────
  if (step === 'register_waiting_confirm') {
    const childName = session.collectedData.child_name || 'הילד/ה'
    const areaCode  = session.collectedData.area_code  || 'sharon'

    if (isYes(userMessage)) {
      // שמור ב-Supabase
      try {
        const { saveWaitingListEntry, AREAS } = await import('./registration-helpers')
        const result = await saveWaitingListEntry({
          phone:      session.phone,
          parentName: session.parentName || '',
          childName,
          className:  session.collectedData.class_name || '',
          areaCode,
        })
        const areaLabel = AREAS[areaCode]?.label ?? areaCode
        return {
          text:
            `✅ *נוסף לרשימת ההמתנה!*\n\n` +
            `*${childName}* ב${areaLabel} — מיקום *${result.position}* ברשימה 🌟\n\n` +
            `ברגע שיתפנה מקום נצור קשר. תודה! 💛`,
          isComplete: true,
          createTask: {
            type:        'רשימת המתנה',
            description: `רשימת המתנה — ${childName} כיתה ${session.collectedData.class_name} | אזור: ${areaLabel} | מיקום ${result.position}`,
            priority:    'רגיל',
          },
        }
      } catch {
        return {
          text:
            `✅ *נרשמת לרשימת ההמתנה!*\n\n` +
            `ברגע שיתפנה מקום ל*${childName}* ניצור קשר 🌟`,
          isComplete: true,
        }
      }
    } else {
      return {
        text: `בסדר גמור 😊 אם תשנו דעתכם — כתבו לנו בכל עת!`,
        isComplete: true,
      }
    }
  }

  return { text: '😊 כתבו *"רישום לצהרון"* להתחיל מחדש.' }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 2: ביטול לפי תקנון
// לפני 15: מאשרים אוטומטי + זיכוי מלא
// אחרי 15: מודיעים על התקנון באופן סופי, אם ההורה מבקש חריג → הסלמה
// ═══════════════════════════════════════════════════════════════════════════════
// ביצוע ביטול בפועל ב-CRM: איתור הרישום (לפי טלפון ההורה או שם הילד) ועדכון ל"בוטל".
// מחזיר את שם הילד כפי שרשום, או null אם לא אותר חד-משמעית (ואז נציגה משלימה ידנית).
async function performCancellation(
  session: BotSession,
  childNameInput: string,
  policyNote: string
): Promise<{ childName: string } | null> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const name = childNameInput.trim().replace(/\s+/g, ' ')

    // איתור מועמדים: קודם הילדים של ההורה המזוהה לפי טלפון, אחר כך לפי שם בלבד
    let candidates: { id: string; name: string; parent_id: string }[] = []

    if (session.phone && session.phone !== 'simulator') {
      const normalized = session.phone.replace(/\D/g, '').replace(/^972/, '0')
      const intl = '972' + normalized.replace(/^0/, '')
      const { data: parent } = await supabase
        .from('parents').select('id')
        .or(`phone.eq.${normalized},phone.eq.${intl},phone.eq.${session.phone}`)
        .maybeSingle()
      if (parent) {
        const { data } = await supabase
          .from('children').select('id, name, parent_id')
          .eq('parent_id', parent.id).ilike('name', `%${name}%`)
        candidates = data ?? []
      }
    }
    if (!candidates.length) {
      const { data } = await supabase
        .from('children').select('id, name, parent_id')
        .ilike('name', name).limit(2)
      candidates = data ?? []
    }

    // דורשים התאמה חד-משמעית — לא מבטלים בניחוש!
    if (candidates.length !== 1) return null
    const child = candidates[0]

    // הרישום הפעיל לצהרון
    const { data: reg } = await supabase
      .from('registrations')
      .select('id, status, notes')
      .eq('child_id', child.id).eq('type', 'צהרון')
      .in('status', ['מאושר', 'ממתין לאישור'])
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle()

    if (!reg) return null

    await supabase.from('registrations').update({
      status: 'בוטל',
      notes:  [reg.notes, `בוטל ע"י ההורה דרך הבוט — ${policyNote}`].filter(Boolean).join(' | '),
    }).eq('id', reg.id)

    await supabase.from('registration_timeline').insert({
      parent_id:    child.parent_id,
      event_type:   'status_change',
      new_value:    'בוטל',
      description:  `ביטול רישום צהרון דרך הבוט — ${child.name} (${policyNote})`,
      performed_by: 'בוט',
    })

    return { childName: child.name }
  } catch (err) {
    console.error('[performCancellation] Error:', err)
    return null
  }
}

export async function handleCancellationFlow(session: BotSession, userMessage: string): Promise<BotResponse> {
  const step = session.currentFlow
  const dayOfMonth = new Date().getDate()

  if (!step || step === 'cancel_start') {
    return {
      text: `📋 *מדיניות ביטולים — Kids & Fun*\n\n` +
        `• ביטול *עד ה-15 לחודש* — המשך עד סוף החודש + זיכוי מלא\n` +
        `• ביטול *אחרי ה-15 לחודש* — ממשיכים חודש נוסף, ניתן להפסיק מהחודש שלאחריו\n\n` +
        `כדי להמשיך — *מה שם הילד/ה* שתרצו לבטל?`,
      nextFlow: 'cancel_child'
    }
  }

  if (step === 'cancel_child') {
    session.collectedData.child_name = userMessage

    if (dayOfMonth <= 15) {
      // לפני 15 — ביטול מאושר אוטומטית
      return {
        text: `📅 היום ה-${dayOfMonth} לחודש — אתם *בתוך חלון הביטול* ✅\n\n` +
          `*${userMessage}* יכול/ה להמשיך עד סוף החודש הנוכחי.\n` +
          `תקבלו זיכוי מלא לחודש הבא.\n\n` +
          `*לאשר את הביטול?* (כן / לא)`,
        nextFlow: 'cancel_confirm_before15'
      }
    } else {
      // אחרי 15 — מידע ברור על התקנון, ללא שאלה פתוחה
      return {
        text: `📅 היום ה-${dayOfMonth} לחודש.\n\n` +
          `לפי תקנון הצהרון, ביטול לאחר ה-15 — *ממשיכים חודש נוסף* ` +
          `ומפסיקים מהחודש שלאחריו.\n\n` +
          `*לאשר?* (כן / לא)\n\n` +
          `_אם יש נסיבות מיוחדות — כתבו ואנחנו נבדוק_`,
        nextFlow: 'cancel_confirm_after15'
      }
    }
  }

  // לפני 15 — אישור
  if (step === 'cancel_confirm_before15') {
    const childName = session.collectedData.child_name || 'הילד/ה'
    if (isYes(userMessage)) {
      // ביצוע הביטול בפועל ב-CRM
      const result = await performCancellation(
        session, childName, `לפני ה-15 (יום ${dayOfMonth}) — המשך עד סוף החודש + זיכוי מלא`
      )

      if (result) {
        return {
          text: `✅ *קיבלנו את הוראת הביטול!*\n\n` +
            `הרישום של *${result.childName}* עודכן במערכת — ` +
            `ממשיך/ה עד סוף החודש הנוכחי, והזיכוי יתקבל לחודש הבא.\n\n` +
            `📨 נשלחה הודעה לנציגה להפסקת החיובים, ` +
            `ואישור סופי על הביטול יישלח אליך *תוך 1-2 ימי עסקים* 💛`,
          isComplete: true,
          createTask: {
            type: 'ביטול',
            description: `✅ ביטול בוצע בבוט — ${result.childName} (יום ${dayOfMonth}, לפני ה-15, זיכוי מלא) | להפסיק הוראת קבע ב-PayPlus + לשלוח להורה אישור סופי`,
            priority: 'גבוה'
          }
        }
      }

      // לא אותר חד-משמעית — נציגה תשלים ידנית
      return {
        text: `✅ *בקשת הביטול נקלטה!*\n\n` +
          `*${childName}* ממשיך/ה עד סוף החודש הנוכחי, והזיכוי יתקבל לחודש הבא 💛\n\n` +
          `נציגה שלנו תשלים את הביטול במערכת ותשלח אישור סופי.`,
        isComplete: true,
        createTask: {
          type: 'ביטול',
          description: `ביטול אושר ע"י ההורה — ${childName} (יום ${dayOfMonth}, לפני ה-15, זיכוי מלא) | ⚠️ לא אותר אוטומטית ב-CRM — להשלים ידנית + להפסיק הוראת קבע`,
          priority: 'גבוה'
        }
      }
    } else {
      return {
        text: `בסדר, הביטול *לא בוצע* 😊\nאם תרצו לחזור לנושא — כתבו לנו בכל עת!`,
        isComplete: true
      }
    }
  }

  // אחרי 15 — אישור תקנון או בקשת חריג
  if (step === 'cancel_confirm_after15') {
    const childName = session.collectedData.child_name || 'הילד/ה'

    // הורה מציין נסיבות מיוחדות → הסלמה לנציגה
    if (/מחלה|רפואי|מעבר|חריג|נסיבות|בעיה|קשה|אי אפשר|לא יכול/i.test(userMessage)) {
      return {
        text: `מבינים לגמרי 💛\n\n` +
          `מקרים כאלה מטופלים באופן אישי.\n\n` +
          `${isBusinessHours()
            ? 'נציגה שלנו תחזור אליך בהקדם לטיפול בבקשה.'
            : 'נחזור אליך בשעות הפעילות (ראשון-חמישי 8:00-17:00) 📬'}`,
        isComplete: true,
        createTask: {
          type: 'ביטול חריג',
          description: `ביטול חריג — ${childName} (יום ${dayOfMonth}, אחרי ה-15, טוען לנסיבות מיוחדות): "${userMessage.slice(0, 80)}"`,
          priority: 'גבוה'
        }
      }
    }

    if (isYes(userMessage)) {
      // ביצוע הביטול בפועל ב-CRM
      const result = await performCancellation(
        session, childName, `אחרי ה-15 (יום ${dayOfMonth}) — ממשיך חודש נוסף ומסיים בסוף החודש הבא`
      )

      if (result) {
        return {
          text: `✅ *קיבלנו את הוראת הביטול!*\n\n` +
            `הרישום של *${result.childName}* עודכן במערכת — ` +
            `ממשיך/ה חודש נוסף ומסיים/ת בסוף החודש הבא.\n\n` +
            `📨 נשלחה הודעה לנציגה להפסקת החיובים בהתאם, ` +
            `ואישור סופי על הביטול יישלח אליך *תוך 1-2 ימי עסקים* 💛`,
          isComplete: true,
          createTask: {
            type: 'ביטול',
            description: `✅ ביטול בוצע בבוט — ${result.childName} (יום ${dayOfMonth}, אחרי ה-15, ממשיך חודש נוסף) | להפסיק הוראת קבע ב-PayPlus מהחודש הבא + לשלוח להורה אישור סופי`,
            priority: 'גבוה'
          }
        }
      }

      return {
        text: `✅ *בקשת הביטול נקלטה*\n\n` +
          `*${childName}* ממשיך/ה חודש נוסף ומסיים/ת בסוף החודש הבא.\n\n` +
          `נציגה שלנו תשלים את הביטול במערכת ותשלח אישור סופי 💛`,
        isComplete: true,
        createTask: {
          type: 'ביטול',
          description: `ביטול לפי תקנון — ${childName} (יום ${dayOfMonth}, אחרי ה-15, ממשיך חודש נוסף) | ⚠️ לא אותר אוטומטית ב-CRM — להשלים ידנית`,
          priority: 'גבוה'
        }
      }
    }

    if (isNo(userMessage)) {
      return {
        text: `בסדר, הביטול *לא בוצע* 😊\n` +
          `שמחים שאתם נשארים! אם תרצו לחזור לנושא — כתבו לנו.`,
        isComplete: true
      }
    }

    // תגובה לא ברורה
    return {
      text: `לא הבנתי 😊\n\nכדי לאשר את הביטול כתבו *"כן"*.\n` +
        `כדי לבטל — כתבו *"לא"*.\n\n` +
        `_אם יש נסיבות מיוחדות — פרטו ואנחנו נבדוק_`,
      nextFlow: 'cancel_confirm_after15'
    }
  }

  return { text: '😊 כתבו *"ביטול"* להתחיל מחדש.' }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 3: קייטנה לפני סגירת רישום
// 3 תרחישים: רישום חדש | בדיקת רישום קיים | בעיה בהרשמה
// ═══════════════════════════════════════════════════════════════════════════════
export function handleCampRegistrationFlow(): BotResponse {
  // הרישום לקייטנה מתבצע באתר (חנות ווקומרס) — האתר עצמו קובע אילו קייטנות
  // פתוחות לרישום. הבוט תמיד מציג את התפריט ושולח את הקישור לחנות.
  return {
    text: `🏕️ *קייטנות Kids & Fun!*\n\n` +
      `*מה תרצו?*\n` +
      `*1* — לרשום ילד/ה לקייטנה\n` +
      `*2* — לבדוק אם כבר נרשמתי\n` +
      `*3* — יש לי בעיה בהרשמה`,
    nextFlow: 'camp_menu'
  }
}

// תת-מסלולים לקייטנה לפני סגירה
export async function handleCampMenuFlow(session: BotSession, userMessage: string): Promise<BotResponse> {
  const step = session.currentFlow

  if (step === 'camp_menu') {
    const msg = userMessage.trim()

    // תרחיש 1: רישום חדש → קישור לחנות הקייטנות באתר
    if (msg === '1' || /לרשום|רישום|רוצה להירשם|רשמו/i.test(msg)) {
      let campUrl = 'https://kidsandfun.co.il/shop/'
      try {
        const { createServiceClient } = await import('@/lib/supabase/server')
        const supabase = createServiceClient()
        const { data } = await supabase
          .from('bot_assets').select('url')
          .eq('key', 'camp_register').eq('is_active', true).maybeSingle()
        if (data?.url) campUrl = data.url
      } catch { /* fallback לקישור הקבוע */ }

      return {
        text: `מצוין! 🎉\n\n` +
          `הרישום לקייטנה מתבצע ישירות דרך האתר — בוחרים את הקייטנה לפי האזור, ` +
          `ממלאים את פרטי הילד/ה ומשלמים אונליין:\n\n` +
          `📲 ${campUrl}\n\n` +
          `תהליך הרישום לוקח 5-10 דקות בלבד.\n\n` +
          `יש בעיה בהרשמה? חזרו אלינו ונסייע 😊`,
        isComplete: true
      }
    }

    // תרחיש 2: בדיקת רישום קיים
    if (msg === '2' || /לבדוק|כבר נרשם|האם נרשמ|רשום|נרשמתי|לא יודע|לא זוכר/i.test(msg)) {
      return {
        text: `בשמחה! נבדוק יחד 🔍\n\n*מה שם הילד/ה?*`,
        nextFlow: 'camp_check_name'
      }
    }

    // תרחיש 3: בעיה בהרשמה
    if (msg === '3' || /בעיה|שגיאה|לא עובד|לא הצלחתי|נתקעתי|תקלה/i.test(msg)) {
      return {
        text: `אוי, כמה מבאס 😔\n\n*מה בדיוק קרה?* תפרטו ונעזור!`,
        nextFlow: 'camp_problem_desc'
      }
    }

    // לא הבין
    return {
      text: `לא הבנתי 😊 אנא בחרו:\n` +
        `*1* — לרשום ילד/ה לקייטנה\n` +
        `*2* — לבדוק אם כבר נרשמתי\n` +
        `*3* — יש לי בעיה בהרשמה`,
      nextFlow: 'camp_menu'
    }
  }

  // תרחיש 2: בדיקת שם
  if (step === 'camp_check_name') {
    session.collectedData.child_name = userMessage
    return {
      text: `*${userMessage}* — *מספר תעודת זהות של הילד/ה?*\n(3-4 ספרות אחרונות מספיקות)`,
      nextFlow: 'camp_check_id'
    }
  }

  // תרחיש 2: בדיקת ת"ז + בדיקה אמיתית מול ה-CRM
  // רישומי הקייטנה מגיעים מהאתר דרך ה-webhook כולל ת"ז — אפשר לענות מיידית.
  if (step === 'camp_check_id') {
    session.collectedData.child_id = userMessage
    const childName = (session.collectedData.child_name || '').trim()
    const idDigits  = userMessage.replace(/\D/g, '')

    if (childName && idDigits.length >= 3) {
      try {
        const { createServiceClient } = await import('@/lib/supabase/server')
        const supabase = createServiceClient()

        // חיפוש הילד לפי שם (מדויק, ואם אין — מכיל)
        let { data: kids } = await supabase
          .from('children').select('id, name, id_number, parent_id')
          .ilike('name', childName).limit(3)
        if (!kids?.length) {
          const res = await supabase
            .from('children').select('id, name, id_number, parent_id')
            .ilike('name', `%${childName}%`).limit(3)
          kids = res.data
        }
        // fallback: אולי נכתב שם ההורה — מחפשים את הילדים שלו (הת"ז עדיין חייבת להתאים)
        if (!kids?.length) {
          const { data: parentMatch } = await supabase
            .from('parents').select('id')
            .ilike('name', `%${childName}%`).limit(2)
          if (parentMatch?.length === 1) {
            const res = await supabase
              .from('children').select('id, name, id_number, parent_id')
              .eq('parent_id', parentMatch[0].id).limit(5)
            kids = res.data
          }
        }

        // אימות זהות: סיומת ת"ז חייבת להתאים (לא חושפים מידע בלי אימות!)
        const verified = (kids ?? []).filter((k: { id: string; name: string; id_number: string | null; parent_id: string }) => {
          const stored = String(k.id_number ?? '').replace(/\D/g, '')
          return stored && (stored.endsWith(idDigits) || idDigits.endsWith(stored))
        })

        if (verified.length === 1) {
          const child = verified[0]
          const { data: reg } = await supabase
            .from('registrations')
            .select('status, notes, created_at')
            .eq('child_id', child.id)
            .eq('type', 'קייטנה')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (reg) {
            // שם הקייטנה מתוך הערות הרישום (אם קיים)
            const campMatch = reg.notes?.match(/—\s*(.+?)\s*\(הזמנה/)
            const campName  = campMatch?.[1] ?? ''
            if (reg.status === 'מאושר') {
              return {
                text:
                  `✅ *${child.name} רשום/ה לקייטנה!*\n\n` +
                  `${campName ? `🏕️ ${campName}\n` : ''}` +
                  `הרישום והתשלום התקבלו במלואם.\n\n` +
                  `מחכים לראותכם! 💛`,
                isComplete: true,
              }
            }
            return {
              text:
                `🔶 מצאתי רישום של *${child.name}* לקייטנה` +
                `${campName ? ` (${campName})` : ''} — אבל הוא עדיין *ממתין להשלמה*.\n\n` +
                `ייתכן שהתשלום לא הושלם. נציגה שלנו תבדוק ותחזור אליך 💛`,
              isComplete: true,
              createTask: {
                type: 'בדיקת רישום קייטנה',
                description: `רישום קייטנה ממתין — ${child.name} | ההורה שאל על הסטטוס, לבדוק תשלום ולחזור`,
                priority: 'גבוה',
              },
            }
          }

          // ילד מזוהה אבל בלי רישום קייטנה
          return {
            text:
              `🔍 בדקתי — לא מצאתי רישום לקייטנה עבור *${child.name}*.\n\n` +
              `אפשר להירשם עכשיו דרך האתר:\n` +
              `📲 https://kidsandfun.co.il/shop/\n\n` +
              `ואם נרשמתם ממש לאחרונה — ייתכן שהרישום עוד בדרך, נציגה תוודא ותחזור 💛`,
            isComplete: true,
            createTask: {
              type: 'בדיקת רישום קייטנה',
              description: `הורה שאל על רישום קייטנה שלא נמצא — ${child.name} (ת"ז: ${idDigits}) | לוודא`,
              priority: 'רגיל',
            },
          }
        }
      } catch (err) {
        console.error('[camp_check] lookup error:', err)
      }
    }

    // לא אותר / לא אומת חד-משמעית → נציגה תבדוק (כמו קודם)
    return {
      text: `🔍 בודקת...\n\n` +
        `לא הצלחתי לאמת את הפרטים באופן אוטומטי — ` +
        `נציגה שלנו תחזור אליך בהקדם עם הסטטוס של *${childName || 'הילד/ה'}* 💛\n\n` +
        `${!isBusinessHours() ? '_שעות פעילות: ראשון-חמישי 8:00-17:00_' : ''}`,
      isComplete: true,
      createTask: {
        type: 'בדיקת רישום קייטנה',
        description: `הורה מבקש לבדוק סטטוס רישום קייטנה — ${childName} (ת"ז: ${userMessage}) | לא אותר אוטומטית`,
        priority: 'גבוה'
      }
    }
  }

  // תרחיש 3: תיאור הבעיה
  if (step === 'camp_problem_desc') {
    const problem = userMessage
    return {
      text: `קיבלתי ✅\n\n` +
        `${isBusinessHours()
          ? 'נציגה שלנו תחזור אליך עם פתרון בהקדם!'
          : 'נחזור אליך בשעות הפעילות (ראשון-חמישי 8:00-17:00) לעזור!'}\n\n` +
        `בינתיים — ניתן לנסות שוב דרך הקישור:\n📲 https://kidsandfun.co.il/shop/`,
      isComplete: true,
      createTask: {
        type: 'בעיה בהרשמה לקייטנה',
        description: `הורה מדווח על בעיה ברישום לקייטנה: "${problem.slice(0, 100)}"`,
        priority: 'גבוה'
      }
    }
  }

  return { text: '😊 כתבו *"קייטנה"* להתחיל מחדש.' }
}

// ─── קייטנה אחרי סגירה ────────────────────────────────────────────────────────
export function handleLateCampFlow(session: BotSession, userMessage: string): BotResponse {
  const step = session.currentFlow

  if (step === 'camp_late_name') {
    session.collectedData.child_name = userMessage
    return {
      text: `*${userMessage}* — *כיתה/גיל?*`,
      nextFlow: 'camp_late_class'
    }
  }

  if (step === 'camp_late_class') {
    session.collectedData.class_name = userMessage
    const childName = session.collectedData.child_name || 'הילד/ה'
    return {
      text: `תודה! קיבלתי ✅\n\n` +
        `אני בודקת אם יש מקום זמין עבור *${childName}* ו*חוזרת אליך תוך יום עסקים*.\n\n` +
        `${isBusinessHours() ? 'ניצור קשר בהמשך היום!' : 'ניצור קשר מחר בבוקר! 🌅'}`,
      isComplete: true,
      createTask: {
        type: 'רישום מאוחר לקייטנה',
        description: `בקשת רישום לקייטנה אחרי סגירת מועד — ${childName} כיתה ${userMessage}`,
        priority: 'גבוה'
      }
    }
  }

  return { text: '😊 כתבו *"קייטנה"* להתחיל מחדש.' }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 4: שאלות לוח זמנים וחגים
// TODO: לקרוא נתונים מ-Supabase calendar_events במקום hardcoded
// ═══════════════════════════════════════════════════════════════════════════════
export function handleScheduleFlow(message: string): BotResponse {
  const lowerMsg = message.toLowerCase()

  if (lowerMsg.includes('שעות') || lowerMsg.includes('מתי פתוח') || lowerMsg.includes('שעה') || lowerMsg.includes('פתוח')) {
    return {
      text: `⏰ *שעות פעילות הצהרון:*\n\n` +
        `ראשון עד חמישי: *13:00 – 18:00*\n` +
        `שישי ושבת: סגור\n\n` +
        `⚠️ השעות עשויות להשתנות בחגים ובתקופת הקיץ.\n\n` +
        `יש שאלה נוספת? 😊`,
      isComplete: true
    }
  }

  if (lowerMsg.includes('חג') || lowerMsg.includes('חגים') || lowerMsg.includes('סגור')) {
    return {
      text: `📅 *ימי חג — הצהרון סגור:*\n\n` +
        `• שבועות — ב׳ סיון\n` +
        `• ט׳ באב\n` +
        `• ראש השנה — ב׳ ימים\n` +
        `• יום כיפור\n` +
        `• סוכות — א׳ וחול המועד\n` +
        `• שמחת תורה\n` +
        `• פסח — א׳ ושביעי + חול המועד\n` +
        `• יום העצמאות\n\n` +
        `לוח החגים המלא נשלח בתחילת כל שנת לימודים 📬\n\n` +
        `יש שאלה ספציפית? 😊`,
      isComplete: true
    }
  }

  if (lowerMsg.includes('חופש') || lowerMsg.includes('קיץ')) {
    return {
      text: `🏖️ *חופשות:*\n\n` +
        `• *חופש קיץ* (יולי-אוגוסט) — פעילות קייטנה בלבד\n` +
        `• *חנוכה* — 3-4 ימי חופש (לפי לוח)\n` +
        `• *פסח* — שבוע חופש מלא\n\n` +
        `פרטים מלאים נשלחים בעדכון חודשי 💛`,
      isComplete: true
    }
  }

  return {
    text: `📋 *מידע על הצהרון:*\n\n` +
      `ראשון-חמישי: 13:00 – 18:00\n\n` +
      `לשאלות ספציפיות כתבו:\n` +
      `• *"שעות"* — שעות פעילות\n` +
      `• *"חגים"* — לוח חגים\n` +
      `• *"חופש"* — חופשות\n\n` +
      `${isBusinessHours() ? 'נציגה שלנו זמינה לעזור! 😊' : 'נחזור אליך בשעות הפעילות 😊'}`,
    isComplete: true
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 6: איסוף מוקדם
// שלבים: שם ילד → שעה → שם האוסף/ת → אישור
// ═══════════════════════════════════════════════════════════════════════════════
export function handleEarlyPickupFlow(session: BotSession, userMessage: string): BotResponse {
  const step = session.currentFlow

  if (!step || step === 'pickup_start') {
    return {
      text: `👋 *בקשת איסוף מוקדם*\n\n*מה שם הילד/ה* שתרצו לאסוף?`,
      nextFlow: 'pickup_child'
    }
  }

  if (step === 'pickup_child') {
    session.collectedData.child_name = userMessage
    return {
      text: `*${userMessage}* — *באיזו שעה* תרצו לאסוף?`,
      nextFlow: 'pickup_time'
    }
  }

  if (step === 'pickup_time') {
    session.collectedData.pickup_time = userMessage
    return {
      text: `שעה *${userMessage}* ✅\n\n*מי יאסוף?*\n(שם + קרבה, למשל: "אבא דני" / "סבתא שרה")`,
      nextFlow: 'pickup_collector'
    }
  }

  if (step === 'pickup_collector') {
    session.collectedData.collector_name = userMessage
    const childName = session.collectedData.child_name || '?'
    const time = session.collectedData.pickup_time || '?'

    return {
      text: `✅ *בקשת האיסוף התקבלה!*\n\n` +
        `👧 ילד/ה: *${childName}*\n` +
        `⏰ שעה: *${time}*\n` +
        `🚗 אוסף/ת: *${userMessage}*\n\n` +
        `הצוות עודכן ויהיה מוכן 😊`,
      isComplete: true,
      createTask: {
        type: 'איסוף מוקדם',
        description: `איסוף מוקדם — ${childName} בשעה ${time} ע"י ${userMessage}`,
        priority: 'גבוה'
      }
    }
  }

  return { text: '😊 כתבו *"איסוף מוקדם"* להתחיל מחדש.' }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 5: בדיקת סטטוס תשלום (כניסה ראשונה)
// מציג אפשרויות ומכניס למסלול הסדרת תשלום אם צריך
// ═══════════════════════════════════════════════════════════════════════════════
export function handlePaymentStatusFlow(parentName?: string): BotResponse {
  const firstName = parentName ? parentName.split(' ')[0] : ''
  return {
    text:
      `💰 *תשלומים — Kids & Fun*\n\n` +
      `${firstName ? `היי ${firstName}! ` : ''}על מה תרצו לשאול?\n\n` +
      `*1* — סטטוס התשלום שלי\n` +
      `*2* — לשנות שיטת תשלום\n` +
      `*3* — לא עבר תשלום / בעיה\n` +
      `*4* — מה העלות החודשית?\n` +
      `*5* — 💳 להסדיר תשלום חדש`,
    nextFlow: 'payment_status_menu',
  }
}

export async function handlePaymentStatusMenuFlow(
  session: BotSession,
  userMessage: string
): Promise<BotResponse> {
  const msg = userMessage.trim()

  // ⚠️ שלב זיהוי לפי שם ילד — חייב להיבדק לפני תפריט הבחירות,
  // אחרת שם כמו "רון אחרוני" ייתפס בטעות ע"י ה-regex של האפשרויות
  if (session.currentFlow === 'payment_status_child_name') {
    return handlePaymentStatusChildName(session, userMessage)
  }

  // בחירה 1 — סטטוס: שליפה אמיתית מה-CRM לפי טלפון הפונה
  if (msg === '1' || /סטטוס|בדוק|כמה חייב|מה שילמתי|שולם/i.test(msg)) {
    const statusText = await getPaymentStatusByPhone(session.phone)
    if (statusText) {
      return { text: statusText, isComplete: true }
    }

    // הטלפון לא מזוהה → מבקשים שם ילד לזיהוי
    return {
      text:
        `🔍 *בדיקת סטטוס תשלום*\n\n` +
        `לא מצאתי את המספר שלך במערכת — בוא/י נזהה אותך:\n\n` +
        `*מה שם הילד/ה? (שם פרטי + שם משפחה)*`,
      nextFlow: 'payment_status_child_name',
    }
  }

  // בחירה 2 — שינוי שיטת תשלום → מסלול אפשרויות תשלום
  if (msg === '2' || /שיטה|לשנות|אמצעי|אחרת|אחר/i.test(msg)) {
    session.collectedData.payment_setup_reason = 'method_change'
    return {
      text:
        `*שינוי שיטת תשלום* — נשמח לעזור! 💛\n\n` +
        `*באיזו שיטה הייתם רוצים להמשיך?*\n\n` +
        `*1* — 💳 כרטיס אשראי (PayPlus)\n` +
        `*2* — 🏦 הוראת קבע (PayPlus)\n` +
        `*3* — 💵 מזומן\n` +
        `*4* — 📝 צ׳קים\n` +
        `*5* — 🏛️ העברה בנקאית`,
      nextFlow: 'payment_setup_method',
    }
  }

  // בחירה 3 — בעיה / כשל → מסלול כשל תשלום הקיים
  if (msg === '3' || /בעיה|כשל|לא עבר|נכשל|נדחה/i.test(msg)) {
    session.currentFlow = 'payment_fail_start'
    return handlePaymentFailureParentFlow(session, userMessage)
  }

  // בחירה 4 — עלות → תפריט עלויות מפורט
  if (msg === '4' || /עלות|מחיר|כמה עולה|כמה זה|עלה|עלות חודשית/i.test(msg)) {
    return {
      text:
        `💰 *שאלות עלות — Kids & Fun*\n\n` +
        `על מה תרצו לדעת?\n\n` +
        `*1* — 📅 עלות חודשית צהרון\n` +
        `*2* — ☀️ תשלום מראש לקייטנה\n` +
        `*3* — 👨‍👩‍👧‍👦 הנחת אחים / אחיות\n` +
        `*4* — 💬 שאלה אחרת על עלות`,
      nextFlow: 'cost_info_start',
    }
  }

  // בחירה 5 — הסדרת תשלום חדש → payment_setup_start (מיידי, ללא הודעה ריקה)
  if (msg === '5' || /חדש|להסדיר|הסדר|לשלם|תשלום חדש/i.test(msg)) {
    session.currentFlow = 'payment_setup_start'
    // קורא ישירות ל-handlePaymentSetupFlow דרך ה-handler — מחזיר תפריט מיידית
    return { text: '__redirect_payment_setup__', nextFlow: 'payment_setup_start' }
  }

  // לא הבין
  return {
    text:
      `לא הבנתי 😊\n\n` +
      `*1* — סטטוס התשלום שלי\n` +
      `*2* — לשנות שיטת תשלום\n` +
      `*3* — לא עבר תשלום / בעיה\n` +
      `*4* — מה העלות החודשית?\n` +
      `*5* — 💳 להסדיר תשלום חדש`,
    nextFlow: 'payment_status_menu',
  }
}

// שלב זיהוי לפי שם ילד לבדיקת סטטוס (כשהטלפון לא נמצא במערכת)
async function handlePaymentStatusChildName(
  session: BotSession,
  userMessage: string
): Promise<BotResponse> {
  const nameInput = userMessage.trim().replace(/\s+/g, ' ')
  const words = nameInput.split(' ').filter(w => w.length >= 2)

  if (words.length < 2 || /\d/.test(nameInput)) {
    return {
      text:
        `צריך שם מלא לצורך זיהוי 😊\n\n` +
        `*אנא כתבו שם פרטי + שם משפחה של הילד/ה*\n` +
        `_(למשל: נועה כהן)_`,
      nextFlow: 'payment_status_child_name',
    }
  }

  const statusText = await getPaymentStatusByChildName(nameInput)
  if (statusText) {
    return { text: statusText, isComplete: true }
  }

  // לא נמצא / לא חד-משמעי → נציגה תבדוק
  return {
    text:
      `🔍 לא הצלחתי לאתר את *${nameInput}* באופן חד-משמעי.\n\n` +
      `${isBusinessHours()
        ? 'נציגה שלנו תבדוק את החשבון ותחזור אליך מיד 😊'
        : 'נחזור אליך בשעות הפעילות (ראשון-חמישי 8:00-17:00) עם הפרטים 💛'}`,
    isComplete: true,
    createTask: {
      type:        'שאלה כללית',
      description: `בדיקת סטטוס תשלום — ילד/ה: ${nameInput} | טלפון פונה: ${session.phone} | לא אותר אוטומטית`,
      priority:    'רגיל',
    },
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול עלויות: תפריט שאלות על עלות (ללא העברה לנציגה)
// ═══════════════════════════════════════════════════════════════════════════════
export async function handleCostInfoFlow(
  session: BotSession,
  userMessage: string
): Promise<BotResponse> {
  const msg       = userMessage.trim()
  const areaLabel = session.collectedData.area_label ?? ''
  const amount    = session.collectedData.monthly_fee ?? String(DEFAULT_MONTHLY_FEE)

  // ─── 1. עלות חודשית צהרון ──────────────────────────────────────────────────
  if (msg === '1' || /חודשי|צהרון|ירחי|חודש|עלות/i.test(msg)) {
    const areaInfo = areaLabel
      ? `באזור *${areaLabel}*`
      : 'בהתאם לאזור המגורים'

    return {
      text:
        `📅 *עלות חודשית צהרון — Kids & Fun*\n\n` +
        `העלות החודשית ${areaInfo} היא *${amount}₪* (כולל מע"מ).\n\n` +
        `*כולל:*\n` +
        `✅ ליווי מקצועי ראשון-חמישי\n` +
        `✅ ארוחת צהריים וחטיפים\n` +
        `✅ פעילויות חינוכיות\n\n` +
        `התשלום מתבצע בתחילת כל חודש.\n\n` +
        `רוצים להסדיר תשלום? כתבו *"תשלום"* 💳`,
      isComplete: true,
    }
  }

  // ─── 2. קייטנה — תשלום מראש ─────────────────────────────────────────────────
  if (msg === '2' || /קייטנה|קיץ|קיטנה|גיני|קמפ/i.test(msg)) {
    return {
      text:
        `☀️ *קייטנה קיץ — Kids & Fun*\n\n` +
        `הקייטנה משולמת *מראש במלואה* בעת הרישום.\n\n` +
        `*מחיר הקייטנה:* החל מ-*1,200₪* (תלוי בתוכנית ומשך).\n\n` +
        `*כולל:*\n` +
        `✅ פעילויות יומיות מגוונות\n` +
        `✅ טיולים שבועיים\n` +
        `✅ ארוחות כלולות\n\n` +
        `_פרטים מלאים ועלות מדויקת — צרו קשר לרישום_ 💛`,
      isComplete: true,
    }
  }

  // ─── 3. הנחת אחים ──────────────────────────────────────────────────────────
  if (msg === '3' || /אחים|אחיות|הנחה|שני ילדים|שניים|יותר מ/i.test(msg)) {
    return {
      text:
        `👨‍👩‍👧‍👦 *הנחת אחים — Kids & Fun*\n\n` +
        `מ-2 ילדים ומעלה מאותה משפחה:\n\n` +
        `✅ *ילד ראשון* — מחיר מלא\n` +
        `✅ *ילד שני ואילך* — *הנחה של 10%*\n\n` +
        `ההנחה מחושבת אוטומטית בעת הרישום.\n\n` +
        `_לרישום ילד נוסף — כתבו "רישום" ונתחיל_ 🎒`,
      isComplete: true,
    }
  }

  // ─── 4. שאלה אחרת — LLM (לא נציגה!) ────────────────────────────────────────
  if (msg === '4' || /אחר|אחרת|שאלה|אחרות/i.test(msg)) {
    return {
      text:
        `💬 *שאלות נוספות על עלות*\n\n` +
        `כתבו את שאלתכם בחופשיות — אנסה לענות! 😊\n\n` +
        `_לדוגמה: "יש הנחה לחד הורי?" / "מה אם ביטלנו באמצע חודש?"_`,
      nextFlow: 'cost_info_freetext',
    }
  }

  // ─── מצב free text — ענה עם LLM ──────────────────────────────────────────
  if (session.currentFlow === 'cost_info_freetext') {
    // ממשיך ל-LLM fallback ב-handler
    return {
      text: '',  // marker — handler יפעיל LLM
      escalate: false,
    }
  }

  // ─── לא הבין ────────────────────────────────────────────────────────────────
  return {
    text:
      `לא הבנתי 😊\n\n` +
      `*1* — 📅 עלות חודשית צהרון\n` +
      `*2* — ☀️ תשלום מראש לקייטנה\n` +
      `*3* — 👨‍👩‍👧‍👦 הנחת אחים / אחיות\n` +
      `*4* — 💬 שאלה אחרת`,
    nextFlow: 'cost_info_start',
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// מסלול 7א + 7ב: כשל תשלום
//
// 7א — ההורה פונה מיוזמתו ("לא עבר לי תשלום")
// 7ב — המערכת שלחה הודעה יזומה וההורה מגיב
//
// ⚠️ אסור לאסוף פרטי כרטיס אשראי דרך WhatsApp!
//     הבוט רק מתאם שיחה עם נציגה או מתזמן תזכורת CRM.
// ═══════════════════════════════════════════════════════════════════════════════
export function handlePaymentFailureParentFlow(session: BotSession, userMessage: string): BotResponse {
  const step = session.currentFlow

  // ─── פתיחה — טון חם ולא מלחיץ ────────────────────────────────────────────
  if (!step || step === 'payment_fail_start') {
    const firstName = session.parentName ? session.parentName.split(' ')[0] : ''
    return {
      text: `היי${firstName ? ' ' + firstName : ''}! 😊\n\n` +
        `שם לב שהיתה בעיה בתשלום — אין מה לדאוג, מטפלים ביחד 💛\n\n` +
        `*מה המצב?*\n\n` +
        `*1* — החלפתי כרטיס, יש לי פרטים חדשים\n` +
        `*2* — רוצה לעבור לאמצעי תשלום אחר\n` +
        `*3* — רוצה לשנות את תאריך החיוב\n` +
        `*4* — עוד לא מסודר, תחזרו אלי בעוד כמה ימים\n` +
        `*5* — אחר`,
      nextFlow: 'payment_fail_type'
    }
  }

  // ─── סיווג הבחירה ─────────────────────────────────────────────────────────
  if (step === 'payment_fail_type') {
    const msg = userMessage.trim()

    // ענף 1: כרטיס חדש — לא לקחת פרטים! רק לתאם שיחה
    if (msg === '1' || /הוחלף|כרטיס חדש|פרטים חדשים|החלפתי|אשראי חדש/i.test(msg)) {
      return {
        text: `מצוין! 💳\n\n` +
          `נציגה שלנו תתקשר לקחת את הפרטים החדשים בצורה מאובטחת.\n\n` +
          `*מתי נוח לך לשיחה קצרה?*\n` +
          `(לדוגמה: "היום בין 14-16", "מחר בבוקר", "עכשיו")`,
        nextFlow: 'payment_fail_schedule_call',
        createTask: {
          type: 'כשל תשלום',
          description: `הורה מדווח על החלפת כרטיס — ממתין לתיאום שיחה לעדכון פרטים`,
          priority: 'דחוף'
        }
      }
    }

    // ענף 2: אמצעי תשלום אחר
    if (msg === '2' || /אמצעי אחר|שיטה אחרת|מזומן|שיק|צ.?ק|העברה|בנק|הוראת קבע|לשנות שיטה/i.test(msg)) {
      return {
        text: `*אפשרויות תשלום:*\n\n` +
          `• 🏦 *הוראת קבע* — חיוב אוטומטי בתאריך קבוע\n` +
          `• 💳 *אשראי* — חיוב חודשי\n` +
          `• 💵 *מזומן* — בתחילת כל חודש\n` +
          `• 📝 *צ׳קים* — מראש\n` +
          `• 🏛️ *העברה בנקאית*\n\n` +
          `*מה מתאים לך?*`,
        nextFlow: 'payment_fail_method_choice',
        createTask: {
          type: 'כשל תשלום',
          description: `הורה מבקש לשנות אמצעי תשלום — ממתין לבחירה`,
          priority: 'גבוה'
        }
      }
    }

    // ענף 3: שינוי תאריך חיוב
    if (msg === '3' || /תאריך|מועד|לא מתאים|להזיז|לשנות תאריך/i.test(msg)) {
      return {
        text: `בטח! *איזה תאריך בחודש* יתאים לך לחיוב?\n` +
          `(לדוגמה: ה-1, ה-5, ה-10, ה-15...)`,
        nextFlow: 'payment_fail_new_date',
        createTask: {
          type: 'כשל תשלום',
          description: `הורה מבקש לשנות תאריך חיוב חודשי`,
          priority: 'רגיל'
        }
      }
    }

    // ענף 4: תחזרו בעוד X ימים
    if (msg === '4' || /עוד|ימים|שבוע|אחר כך|אחרי|לא עכשיו|תחזרו|מאוחר יותר/i.test(msg)) {
      return {
        text: `בסדר גמור 😊\n\n*מתי לחזור אליך?*\n(לדוגמה: "עוד 3 ימים", "בשבוע הבא", "ב-25 לחודש")`,
        nextFlow: 'payment_fail_remind_when',
        createTask: {
          type: 'כשל תשלום',
          description: `הורה ביקש לחזור אליו מאוחר יותר — ממתין לתאריך`,
          priority: 'רגיל'
        }
      }
    }

    // ענף 5: אחר / לא ברור
    return {
      text: `מבינים 💛\n\n` +
        `*ספר/י לי מה קורה* ואנחנו נמצא פתרון ביחד:`,
      nextFlow: 'payment_fail_describe'
    }
  }

  // ─── תיאום שיחה ─────────────────────────────────────────────────────────────
  if (step === 'payment_fail_schedule_call') {
    return {
      text: `✅ *קיבלתי!*\n\n` +
        `נציגה שלנו תתקשר אליך *${userMessage}* לסיים את עדכון הפרטים.\n\n` +
        `תודה על הסבלנות 💛`,
      isComplete: true,
      createTask: {
        type: 'כשל תשלום',
        description: `תאום שיחה לעדכון כרטיס — זמן מועדף: "${userMessage}"`,
        priority: 'דחוף'
      }
    }
  }

  // ─── בחירת אמצעי תשלום ───────────────────────────────────────────────────
  if (step === 'payment_fail_method_choice') {
    return {
      text: `✅ *קיבלתי — ${userMessage}*\n\n` +
        `נציגה שלנו תחזור אליך לסיים את ההסדרה.\n\n` +
        `${isBusinessHours() ? 'נחזור אליך היום!' : 'נחזור אליך בשעות הפעילות 😊'}`,
      isComplete: true,
      createTask: {
        type: 'כשל תשלום',
        description: `שינוי אמצעי תשלום — הורה בחר: "${userMessage}"`,
        priority: 'גבוה'
      }
    }
  }

  // ─── שינוי תאריך חיוב ────────────────────────────────────────────────────
  if (step === 'payment_fail_new_date') {
    return {
      text: `✅ *רשמנו — תאריך ${userMessage}*\n\n` +
        `הבקשה הועברה לנציגה לאישור ועדכון.\n` +
        `${isBusinessHours() ? 'נאשר בהמשך היום!' : 'נאשר בבוקר הקרוב 😊'}`,
      isComplete: true,
      createTask: {
        type: 'כשל תשלום',
        description: `שינוי תאריך חיוב חודשי — תאריך מבוקש: ${userMessage}`,
        priority: 'רגיל'
      }
    }
  }

  // ─── תזכורת CRM — "תחזרו בעוד X ימים" ──────────────────────────────────
  if (step === 'payment_fail_remind_when') {
    return {
      text: `👍 *קיבלתי!*\n\nניצור איתך קשר *${userMessage}*.\n\n` +
        `אם תרצה/י לסדר לפני כן — כתוב/י לנו בכל עת 😊`,
      isComplete: true,
      createTask: {
        type: 'תזכורת כשל תשלום',
        description: `הורה ביקש לחזור אליו: "${userMessage}" — ליצור קשר ולסדר תשלום`,
        priority: 'גבוה'
      }
    }
  }

  // ─── תיאור חופשי של הבעיה ────────────────────────────────────────────────
  if (step === 'payment_fail_describe') {
    return {
      text: `תודה שפירטת 💛\n\n` +
        `${isBusinessHours()
          ? 'נציגה שלנו תחזור אליך בהקדם לטפל בבקשה.'
          : 'נחזור אליך בשעות הפעילות (ראשון-חמישי 8:00-17:00) 📬'}`,
      isComplete: true,
      createTask: {
        type: 'כשל תשלום',
        description: `בעיית תשלום לא מוגדרת — "${userMessage.slice(0, 120)}"`,
        priority: 'דחוף'
      }
    }
  }

  return { text: '😊 כתבו *"בעיה בתשלום"* להתחיל מחדש.' }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול חדש: הסדרת תשלום — אפשרויות תשלום חלופיות
//
// נכנסים מ-3 נקודות:
//   א) הורה שואל על שיטות תשלום (כוונה: אפשרויות_תשלום)
//   ב) הורה קיבל הצעת מקום מרשימת המתנה ואישר
//   ג) שינוי שיטת תשלום ממסלול 5
//
// שלבים:
//   payment_setup_start   → תפריט שיטות תשלום
//   payment_setup_method  → עיבוד בחירה
//   payment_setup_checks  → כמה צ׳קים? (רק אם בחרו צ׳קים)
//
// 💳 אשראי / הוראת קבע: קריאה ל-PayPlus → שליחת קישור
// 💵 מזומן / 📝 צ׳קים / 🏛️ העברה: יצירת task לנציגה + הוראות
// 🔗 חשבונית ירוקה: קישור מ-bot_assets → שליחה
// ═══════════════════════════════════════════════════════════════════════════════
export async function handlePaymentSetupFlow(
  session: BotSession,
  userMessage: string
): Promise<BotResponse> {
  const step = session.currentFlow

  // ─── פתיחה — תפריט שיטות תשלום ──────────────────────────────────────────
  if (!step || step === 'payment_setup_start') {
    // ── פרסונליזציה — טען נתוני ההורה אם עוד לא נטענו ──────────────────────
    if (!session.collectedData.child_name && session.phone) {
      await loadParentRegistrationContext(session.phone, session)
    }

    const childName  = session.collectedData.child_name  ?? ''
    const areaLabel  = session.collectedData.area_label  ?? ''
    const amount     = session.collectedData.monthly_fee ?? String(DEFAULT_MONTHLY_FEE)
    const fromSpot   = session.collectedData.from_spot_offer === 'true'

    // ── intro מותאם אישית ─────────────────────────────────────────────────
    const personalInfo = childName
      ? `עבור *${childName}*${areaLabel ? ` (${areaLabel})` : ''} — *${amount}₪/חודש*\n\n`
      : ''

    const intro = fromSpot
      ? `מעולה! 🎉 נסדר עכשיו את התשלום עבור *${childName}*${areaLabel ? ` ב${areaLabel}` : ''} (${amount}₪/חודש).\n\n`
      : `*הסדרת תשלום — Kids & Fun* 💛\n\n${personalInfo}`

    return {
      text:
        intro +
        `*באיזו שיטת תשלום תרצו?\n\n*` +
        `*1* — 💳 כרטיס אשראי (PayPlus)\n` +
        `*2* — 🏦 הוראת קבע (PayPlus) — מומלץ!\n` +
        `*3* — 💵 מזומן\n` +
        `*4* — 📝 צ׳קים\n` +
        `*5* — 🏛️ העברה בנקאית\n` +
        `*6* — 🔗 קישור תשלום מיידי`,
      nextFlow: 'payment_setup_method',
    }
  }

  // ─── עיבוד בחירת שיטת תשלום ──────────────────────────────────────────────
  if (step === 'payment_setup_method') {
    const msg       = userMessage.trim()
    const childName = session.collectedData.child_name   ?? 'הילד/ה'
    const amount    = parseInt(session.collectedData.monthly_fee ?? String(DEFAULT_MONTHLY_FEE), 10)
    const firstName = session.parentName?.split(' ')[0] ?? ''

    let chosenMethod: PaymentMethod | null = null

    if (msg === '1' || /אשראי|כרטיס|credit/i.test(msg))        chosenMethod = 'credit'
    if (msg === '2' || /הוראת קבע|קבע|standing/i.test(msg))    chosenMethod = 'standing_order'
    if (msg === '3' || /מזומן|cash/i.test(msg))                 chosenMethod = 'cash'
    if (msg === '4' || /צ.?ק|שיק|check/i.test(msg))            chosenMethod = 'checks'
    if (msg === '5' || /העברה|בנק|transfer/i.test(msg))        chosenMethod = 'bank_transfer'
    if (msg === '6' || /קישור|חשבונית|invoice|link/i.test(msg)) chosenMethod = 'invoice_link'

    if (!chosenMethod) {
      return {
        text:
          `לא הבנתי 😊 אנא בחרו:\n\n` +
          `*1* — 💳 כרטיס אשראי\n` +
          `*2* — 🏦 הוראת קבע\n` +
          `*3* — 💵 מזומן\n` +
          `*4* — 📝 צ׳קים\n` +
          `*5* — 🏛️ העברה בנקאית\n` +
          `*6* — 🔗 קישור תשלום מיידי`,
        nextFlow: 'payment_setup_method',
      }
    }

    session.collectedData.payment_method = chosenMethod

    // ── אשראי / הוראת קבע → שאלות זיהוי לפני שליחת קישור ───────────────────
    // ⚠️ לא מסתמכים על מספר הטלפון של הפונה! הורה יכול לכתוב מטלפון לא מזוהה.
    // שואלים: שם הילד/ה המלא + אזור — ולפי האזור נשלח הלינק הנכון.
    if (chosenMethod === 'credit' || chosenMethod === 'standing_order') {
      return {
        text:
          `${chosenMethod === 'standing_order' ? '🏦 *הוראת קבע*' : '💳 *כרטיס אשראי*'} — בחירה מצוינת!\n\n` +
          `לפני שאשלח את הקישור, לצורך זיהוי:\n\n` +
          `*מה שם הילד/ה? (שם פרטי + שם משפחה)*`,
        nextFlow: 'payment_setup_child_name',
      }
    }

    // ── מזומן ────────────────────────────────────────────────────────────────
    if (chosenMethod === 'cash') {
      return {
        text:
          `💵 *תשלום במזומן*\n\n` +
          `ניתן לשלם בתחילת כל חודש ישירות לצוות הצהרון.\n\n` +
          `*סכום:* ${amount}₪ לחודש\n\n` +
          `נציגה שלנו תיצור קשר לתיאום.\n\n` +
          `${isBusinessHours() ? 'נחזור אליך היום! 😊' : 'נחזור אליך בשעות הפעילות 💛'}`,
        isComplete: true,
        createTask: {
          type:        'כשל תשלום',
          description: `שיטת תשלום: מזומן — ${childName} | לתיאום גביה חודשית`,
          priority:    'רגיל',
        },
      }
    }

    // ── צ׳קים — שואלים כמה ─────────────────────────────────────────────────
    if (chosenMethod === 'checks') {
      return {
        text:
          `📝 *צ׳קים — מצוין!*\n\n` +
          `*כמה צ׳קים תרצו לתת?*\n` +
          `_(למשל: 3, 6, 10 — כל צ׳ק לחודש אחד)_`,
        nextFlow: 'payment_setup_checks',
      }
    }

    // ── העברה בנקאית ─────────────────────────────────────────────────────────
    if (chosenMethod === 'bank_transfer') {
      return {
        text:
          `🏛️ *העברה בנקאית*\n\n` +
          formatBankTransferMessage() +
          `\n\n*סכום להעברה:* ${amount}₪ לחודש\n\n` +
          `לאחר כל העברה — שלחו אישור בצ׳אט ונתעד ✅`,
        isComplete: true,
        createTask: {
          type:        'שאלה כללית',
          description: `שיטת תשלום: העברה בנקאית — ${childName} | לוודא קבלת תשלום`,
          priority:    'רגיל',
        },
      }
    }

    // ── קישור תשלום — חשבונית ירוקה ─────────────────────────────────────────
    if (chosenMethod === 'invoice_link') {
      const invoiceUrl = await getInvoiceLink({
        customerName: session.parentName ?? firstName,
        amount,
        description: `תשלום חודשי Kids & Fun — ${childName}`,
      })

      if (invoiceUrl) {
        return {
          text:
            `🔗 *קישור לתשלום מיידי:*\n\n` +
            `${invoiceUrl}\n\n` +
            `ניתן לשלם בכרטיס אשראי / ביט / פייבוקס.\n` +
            `לאחר התשלום — יישלח אישור אוטומטי 💛`,
          isComplete: true,
          createTask: {
            type:        'שאלה כללית',
            description: `קישור תשלום חשבונית ירוקה נשלח — ${childName}`,
            priority:    'רגיל',
          },
        }
      }

      // קישור לא מוגדר ב-bot_assets
      return {
        text:
          `🔗 *קישור תשלום*\n\n` +
          `${isBusinessHours()
            ? 'נציגה שלנו תשלח לך קישור תשלום עכשיו! 💛'
            : 'נשלח לך קישור תשלום בשעות הפעילות (8:00-17:00) 📬'}`,
        isComplete: true,
        createTask: {
          type:        'שאלה כללית',
          description: `הורה מבקש קישור תשלום מיידי — ${childName} | לשלוח קישור חשבונית ירוקה`,
          priority:    'גבוה',
        },
      }
    }
  }

  // ─── שלב זיהוי 1: שם הילד/ה המלא ─────────────────────────────────────────
  if (step === 'payment_setup_child_name') {
    const nameInput = userMessage.trim().replace(/\s+/g, ' ')
    const words = nameInput.split(' ').filter(w => w.length >= 2)

    // דרושים לפחות שם פרטי + שם משפחה (2 מילים), ללא ספרות
    if (words.length < 2 || /\d/.test(nameInput) || nameInput.length > 60) {
      return {
        text:
          `צריך שם מלא לצורך זיהוי 😊\n\n` +
          `*אנא כתבו שם פרטי + שם משפחה של הילד/ה*\n` +
          `_(למשל: נועה כהן)_`,
        nextFlow: 'payment_setup_child_name',
      }
    }

    session.collectedData.child_name = nameInput
    session.collectedData.identity_confirmed = 'true'

    return {
      text:
        `תודה! ועכשיו —\n\n` +
        `*באיזה אזור ${nameInput} בצהרון?*\n\n` +
        `*1* — כרמל (עתלית והסביבה)\n` +
        `*2* — שרון (רשפון, מתן והסביבה)\n` +
        `*3* — תל אביב`,
      nextFlow: 'payment_setup_area',
    }
  }

  // ─── שלב זיהוי 2: אזור → שליחת הלינק הנכון ───────────────────────────────
  if (step === 'payment_setup_area') {
    const msg = userMessage.trim()
    let areaCode:  string | null = null
    let areaLabel = ''

    if (msg === '1' || /כרמל|עתלית|גלי/.test(msg))                    { areaCode = 'carmel';  areaLabel = 'כרמל' }
    if (msg === '2' || /שרון|רשפון|מתן|צור יצחק/.test(msg))           { areaCode = 'sharon';  areaLabel = 'שרון' }
    if (msg === '3' || /תל אביב|ת"א|תל-אביב|ת״א|תלאביב/.test(msg))    { areaCode = 'telaviv'; areaLabel = 'תל אביב' }

    if (!areaCode) {
      return {
        text:
          `לא הבנתי 😊 באיזה אזור?\n\n` +
          `*1* — כרמל\n` +
          `*2* — שרון\n` +
          `*3* — תל אביב`,
        nextFlow: 'payment_setup_area',
      }
    }

    session.collectedData.area_code  = areaCode
    session.collectedData.area_label = areaLabel

    const childName  = session.collectedData.child_name ?? 'הילד/ה'
    const regId      = session.collectedData.registration_id ?? `bot-${Date.now()}`
    const amount     = parseInt(session.collectedData.monthly_fee ?? String(DEFAULT_MONTHLY_FEE), 10)
    const firstName  = session.parentName?.split(' ')[0] ?? ''
    const isStanding = session.collectedData.payment_method === 'standing_order'
    const description = isStanding
      ? `הוראת קבע — צהרון Kids & Fun | ${childName}`
      : `תשלום חודשי — צהרון Kids & Fun | ${childName}`

    const result = await createPayPlusPaymentLink({
      registrationId: regId,
      parentName:     session.parentName ?? firstName,
      phone:          session.phone,
      childName,
      areaCode,
      areaLabel,
      amount,
      description,
      paymentType:    isStanding ? 'standing_order' : 'credit',
    })

    if (result.success && result.paymentUrl) {
      const demoNote = result.isDemo
        ? `\n\n🔵 *סביבת דמו* — זה קישור לדוגמה (מזהה: ${result.orderId})`
        : ''
      return {
        text:
          `מעולה! ${isStanding ? '🏦 *הוראת קבע*' : '💳 *אשראי*'} עבור *${childName}* (${areaLabel}):\n\n` +
          `🔗 ${result.paymentUrl}\n\n` +
          `לאחר השלמת התשלום — יישלח אישור ${isStanding ? 'והוראת הקבע תופעל אוטומטית' : ''}.` +
          demoNote + `\n\nיש שאלה? כתבו לנו 💛`,
        isComplete: true,
        createTask: {
          type:        'כשל תשלום',
          description: `קישור תשלום ${isStanding ? 'הוראת קבע' : 'אשראי'} נשלח — ילד/ה: ${childName} | אזור: ${areaLabel} | טלפון פונה: ${session.phone} | לוודא שהתשלום נקלט`,
          priority:    'רגיל',
        },
      }
    }

    // PayPlus נכשל → נציגה תטפל
    console.error('[PayPlus] Failed to create payment link:', result.error)
    return {
      text:
        `מצטערים, נתקלנו בבעיה טכנית בהפקת הקישור 😔\n\n` +
        `${isBusinessHours()
          ? 'נציגה שלנו תשלח לך קישור תשלום תוך דקות! 💛'
          : 'נשלח לך קישור תשלום בשעות הפעילות (8:00-17:00) 📬'}`,
      isComplete: true,
      createTask: {
        type:        'כשל תשלום',
        description: `PayPlus error — ${isStanding ? 'הוראת קבע' : 'אשראי'} | ${childName} (${areaLabel}) | err: ${result.error}`,
        priority:    'דחוף',
      },
    }
  }

  // ─── שלב מספר צ׳קים ──────────────────────────────────────────────────────
  if (step === 'payment_setup_checks') {
    const childName = session.collectedData.child_name ?? 'הילד/ה'
    const amount    = parseInt(session.collectedData.monthly_fee ?? String(DEFAULT_MONTHLY_FEE), 10)
    const numChecks = parseInt(userMessage.trim(), 10)

    const validNum = !isNaN(numChecks) && numChecks >= 1 && numChecks <= 12
    if (!validNum) {
      return {
        text: `נא לכתוב מספר בין 1 ל-12 😊`,
        nextFlow: 'payment_setup_checks',
      }
    }

    const totalAmount = amount * numChecks

    return {
      text:
        `📝 *תשלום ב-${numChecks} צ׳קים*\n\n` +
        `• ${numChecks} צ׳קים × ${amount}₪ = *${totalAmount}₪ סה"כ*\n` +
        `• כל צ׳ק לסדר ל*Kids & Fun*\n` +
        `• תאריכי הצ׳קים: ה-1 לכל חודש, רצוף מ-${new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}\n\n` +
        `נציגה שלנו תתאם איתך לקבלת הצ׳קים.\n\n` +
        `${isBusinessHours() ? 'ניצור קשר היום! 💛' : 'ניצור קשר בשעות הפעילות 💛'}`,
      isComplete: true,
      createTask: {
        type:        'שאלה כללית',
        description: `צ׳קים — ${numChecks} צ׳קים × ${amount}₪ | ${childName} | לתיאום קבלת צ׳קים`,
        priority:    'גבוה',
      },
    }
  }

  return {
    text: `😊 כתבו *"אפשרויות תשלום"* להתחיל מחדש.`,
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// מסלול יזום: הצעת מקום מרשימת המתנה
//
// מסלול זה מופעל כאשר:
//   1. הנציגה (מהדשבורד) לוחצת "הצע מקום" על רישום ברשימת המתנה
//   2. המערכת שולחת הודעת WhatsApp פרואקטיבית (ע"י uchat / API)
//   3. ההורה עונה — הבוט קולט את התגובה כאן
//
// session.currentFlow = 'waiting_spot_confirm'
// session.collectedData.child_name, area_code, area_label, registration_id,
//                        waiting_position, monthly_fee
// ═══════════════════════════════════════════════════════════════════════════════
export async function handleWaitingListSpotFlow(
  session:     BotSession,
  userMessage: string
): Promise<BotResponse> {
  const step = session.currentFlow

  // ─── שלב 1: תגובת ההורה להצעת המקום ─────────────────────────────────────
  if (step === 'waiting_spot_confirm') {
    const childName  = session.collectedData.child_name   ?? 'הילד/ה'
    const areaLabel  = session.collectedData.area_label   ?? ''

    if (isYes(userMessage)) {
      // ← מעבר למסלול הסדרת תשלום
      session.collectedData.from_spot_offer = 'true'
      session.currentFlow = 'payment_setup_start'
      return handlePaymentSetupFlow(session, userMessage)
    }

    if (isNo(userMessage)) {
      return {
        text:
          `בסדר גמור 😊\n\n` +
          `תודה על ההודעה — נמשיך לאדם הבא ברשימה.\n\n` +
          `אם תרצו לחזור לרשימת ההמתנה בעתיד — כתבו לנו 💛`,
        isComplete: true,
        createTask: {
          type:        'רשימת המתנה',
          description: `הורה דחה הצעת מקום — ${childName}${areaLabel ? ` ב${areaLabel}` : ''} | לעבור למועמד הבא`,
          priority:    'גבוה',
        },
      }
    }

    // תגובה לא ברורה
    return {
      text:
        `לא הצלחתי להבין 😊\n\n` +
        `כדי לאשר את המקום עבור *${childName}* — כתבו *"כן"*\n` +
        `כדי לוותר — כתבו *"לא"*`,
      nextFlow: 'waiting_spot_confirm',
    }
  }

  return {
    text: `😊 כתבו *"כן"* לאישור המקום, או *"לא"* לוותר.`,
    nextFlow: 'waiting_spot_confirm',
  }
}
