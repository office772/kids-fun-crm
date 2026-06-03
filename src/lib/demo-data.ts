import { Parent, Task, RegistrationTimeline, Registration, FAQ } from '@/lib/types'

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

// ─── Demo Registrations ───────────────────────────────────────────────────────
export const DEMO_REGISTRATIONS: Registration[] = [
  {
    id: 'reg1', parent_id: 'p1', child_id: 'c1',
    type: 'צהרון', status: 'מאושר',
    area_code: 'sharon', area_label: 'דרום השרון / חוף השרון',
    approved_at: d(28), created_at: d(30), updated_at: d(28),
    parent: { id: 'p1', name: 'רונית כהן', phone: '972501234567', created_at: d(30), updated_at: d(2) },
    child: { id: 'c1', parent_id: 'p1', name: 'נועה כהן', class_name: 'א1', framework: 'צהרון', created_at: d(30) },
  },
  {
    id: 'reg2', parent_id: 'p2', child_id: 'c2',
    type: 'צהרון', status: 'מאושר',
    area_code: 'carmel', area_label: 'חוף הכרמל',
    approved_at: d(23), created_at: d(25), updated_at: d(23),
    parent: { id: 'p2', name: 'אבי לוי', phone: '972521234567', created_at: d(25), updated_at: d(1) },
    child: { id: 'c2', parent_id: 'p2', name: 'יוסי לוי', class_name: 'ב2', framework: 'צהרון', created_at: d(25) },
  },
  {
    id: 'reg3', parent_id: 'p3', child_id: 'c3',
    type: 'קייטנה', status: 'ממתין לאישור',
    area_code: 'telaviv', area_label: 'גני ילדים תל אביב',
    created_at: d(1), updated_at: d(1),
    parent: { id: 'p3', name: 'מיכל גולן', phone: '972531234567', created_at: d(20), updated_at: d(0) },
    child: { id: 'c3', parent_id: 'p3', name: 'תמר גולן', class_name: 'ג1', framework: 'קייטנה', created_at: d(20) },
  },
  {
    id: 'reg4', parent_id: 'p4', child_id: 'c4',
    type: 'צהרון', status: 'רשימת המתנה', waiting_list_position: 1,
    area_code: 'sharon', area_label: 'דרום השרון / חוף השרון',
    created_at: d(14), updated_at: d(14),
    parent: { id: 'p4', name: 'דני פרץ', phone: '972541234567', created_at: d(15), updated_at: d(0) },
    child: { id: 'c4', parent_id: 'p4', name: 'אורי פרץ', class_name: 'א3', framework: 'צהרון', created_at: d(15) },
  },
  {
    id: 'reg5', parent_id: 'p5', child_id: 'c5',
    type: 'צהרון', status: 'מאושר',
    area_code: 'sharon', area_label: 'דרום השרון / חוף השרון',
    approved_at: d(8), created_at: d(10), updated_at: d(8),
    parent: { id: 'p5', name: 'שרה אברהם', phone: '972551234567', created_at: d(10), updated_at: d(0) },
    child: { id: 'c5', parent_id: 'p5', name: 'מיה אברהם', class_name: 'ב1', framework: 'צהרון', created_at: d(10) },
  },
  // ─── רישום נוסף לבדיקת מסלול ממתין לאישור + תשלום ────────────────────────
  {
    id: 'reg6', parent_id: 'p1', child_id: 'c1',
    type: 'צהרון', status: 'ממתין לאישור',
    area_code: 'carmel', area_label: 'חוף הכרמל',
    created_at: d(3), updated_at: d(3),
    notes: 'הצעת מקום נשלחה — ממתין לתשובה',
    parent: { id: 'p1', name: 'רונית כהן', phone: '972501234567', created_at: d(30), updated_at: d(2) },
    child: { id: 'c1', parent_id: 'p1', name: 'נועה כהן', class_name: 'א1', framework: 'צהרון', created_at: d(30) },
  },
]

// ─── Demo Timeline ────────────────────────────────────────────────────────────
export const DEMO_TIMELINE: Record<string, RegistrationTimeline[]> = {
  p1: [
    { id: 'tl1', parent_id: 'p1', registration_id: 'reg1', event_type: 'status_change', old_value: 'ממתין לאישור', new_value: 'מאושר', description: 'שינוי סטטוס: ממתין לאישור → מאושר', performed_by: 'נציג', created_at: d(28) },
    { id: 'tl2', parent_id: 'p1', event_type: 'message_received', new_value: 'שאלת_לוז', description: 'הורה שאל על שעות הצהרון', performed_by: 'הורה', created_at: d(2) },
    { id: 'tl3', parent_id: 'p1', event_type: 'message_sent', new_value: 'שאלת_לוז', description: 'הבוט השיב על שעות פעילות', performed_by: 'בוט', created_at: d(2) },
    { id: 'tl4', parent_id: 'p1', registration_id: 'reg1', event_type: 'system_note', description: 'רישום לצהרון נוצר דרך הבוט', performed_by: 'בוט', created_at: d(30) },
    { id: 'tl5', parent_id: 'p1', event_type: 'payment', new_value: 'שולם', description: 'תשלום חודשי התקבל — ₪800', performed_by: 'מערכת', metadata: { amount: 800, status: 'שולם' }, created_at: d(5) },
  ],
  p2: [
    { id: 'tl6', parent_id: 'p2', registration_id: 'reg2', event_type: 'status_change', old_value: 'ממתין לאישור', new_value: 'מאושר', description: 'שינוי סטטוס: ממתין לאישור → מאושר', performed_by: 'נציג', created_at: d(23) },
    { id: 'tl7', parent_id: 'p2', registration_id: 'reg2', event_type: 'system_note', description: 'רישום לצהרון — כיתה ב2', performed_by: 'בוט', created_at: d(25) },
    { id: 'tl8', parent_id: 'p2', event_type: 'message_received', new_value: 'ביטול', description: 'הורה שאל על מדיניות ביטולים', performed_by: 'הורה', created_at: d(1) },
    { id: 'tl9', parent_id: 'p2', event_type: 'message_sent', description: 'הבוט הסביר את מדיניות הביטולים', performed_by: 'בוט', created_at: d(1) },
    { id: 'tl10', parent_id: 'p2', event_type: 'task_created', description: 'נוצרה משימה: שאל על מדיניות ביטולים', performed_by: 'בוט', metadata: { priority: 'רגיל' }, created_at: d(1) },
  ],
  p3: [
    { id: 'tl11', parent_id: 'p3', registration_id: 'reg3', event_type: 'system_note', description: 'בקשת רישום לקייטנה נתקבלה דרך הבוט', performed_by: 'בוט', created_at: d(1) },
    { id: 'tl12', parent_id: 'p3', event_type: 'message_received', new_value: 'רישום_קייטנה', description: 'הורה שאל על רישום לקייטנה', performed_by: 'הורה', created_at: d(1) },
    { id: 'tl13', parent_id: 'p3', event_type: 'message_sent', description: 'הבוט עבד לאחר סגירת המועד — אוסף פרטים', performed_by: 'בוט', created_at: d(1) },
    { id: 'tl14', parent_id: 'p3', event_type: 'task_created', description: 'נוצרה משימה: רישום מאוחר לקייטנה — לבדוק מקום', performed_by: 'בוט', metadata: { priority: 'גבוה' }, created_at: d(0) },
    { id: 'tl15', parent_id: 'p3', event_type: 'payment', new_value: 'שולם', description: 'תשלום קייטנה התקבל — ₪1200', performed_by: 'מערכת', metadata: { amount: 1200, status: 'שולם' }, created_at: d(2) },
  ],
  p4: [
    { id: 'tl16', parent_id: 'p4', registration_id: 'reg4', event_type: 'status_change', old_value: 'ממתין לאישור', new_value: 'רשימת המתנה', description: 'הועבר לרשימת המתנה — מקום 3', performed_by: 'נציג', created_at: d(13) },
    { id: 'tl17', parent_id: 'p4', registration_id: 'reg4', event_type: 'system_note', description: 'רישום לצהרון — כיתה א3 — אין מקום פנוי', performed_by: 'בוט', created_at: d(14) },
    { id: 'tl18', parent_id: 'p4', event_type: 'payment', old_value: 'ממתין', new_value: 'נכשל', description: 'כשל בחיוב כרטיס אשראי — כרטיס פג תוקף', performed_by: 'מערכת', metadata: { amount: 800, failure_reason: 'כרטיס פג תוקף' }, created_at: d(3) },
    { id: 'tl19', parent_id: 'p4', event_type: 'message_sent', new_value: 'כשל_תשלום_יזום', description: 'הבוט שלח הודעה יזומה על כשל תשלום', performed_by: 'בוט', created_at: d(3) },
    { id: 'tl20', parent_id: 'p4', event_type: 'task_created', description: 'נוצרה משימה דחופה: כרטיס אשראי נכשל', performed_by: 'בוט', metadata: { priority: 'דחוף' }, created_at: d(3) },
    { id: 'tl21', parent_id: 'p4', event_type: 'message_received', description: 'הורה ענה — הכרטיס הוחלף', performed_by: 'הורה', created_at: d(0) },
  ],
  p5: [
    { id: 'tl22', parent_id: 'p5', registration_id: 'reg5', event_type: 'status_change', old_value: 'ממתין לאישור', new_value: 'מאושר', description: 'שינוי סטטוס: ממתין לאישור → מאושר', performed_by: 'נציג', created_at: d(8) },
    { id: 'tl23', parent_id: 'p5', registration_id: 'reg5', event_type: 'system_note', description: 'רישום לצהרון — כיתה ב1', performed_by: 'בוט', created_at: d(10) },
    { id: 'tl24', parent_id: 'p5', event_type: 'payment', old_value: 'ממתין', new_value: 'נכשל', description: 'כשל בהוראת קבע — חשבון ללא כיסוי', performed_by: 'מערכת', metadata: { amount: 800, failure_reason: 'אין כיסוי מספיק' }, created_at: d(1) },
    { id: 'tl25', parent_id: 'p5', event_type: 'message_sent', new_value: 'כשל_תשלום_יזום', description: 'הבוט שלח הודעה יזומה על כשל תשלום', performed_by: 'בוט', created_at: d(1) },
    { id: 'tl26', parent_id: 'p5', event_type: 'task_created', description: 'נוצרה משימה דחופה: הוראת קבע נכשלה', performed_by: 'בוט', metadata: { priority: 'דחוף' }, created_at: d(1) },
  ],
}

// ─── Demo FAQ ──────────────────────────────────────────────────────────────
export const DEMO_FAQS: FAQ[] = [
  {
    id: 'faq1',
    key: 'sibling_discount',
    question: 'יש הנחה לאחים / אחיות?',
    answer: 'כן! ממשפחה עם 2 ילדים ומעלה בצהרון — הילד השני ואילך מקבל *הנחה של 10%* על העלות החודשית. ההנחה מחושבת אוטומטית ברישום.',
    category: 'תשלומים',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'faq2',
    key: 'camp_prepay',
    question: 'איך משלמים לקייטנה? אפשר לשלם בחלקים?',
    answer: 'קייטנת הקיץ משולמת *מראש במלואה* בעת הרישום. לא ניתן לשלם בתשלומים. העלות מ-*1,200₪* לתוכנית הבסיסית.',
    category: 'קייטנה',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'faq3',
    key: 'monthly_fee_general',
    question: 'כמה עולה הצהרון בחודש?',
    answer: 'העלות החודשית נקבעת לפי אזור המגורים ומסגרת הלימודים:\n• כיתות א-ד: *946₪*\n• כיתות ה-ו: *991₪*\n• גן חובה: *1,470₪*\n\nהעלות כוללת ליווי מקצועי, ארוחת צהריים וחטיפים.',
    category: 'תשלומים',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'faq4',
    key: 'cancellation_policy',
    question: 'איך מבטלים את הרישום לצהרון?',
    answer: 'מדיניות ביטול:\n• *ביטול עד ה-15 לחודש* — המשך עד סוף החודש + זיכוי מלא\n• *ביטול אחרי ה-15* — ממשיכים חודש נוסף ומפסיקים מהחודש שלאחריו\n• *מקרים חריגים* (מחלה, מעבר דירה) — מטופלים אישית 💛',
    category: 'ביטול',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'faq5',
    key: 'schedule_hours',
    question: 'מהן שעות הצהרון? מתי ניתן להגיע לאיסוף?',
    answer: 'הצהרון פועל *ראשון-חמישי* בשעות *13:00–18:00*.\n\nאיסוף מוקדם לפני 16:00 מחייב הודעה מראש של לפחות שעתיים.\nאיסוף בין 16:00 ל-18:00 ללא תיאום מראש.',
    category: 'לוז',
    is_active: true,
    created_at: new Date().toISOString(),
  },
]

export function isDemoMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  return !url || url === 'YOUR_SUPABASE_URL' || url.includes('YOUR_')
}
