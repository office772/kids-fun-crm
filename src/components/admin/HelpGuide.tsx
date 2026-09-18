'use client'

import { useState } from 'react'
import {
  LayoutDashboard, Users, FileText, ClipboardCheck, ClipboardList, Bot, Link2,
  Settings, Zap, Lightbulb, ChevronDown, ExternalLink, MessageCircle, Pencil, type LucideIcon,
} from 'lucide-react'

interface Section {
  id: string
  icon: LucideIcon
  color: string          // צבע אייקון/קונטור — לתצוגה צבעונית
  title: string
  intro?: string
  points?: string[]
  note?: string          // הדגשה צהובה
  flows?: { name: string; desc: string }[]   // מסלולי בוט: שם + מה ההורה חווה
}

const APP_URL = 'https://kids-fun-app-psi.vercel.app'

const SECTIONS: Section[] = [
  {
    id: 'overview', icon: LayoutDashboard, color: '#6D436D', title: 'סקירה — המסך הראשי',
    points: [
      'התראות דחופות (כשלי תשלום, תזכורות) — לחיצה על השורה פותחת/סוגרת אותה.',
      'מספרים כלליים: הורים, פניות פתוחות, כשלי תשלום, שיחות היום.',
      'תצוגה מקוצרת של הפניות וההורים האחרונים.',
    ],
  },
  {
    id: 'editable', icon: Pencil, color: '#2A6B6B', title: 'מה אפשר לערוך בעצמכם ✏️',
    intro: 'הדברים הבאים נשמרים ומשפיעים על הבוט מיד — אתם שולטים בהם בלי לפנות אלינו:',
    points: [
      'שעות וימי פעילות — דשבורד → תוכן הבוט → הגדרות מערכת → כללי. קובע מתי הבוט מפנה לנציגה מחוץ לשעות.',
      'מחיר צהרון ברירת מחדל — באותו מסך. משמש רק כשאי אפשר לתמחר לפי מסגרת.',
      'מחירי מסגרות + הוספה/הורדה של גנים — פאנל ניהול → מסגרות. הבוט מתמחר לפי המחיר שתגדירו לכל מסגרת.',
      'קול הבוט (הטון והאישיות בתשובות חופשיות) — דשבורד → תוכן הבוט → הגדרות מערכת → קול הבוט.',
      'טקסט הודעות הבוט — דשבורד → תוכן הבוט → תכני הודעות. עריכת הטקסט של הודעות קבועות (התפריט, "לא הבנתי", הודעות העברה לנציגה ועוד). המשתנים בסוגריים {…} נעולים — הבוט ממלא אותם.',
      'שאלות ותשובות — דשבורד → תוכן הבוט → שאלות ותשובות. תשובות אוטומטיות לשאלות נפוצות (שעות, חגים, מחירים).',
      'קיבולת אזורים, צוותי מסגרות, וקישורים/קבצים — פאנל ניהול.',
    ],
    note: '📝 עריכת הטקסט פתוחה כרגע לסט ראשון של הודעות מרכזיות, ותורחב בהדרגה. להודעה שעדיין לא ניתנת לעריכה — פנו לעינת.',
  },
  {
    id: 'parents', icon: Users, color: '#D29486', title: 'הורים',
    points: [
      'חיפוש לפי שם הורה / שם ילד / טלפון.',
      'סינון בדרופדאונים: תשלום, מסגרת, אזור, מקור.',
      'לחיצה על הורה → כרטיס מלא: פרטים, ילדים, תשלומים והיסטוריה.',
      'בהוספת הורה בוחרים גן/בי"ס מרשימה נפתחת לפי האזור (בלי הקלדה), ואפשר להוסיף כמה ילדים תחת אותו הורה.',
      'ייצוא הורים / ייצוא תשלומים → Excel. כפתור "הורה חדש +" להוספה ידנית.',
    ],
  },
  {
    id: 'registrations', icon: FileText, color: '#C98A2B', title: 'רישומים',
    points: [
      'רישומים לצהרון ולקייטנה — אישור ורשימת המתנה.',
      'כרטיסי סטטיסטיקה: מאושרים / ממתינים / רשימת המתנה / סה״כ.',
      'סינון לפי סטטוס וסוג, וייצוא ל-Excel.',
    ],
  },
  {
    id: 'attendance', icon: ClipboardCheck, color: '#5C8A4E', title: 'נוכחות 🆕',
    points: [
      'מתג למעלה: 🎒 צהרון / ☀️ קייטנה.',
      'כל מסגרת היא שורה שנפתחת בלחיצה (אקורדיון): שם הילד/ה, כיתה, הורה, טלפון, מייל.',
      'שני כפתורי ייצוא בכל מסגרת: "רשימה" (פרטים מלאים), ו-"דף נוכחות" — אקסל עם עמודה לכל יום בשבוע, ריק לסימון נוכחות ידני ✓.',
    ],
    note: '📧 פעם בשבוע כל מסגרת מקבלת במייל את רשימת המשתתפים — רק אם הזנת מייל לצוות שלה (פאנל ניהול → צוותי צהרון/קייטנה).',
  },
  {
    id: 'tasks', icon: ClipboardList, color: '#B0455E', title: 'פניות',
    points: [
      'פניות שנפתחו: כשלי תשלום, בקשות, תלונות.',
      'סינון לפי סטטוס וגם לפי נושא (למשל "כשל תשלום" בלבד), חיפוש, ומתג תצוגה כרטיסים/טבלה.',
      'בכל פנייה אפשר לשנות סטטוס: פתוח / בטיפול / טופל.',
    ],
  },
  {
    id: 'bot', icon: Bot, color: '#6D436D', title: 'תוכן הבוט',
    intro: 'עריכת מה שהבוט עונה בוואטסאפ — ארבע לשוניות:',
    points: [
      'מסלולים (קנבן) — תרשים כל מסלולי הבוט, לצפייה והבנה בלבד.',
      'תכני הודעות — ✅ עריכת הטקסט של הודעות הבוט הקבועות (סט ראשון, מתרחב). ערכו רק את הטקסט; המשתנים {…} נעולים והבוט ממלא אותם. כפתור "שחזור לברירת מחדל" מחזיר הודעה למקור.',
      'שאלות ותשובות — ✅ תשובות אוטומטיות לשאלות נפוצות. אפשר לערוך, להוסיף, ולהוסיף מילות מפתח לזיהוי ניסוחים שונים.',
      'הגדרות מערכת — שתי לשוניות פנימיות: "כללי" (✅ שעות וימי פעילות + מחיר ברירת מחדל — שמירה אמיתית, משפיע ישר על הבוט) ו-"קול הבוט".',
    ],
    note: '🗣️ "קול הבוט" קובע את הטון והאישיות של הבוט בתשובות חופשיות — שם פרסונה, מגדר, רמת רשמיות, אמוג׳ים, ביטויים רצויים/אסורים ומילים אסורות. כל עוד ריק — הבוט עונה כמו היום. מלאו בהדרגה ובדקו בסימולטור לפני שמפעילים.',
  },
  {
    id: 'flows', icon: MessageCircle, color: '#2A6B6B', title: 'מסלולי הבוט — מה ההורה חווה בוואטסאפ',
    intro: 'ההורה כותב מספר מהתפריט (1–6) או בשפה חופשית, והבוט מנהל את השיחה:',
    flows: [
      { name: '1 · רישום לצהרון', desc: 'הבוט שואל אזור/גן, שולח קישור לטופס רישום, ואחרי המילוי — קישור לתשלום (הוראת קבע) לפי המסגרת.' },
      { name: '2 · רישום לקייטנה', desc: 'הבוט מפנה לקישור ההרשמה באתר (הקייטנות נרשמות ומשולמות באתר).' },
      { name: '3 · ביטול', desc: 'לפי התקנון — צהרון: ביטול עד ה-15 בחודש = זיכוי מלא, אחרי ה-15 = ממשיכים חודש נוסף. הבוט מבטל את הוראת הקבע אוטומטית.' },
      { name: '4 · שעות ולוח זמנים', desc: 'הבוט עונה על שעות פעילות, חגים וחופשות — מתוך "שאלות ותשובות" (ניתן לעריכה מהדשבורד).' },
      { name: '5 · תשלומים', desc: 'הבוט שולח קישור תשלום מאובטח לפי הגן/בי"ס. אף פעם לא אוסף פרטי כרטיס אשראי.' },
      { name: '6 · איסוף מוקדם', desc: 'ההורה מודיע על איסוף מוקדם; הבוט מאשר ומעדכן את צוות המסגרת הרלוונטית (+ עותק לאדמין).' },
      { name: '⏳ רשימת המתנה', desc: 'אם אין מקום פנוי (באזור או בגן שהגדרת לו תקרה) — ההורה מתווסף לרשימת המתנה ומקבל עדכון כשמתפנה מקום.' },
      { name: '💳 כשל תשלום', desc: 'אם חיוב נכשל — הבוט פונה להורה להסדרה (עדכון כרטיס / אמצעי אחר / שינוי תאריך / תזכורת / נציגה), ונפתחת פנייה.' },
      { name: '💬 שאלות כלליות', desc: 'כל שאלה אחרת — הבוט עונה מתוך מאגר השאלות-ותשובות. הוא גם מכיר את המסגרת והצוות של ההורה, אז כששואלים על הגן או "מי הרכזת שלי" הוא משלב את המידע (מתוך הצוות שהזנת). אם אינו יודע — מפנה בעדינות לנציגה.' },
    ],
    note: '🔒 לפני כל פעולה כספית הבוט מאמת זהות (טלפון + שם הילד). הבוט אף פעם לא מבקש פרטי כרטיס אשראי.',
  },
  {
    id: 'assets', icon: Link2, color: '#D29486', title: 'קבצים וקישורים',
    points: [
      'הקישורים והקבצים שהבוט שולח (טפסים, PDF, תמונות, קישורי תשלום).',
      'כל פריט מקבל מפתח — לחיצה עליו מעתיקה אותו להדבקה בטקסטי הבוט.',
      'אפשר להעלות PDF/תמונה, לערוך URL, ולכבות/להפעיל.',
    ],
  },
  {
    id: 'admin', icon: Settings, color: '#C98A2B', title: 'פאנל ניהול',
    points: [
      'קיבולת אזורים — כמה ילדים אפשר לרשום לכל אזור.',
      'מסגרות (גנים/בתי״ס) — ✅ הוספת מסגרת חדשה, קביעת מחיר חודשי וקיבולת, עריכת קיימות, וכיבוי מסגרת (נעלמת מהבוט בלי לאבד היסטוריה). הבוט מתמחר לפי המחיר שכאן; מחיר ריק = הבוט מפנה לנציגה. קיבולת ריקה = ללא הגבלה; כשגן מתמלא — נרשמים חדשים עוברים אוטומטית לרשימת המתנה.',
      'צוותי צהרון / צוותי קייטנה — אנשי הצוות של כל מסגרת.',
      'סימולטור בוט — לבדוק את הבוט בסביבה בטוחה (כולל איפוס פונה לבדיקה).',
      'סנכרון נתונים — ייבוא היסטורי מחשבונית ירוקה (חד-פעמי).',
    ],
    note: '👈 חשוב: הזנת מייל לצוות בכל מסגרת מפעילה שני דברים — גם רשימת הנוכחות השבועית במייל, וגם מענה הבוט להורה "מי הרכזת שלי".',
  },
  {
    id: 'auto', icon: Zap, color: '#5C8A4E', title: 'מה קורה אוטומטית (בלי שתעשי כלום)',
    points: [
      'הבוט בוואטסאפ עונה להורים: רישום, ביטול, שעות, תשלומים, איסוף מוקדם, רשימת המתנה.',
      'תשלומים מ-PayPlus ומחשבונית ירוקה נכנסים אוטומטית.',
      'כשל תשלום → הבוט פונה להורה, ונפתחת פנייה במערכת.',
      'רשימת נוכחות שבועית נשלחת לצוות; תזכורות והצעות מקום נשלחות בזמנן.',
    ],
  },
  {
    id: 'tips', icon: Lightbulb, color: '#6D436D', title: 'טיפים',
    points: [
      'רענון: אם משהו נראה לא מעודכן — Cmd/Ctrl + Shift + R.',
      'נייד: המערכת עובדת גם מהטלפון — התפריט נפתח בכפתור ☰.',
      'הבוט אסור לאסוף פרטי כרטיס אשראי — רק שולח קישור מאובטח או מפנה לנציגה.',
    ],
  },
]

export function HelpGuide() {
  const [open, setOpen] = useState<string | null>('overview')

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-1"
          style={{ fontFamily: 'var(--font-rubik), Rubik, sans-serif', color: 'var(--crm-primary)' }}>
          מדריך שימוש 📖
        </h1>
        <p className="text-sm text-crm-text-muted">כל מה שצריך לדעת על המערכת — בלי ידע טכני. לחצי על נושא כדי לפתוח.</p>
        <a href={APP_URL} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium px-3 py-1.5 rounded-full transition-colors hover:bg-crm-surface-soft"
          style={{ color: 'var(--crm-primary)', border: '1px solid var(--crm-border)' }}>
          <ExternalLink size={14} /> כתובת המערכת (לשמור כסימנייה)
        </a>
      </div>

      {/* Accordion */}
      <div className="space-y-3">
        {SECTIONS.map(s => {
          const isOpen = open === s.id
          const Icon = s.icon
          return (
            <section key={s.id} className="bg-crm-surface border border-crm-border rounded-crm shadow-crm overflow-hidden"
              style={isOpen ? { borderRightWidth: 4, borderRightColor: s.color } : undefined}>
              <button onClick={() => setOpen(isOpen ? null : s.id)}
                className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-4 text-right" aria-expanded={isOpen}>
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: s.color }}>
                    <Icon size={18} color="#fff" />
                  </span>
                  <span className="font-bold text-base sm:text-lg truncate" style={{ color: 'var(--crm-text)' }}>{s.title}</span>
                </span>
                <ChevronDown size={20} style={{ color: 'var(--crm-text-muted)', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
              </button>

              {isOpen && (
                <div className="px-4 sm:px-5 pb-5 pt-0 border-t border-crm-border">
                  {s.intro && <p className="text-sm text-crm-text mt-3 mb-1">{s.intro}</p>}
                  {s.points && (
                    <ul className="mt-3 space-y-2">
                      {s.points.map((p, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-crm-text">
                          <span className="mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.flows && (
                    <div className="mt-3 space-y-2.5">
                      {s.flows.map(f => (
                        <div key={f.name} className="flex items-start gap-2.5">
                          <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                          <p className="text-sm leading-relaxed text-crm-text">
                            <span className="font-bold" style={{ color: 'var(--crm-primary)' }}>{f.name}</span>
                            <span className="text-crm-text-muted"> — {f.desc}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {s.note && (
                    <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg"
                      style={{ background: 'var(--crm-warning-bg)', border: '1px solid var(--crm-action)' }}>
                      <Zap size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--crm-warning)' }} />
                      <p className="text-xs text-crm-text leading-relaxed">{s.note}</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <p className="text-center text-xs text-crm-text-muted pt-2">📞 לתמיכה טכנית או שינויים — עינת גן אל</p>
    </div>
  )
}
