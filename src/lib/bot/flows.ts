import { BotIntent, BotSession } from '@/lib/types'

export interface BotResponse {
  text: string
  escalate?: boolean       // האם להסלים לנציג אנושי
  createTask?: {
    type: string
    description: string
    priority: 'דחוף' | 'גבוה' | 'רגיל'
  }
  nextFlow?: string        // המסלול הבא לאחר תשובה זו
  isComplete?: boolean     // האם המסלול הסתיים
}

const BOT_NAME = 'Kids & Fun'

// =========================================
// בדיקת שעות פעילות
// =========================================
export function isBusinessHours(): boolean {
  const now = new Date()
  const day = now.getDay() // 0=ראשון, 6=שבת
  const hour = now.getHours()

  const businessDays = [0, 1, 2, 3, 4] // ראשון-חמישי
  const startHour = 8
  const endHour = 17

  return businessDays.includes(day) && hour >= startHour && hour < endHour
}

// =========================================
// מסלול 1: רישום לצהרון
// =========================================
export function handleRegistrationFlow(session: BotSession, userMessage: string): BotResponse {
  const step = session.currentFlow

  if (!step || step === 'register_start') {
    return {
      text: `היי ${session.parentName || 'שם'} 😊\n\nשמחים שאתם רוצים להצטרף אלינו!\n\nכדי לרשום את הילד/ה לצהרון, אני צריכה כמה פרטים קטנים:\n\n*מה שם הילד/ה?*`,
      nextFlow: 'register_child_name'
    }
  }

  if (step === 'register_child_name') {
    return {
      text: `תודה! *${userMessage}* — איזה שם יפה 💛\n\nבאיזו כיתה הילד/ה?`,
      nextFlow: 'register_class'
    }
  }

  if (step === 'register_class') {
    return {
      text: `מצוין! כיתה *${userMessage}*.\n\nאני בודקת מקום פנוי... 🔍\n\nיש מקום! ✅\n\nשולחת לך קישור לטופס הרישום המלא. אחרי שתמלא/י, נאשר את ההרשמה ונשלח אישור.\n\n📋 *[קישור לטופס רישום]*\n\nיש שאלות? אני כאן!`,
      isComplete: true,
      createTask: {
        type: 'שאלה כללית',
        description: `בקשת רישום לצהרון — ילד/ה בכיתה ${userMessage}`,
        priority: 'רגיל'
      }
    }
  }

  return { text: 'משהו השתבש, בוא/י נתחיל מחדש. מה שמך?' }
}

// =========================================
// מסלול 3: ביטול לפי תקנון
// =========================================
export function handleCancellationFlow(session: BotSession): BotResponse {
  const today = new Date().getDate()
  const dayOfMonth = today

  const policyText = `📋 *מדיניות ביטולים — Kids & Fun*\n\n` +
    `• ביטול *עד ה-15 לחודש* ← זיכוי מלא, הילד/ה ממשיך/ה עד סוף החודש\n` +
    `• ביטול *אחרי ה-15 לחודש* ← זיכוי לחצי חודש הבא\n\n`

  if (dayOfMonth <= 15) {
    return {
      text: policyText +
        `📅 היום ה-${dayOfMonth} לחודש — אתם *בתוך חלון הביטול*.\n\n` +
        `כדי לאשר את הביטול, אני צריכה לדעת:\n*מאיזה תאריך תרצו להפסיק?*`,
      createTask: {
        type: 'ביטול חריג',
        description: `בקשת ביטול — יום ${dayOfMonth} לחודש (בתוך תקנון)`,
        priority: 'רגיל'
      }
    }
  } else {
    return {
      text: policyText +
        `📅 היום ה-${dayOfMonth} לחודש — הביטול הוא *אחרי ה-15*.\n\n` +
        `לפי התקנון, תקבלו זיכוי לחצי חודש הבא.\n\n` +
        `לביטולים חריגים (מעבר דירה, מקרה רפואי וכו') — ` +
        `${isBusinessHours()
          ? 'נציג שלנו יטפל בבקשתך בהקדם.'
          : 'נחזור אליך בשעות הפעילות (ראשון-חמישי 8:00-17:00).'}`,
      escalate: !isBusinessHours(),
      createTask: {
        type: 'ביטול חריג',
        description: `בקשת ביטול — יום ${dayOfMonth} לחודש (חריג לתקנון)`,
        priority: 'גבוה'
      },
      isComplete: true
    }
  }
}

// =========================================
// מסלול 4/5: קייטנה
// =========================================
export function handleCampRegistrationFlow(): BotResponse {
  const today = new Date()
  const registrationDeadline = new Date(today.getFullYear(), 5, 1) // 1 יוני — לשנות לפי הצורך
  const isBeforeDeadline = today < registrationDeadline

  if (isBeforeDeadline) {
    return {
      text: `🏕️ *רישום לקייטנה קיץ!*\n\n` +
        `הרישום פתוח! 🎉\n\n` +
        `תוכלו להירשם ולשלם ישירות דרך האתר שלנו:\n` +
        `📲 *[קישור לרישום קייטנה]*\n\n` +
        `יש בעיה בהרשמה? כתבו לנו ונסייע!`,
      isComplete: true
    }
  } else {
    return {
      text: `🏕️ *קייטנה קיץ*\n\n` +
        `מועד הרישום הרשמי נסגר 😔\n\n` +
        `אבל לא נגיד לא לפני שבדקנו! 😊\n\n` +
        `כדי שנבדוק אם יש מקום, אני צריכה:\n*שם מלא של הילד/ה?*`,
      nextFlow: 'camp_late_name'
    }
  }
}

export function handleLateCampFlow(session: BotSession, userMessage: string): BotResponse {
  const step = session.currentFlow

  if (step === 'camp_late_name') {
    return {
      text: `${userMessage} — מה הכיתה?`,
      nextFlow: 'camp_late_class'
    }
  }

  if (step === 'camp_late_class') {
    return {
      text: `תודה! קיבלתי את הפרטים ✅\n\n` +
        `אני בודקת אם יש מקום זמין ו*חוזרת אליך תוך יום עסקים*.\n\n` +
        `${isBusinessHours()
          ? 'ניצור קשר בהמשך היום!'
          : 'ניצור קשר מחר בבוקר! 🌅'}`,
      isComplete: true,
      createTask: {
        type: 'רישום מאוחר',
        description: `בקשת רישום לקייטנה אחרי סגירת מועד — כיתה ${userMessage}`,
        priority: 'גבוה'
      }
    }
  }

  return { text: 'בוא/י נתחיל מחדש. מה שם הילד/ה?' }
}

// =========================================
// מסלול 6: שאלות לו"ז וחגים
// =========================================
export function handleScheduleFlow(message: string): BotResponse {
  const lowerMsg = message.toLowerCase()

  if (lowerMsg.includes('שעות') || lowerMsg.includes('מתי פתוח') || lowerMsg.includes('שעה')) {
    return {
      text: `⏰ *שעות פעילות הצהרון:*\n\n` +
        `ראשון עד חמישי: 13:00 – 18:00\n` +
        `שישי ושבת: סגור\n\n` +
        `השעות עשויות להשתנות בחגים ובמיוחד בתקופת הקיץ.\n\n` +
        `יש שאלה נוספת? 😊`,
      isComplete: true
    }
  }

  if (lowerMsg.includes('חג') || lowerMsg.includes('חגים')) {
    return {
      text: `📅 *ימי חג קרובים:*\n\n` +
        `• שבועות — 2 ביוני (סגור)\n` +
        `• ט' באב — 3 באוגוסט (סגור)\n` +
        `• ראש השנה — 20-22 בספטמבר (סגור)\n` +
        `• יום כיפור — 29 בספטמבר (סגור)\n\n` +
        `לוח החגים המלא נשלח בתחילת כל שנה 📬\n\n` +
        `יש שאלה נוספת?`,
      isComplete: true
    }
  }

  return {
    text: `📋 *מידע על הצהרון:*\n\n` +
      `ראשון-חמישי: 13:00 – 18:00\n\n` +
      `לשאלות ספציפיות על לו"ז — ` +
      `${isBusinessHours()
        ? 'נציגה שלנו זמינה לענות!'
        : 'נחזור אליך בשעות הפעילות 😊'}`,
    isComplete: true
  }
}

// =========================================
// מסלול 5: איסוף מוקדם
// =========================================
export function handleEarlyPickupFlow(session: BotSession): BotResponse {
  return {
    text: `👋 *בקשת איסוף מוקדם*\n\n` +
      `קיבלנו! כדי לאשר, אני צריכה:\n\n` +
      `1️⃣ שם הילד/ה\n` +
      `2️⃣ השעה המבוקשת\n` +
      `3️⃣ שם האוסף/ת (אם לא הורה)\n\n` +
      `תוכלו לשלוח הכל בהודעה אחת 😊`,
    createTask: {
      type: 'שאלה כללית',
      description: 'בקשת איסוף מוקדם — לעדכון צוות',
      priority: 'גבוה'
    },
    isComplete: true
  }
}

// =========================================
// מסלול 7א: כשל תשלום — פנייה מצד ההורה
// =========================================
export function handlePaymentFailureParentFlow(): BotResponse {
  return {
    text: `💳 *בעיית תשלום*\n\n` +
      `היי! קיבלנו את פנייתך 💛\n\n` +
      `${isBusinessHours()
        ? 'נציגה שלנו תיצור איתך קשר טלפוני בהמשך היום לסיוע.'
        : 'ניצור איתך קשר בבוקר הקרוב (8:00-17:00) לסיוע.'}\n\n` +
      `בינתיים, האם :\n` +
      `• *החלפת כרטיס אשראי?*\n` +
      `• *תרצה/י לעבור לאמצעי תשלום אחר?* (צ'ק, מזומן, הוראת קבע)\n\n` +
      `כתוב/י לנו ונסתדר יחד 😊`,
    createTask: {
      type: 'כשל תשלום',
      description: 'הורה פנה על בעיית תשלום — יצירת קשר טלפוני נדרש',
      priority: 'דחוף'
    },
    isComplete: true
  }
}

// =========================================
// מסלול 7ב: כשל תשלום — פנייה יזומה מהמערכת
// =========================================
export function buildProactivePaymentMessage(parentName: string): string {
  const firstName = parentName.split(' ')[0] || parentName
  return `היי ${firstName}, מה שלומך? הכל בסדר? 😊\n\n` +
    `הבנק ניסה לחייב את הכרטיס שלך אבל לא הצלחנו.\n\n` +
    `האם החלפת כרטיס אולי? 💳\n\n` +
    `_אין דאגות — מטפלים ביחד!_`
}

// =========================================
// בדיקת תשלום — סטטוס
// =========================================
export function handlePaymentStatusFlow(parentName?: string): BotResponse {
  return {
    text: `💰 *סטטוס תשלום*\n\n` +
      `אני בודקת את הסטטוס שלך... 🔍\n\n` +
      `לפרטים מדויקים על החשבון שלך, ` +
      `${isBusinessHours()
        ? 'נציגה שלנו יכולה לעזור.'
        : 'נחזור אליך בשעות הפעילות.'}\n\n` +
      `להסדרת תשלום עכשיו — שלח/י *"בעיה בתשלום"* ונעזור! 😊`,
    isComplete: true
  }
}

// =========================================
// פתיחת שיחה — ברכה ותפריט
// =========================================
export function buildWelcomeMessage(parentName?: string): string {
  const greeting = parentName ? `היי ${parentName.split(' ')[0]} 😊\n\n` : `שלום! 😊\n\n`

  return greeting +
    `כאן ${BOT_NAME}! איך אפשר לעזור?\n\n` +
    `*1* — רישום לצהרון\n` +
    `*2* — רישום לקייטנה\n` +
    `*3* — ביטול\n` +
    `*4* — שעות ולוח זמנים\n` +
    `*5* — תשלומים\n` +
    `*6* — איסוף מוקדם\n\n` +
    `או פשוט כתוב/י מה צריך 💬`
}

// =========================================
// הסלמה לנציג
// =========================================
export function buildEscalationMessage(): string {
  if (isBusinessHours()) {
    return `בוקר טוב! העברתי את פנייתך לנציגה שלנו — היא תחזור אליך בהקדם 💛`
  }
  return `קיבלתי! הפנייה שלך תועברת לנציגה בשעות הפעילות (ראשון-חמישי 8:00-17:00) 📬\n\nלילה טוב! 🌙`
}

// =========================================
// הודעה חוץ לשעות
// =========================================
export function buildAfterHoursMessage(): string {
  return `קיבלנו את פנייתך! 📬\n\n` +
    `אנחנו פעילים ראשון-חמישי 8:00-17:00.\n` +
    `ניחזור אליך בשעות הפעילות 💛\n\n` +
    `שאלות שיכולות להמתין לשיחה — נשמח לעזור גם עכשיו! 😊`
}
