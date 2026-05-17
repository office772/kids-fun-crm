import { Parent, Task } from '@/lib/types'

const now = new Date()
const d = (days: number) => new Date(now.getTime() - days * 86400000).toISOString()

export const DEMO_PARENTS: Parent[] = [
  {
    id: 'p1',
    phone: '972501234567',
    name: 'רונית כהן',
    email: 'ronit@example.com',
    created_at: d(30),
    updated_at: d(2),
    children: [{ id: 'c1', parent_id: 'p1', name: 'נועה כהן', class_name: 'א1', framework: 'צהרון', created_at: d(30) }],
    payments: [{ id: 'pay1', parent_id: 'p1', amount: 800, currency: 'ILS', status: 'שולם', due_date: d(5), proactive_sent: false, last_checked: d(1), created_at: d(30) }],
    tasks: [],
    conversations: [
      { id: 'cv1', parent_id: 'p1', phone: '972501234567', platform: 'whatsapp', direction: 'נכנס', message_text: 'שלום, מה שעות הצהרון?', intent: 'שאלת_לוז', handled_by: 'בוט', created_at: d(2) },
      { id: 'cv2', parent_id: 'p1', phone: '972501234567', platform: 'whatsapp', direction: 'יוצא', message_text: 'שלום רונית! הצהרון פתוח ראשון-חמישי 13:00-18:00 😊', intent: 'שאלת_לוז', handled_by: 'בוט', created_at: d(2) },
    ]
  },
  {
    id: 'p2',
    phone: '972521234567',
    name: 'אבי לוי',
    email: 'avi@example.com',
    created_at: d(25),
    updated_at: d(1),
    children: [{ id: 'c2', parent_id: 'p2', name: 'יוסי לוי', class_name: 'ב2', framework: 'צהרון', created_at: d(25) }],
    payments: [{ id: 'pay2', parent_id: 'p2', amount: 800, currency: 'ILS', status: 'ממתין', due_date: new Date(now.getTime() + 10 * 86400000).toISOString(), proactive_sent: false, last_checked: d(1), created_at: d(25) }],
    tasks: [{ id: 't4', parent_id: 'p2', type: 'שאלה כללית', description: 'שאל על מדיניות ביטולים', status: 'פתוח', priority: 'רגיל', created_at: d(1), updated_at: d(1) }],
    conversations: [
      { id: 'cv3', parent_id: 'p2', phone: '972521234567', platform: 'whatsapp', direction: 'נכנס', message_text: 'מתי בקשת ביטול?', intent: 'ביטול', handled_by: 'בוט', created_at: d(1) },
      { id: 'cv4', parent_id: 'p2', phone: '972521234567', platform: 'whatsapp', direction: 'יוצא', message_text: 'שלום אבי! ביטול עד ה-15 = זיכוי מלא. אחרי ה-15 = זיכוי לחצי חודש הבא.', intent: 'ביטול', handled_by: 'בוט', created_at: d(1) },
    ]
  },
  {
    id: 'p3',
    phone: '972531234567',
    name: 'מיכל גולן',
    email: 'michal@example.com',
    created_at: d(20),
    updated_at: d(0),
    children: [{ id: 'c3', parent_id: 'p3', name: 'תמר גולן', class_name: 'ג1', framework: 'קייטנה', created_at: d(20) }],
    payments: [{ id: 'pay3', parent_id: 'p3', amount: 1200, currency: 'ILS', status: 'שולם', due_date: d(2), proactive_sent: false, last_checked: d(0), created_at: d(20) }],
    tasks: [{ id: 't5', parent_id: 'p3', type: 'רישום מאוחר', description: 'בקשת רישום לקייטנה אחרי סגירת המועד — לבדוק מקום', status: 'פתוח', priority: 'גבוה', created_at: d(0), updated_at: d(0) }],
    conversations: [
      { id: 'cv5', parent_id: 'p3', phone: '972531234567', platform: 'whatsapp', direction: 'נכנס', message_text: 'אפשר להירשם לקייטנה גם עכשיו?', intent: 'רישום_קייטנה', handled_by: 'בוט', created_at: d(0) },
      { id: 'cv6', parent_id: 'p3', phone: '972531234567', platform: 'whatsapp', direction: 'יוצא', message_text: 'מועד הרישום נסגר, אבל לא נגיד לא לפני שבדקנו! אני בודקת אם יש מקום...', intent: 'רישום_קייטנה', handled_by: 'בוט', created_at: d(0) },
    ]
  },
  {
    id: 'p4',
    phone: '972541234567',
    name: 'דני פרץ',
    created_at: d(15),
    updated_at: d(0),
    children: [{ id: 'c4', parent_id: 'p4', name: 'אורי פרץ', class_name: 'א3', framework: 'צהרון', created_at: d(15) }],
    payments: [{ id: 'pay4', parent_id: 'p4', amount: 800, currency: 'ILS', status: 'נכשל', due_date: d(3), failure_reason: 'כרטיס פג תוקף', proactive_sent: true, last_checked: d(0), created_at: d(15) }],
    tasks: [{ id: 't1', parent_id: 'p4', type: 'כשל תשלום', description: 'כרטיס אשראי נכשל — יצירת קשר לעדכון פרטים', status: 'פתוח', priority: 'דחוף', created_at: d(0), updated_at: d(0) }],
    conversations: [
      { id: 'cv7', parent_id: 'p4', phone: '972541234567', platform: 'whatsapp', direction: 'יוצא', message_text: 'היי דני, מה שלומך? הבנק ניסה לחייב את הכרטיס שלך אבל לא הצלחנו. האם החלפת כרטיס אולי? 💳', intent: 'כשל_תשלום_יזום', handled_by: 'בוט', created_at: d(0) },
      { id: 'cv8', parent_id: 'p4', phone: '972541234567', platform: 'whatsapp', direction: 'נכנס', message_text: 'כן הכרטיס הוחלף, תחזרו אלי', intent: 'כשל_תשלום', handled_by: 'בוט', created_at: d(0) },
    ]
  },
  {
    id: 'p5',
    phone: '972551234567',
    name: 'שרה אברהם',
    created_at: d(10),
    updated_at: d(0),
    children: [{ id: 'c5', parent_id: 'p5', name: 'מיה אברהם', class_name: 'ב1', framework: 'צהרון', created_at: d(10) }],
    payments: [{ id: 'pay5', parent_id: 'p5', amount: 800, currency: 'ILS', status: 'נכשל', due_date: d(1), proactive_sent: false, last_checked: d(0), created_at: d(10) }],
    tasks: [{ id: 't2', parent_id: 'p5', type: 'כשל תשלום', description: 'הוראת קבע נכשלה — ממתין לתגובה', status: 'בטיפול', priority: 'דחוף', created_at: d(0), updated_at: d(0) }],
    conversations: [
      { id: 'cv9', parent_id: 'p5', phone: '972551234567', platform: 'whatsapp', direction: 'יוצא', message_text: 'היי שרה, מה שלומך? הבנק ניסה לחייב את הכרטיס שלך אבל לא הצלחנו. האם החלפת כרטיס אולי? 💳', intent: 'כשל_תשלום_יזום', handled_by: 'בוט', created_at: d(0) },
    ]
  },
]

export const DEMO_TASKS: Task[] = DEMO_PARENTS.flatMap(p =>
  (p.tasks || []).map(t => ({ ...t, parent: { id: p.id, name: p.name, phone: p.phone, created_at: p.created_at, updated_at: p.updated_at } }))
)

export function isDemoMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  return !url || url === 'YOUR_SUPABASE_URL' || url.includes('YOUR_')
}
