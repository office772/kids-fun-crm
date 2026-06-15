export interface Branch {
  id: string
  name: string
  city?: string
  phone?: string
  is_active: boolean
  created_at: string
}

export type SyncSource =
  | 'payplus'
  | 'payplus_recurring'
  | 'payplus_webhook'
  | 'greeninvoice'
  | 'greeninvoice_webhook'
  | 'manual'
  | 'excel_import'
  | 'woocommerce'

export interface Parent {
  id: string
  phone: string
  name?: string
  email?: string
  notes?: string
  branch_id?: string
  sync_source?: SyncSource
  external_ref?: string
  is_archived?: boolean
  archive_reason?: string        // 'קייטנה' | 'אחר'
  archived_at?: string
  payplus_recurring_uid?: string                                   // מזהה הוראת הקבע ב-PayPlus
  payplus_recurring_status?: 'active' | 'cancelled' | 'cancelled_test' | 'expired' | 'failed'
  payplus_recurring_cancelled_at?: string
  created_at: string
  updated_at: string
  // joined
  children?: Child[]
  payments?: Payment[]
  tasks?: Task[]
  conversations?: Conversation[]
}

export interface Child {
  id: string
  parent_id: string
  name: string
  birth_date?: string
  class_name?: string
  framework?: 'צהרון' | 'קייטנה' | 'שניהם'
  school?: string                 // בית ספר
  grade?: string                  // כיתה / שכבה
  program?: string                // קייטנה / צהרון / אחר
  allergies?: string
  medical_notes?: string
  area_code?: string
  branch_id?: string
  created_at: string
}

export type RegistrationStatus = 'ממתין לאישור' | 'מאושר' | 'נדחה' | 'רשימת המתנה' | 'בוטל'
export type RegistrationType = 'צהרון' | 'קייטנה'

export interface Registration {
  id: string
  parent_id: string
  child_id?: string
  type: RegistrationType
  status: RegistrationStatus
  area_code?: string
  area_label?: string
  waiting_list_position?: number
  payment_method?: string
  payment_setup_at?: string
  approved_at?: string
  notes?: string
  branch_id?: string
  created_at: string
  updated_at: string
  // joined
  parent?: Parent
  child?: Child
}

export type PaymentStatus = 'שולם' | 'ממתין' | 'נכשל' | 'חלקי' | 'זיכוי'
export type PaymentType = 'הוראת קבע' | 'כרטיס אשראי' | 'צ׳ק' | 'מזומן' | 'אחר'

// סטטוס בריאות התשלום לתצוגה: 🟢 תקין / 🟡 כרטיס פג תוקף / 🔴 כשל
export type PaymentHealth = 'ok' | 'expiring' | 'failed'

export interface Payment {
  id: string
  parent_id: string
  child_id?: string
  amount?: number
  currency: string
  status: PaymentStatus
  payment_type?: PaymentType
  number_of_failures?: number      // מספר כשלונות חיוב מצטבר (PayPlus)
  card_expired?: boolean           // כרטיס אשראי פג תוקף
  due_date?: string
  paid_at?: string
  payplus_ref?: string
  greeninvoice_ref?: string
  source?: SyncSource
  failure_reason?: string
  payment_number?: number            // מספר תשלום נוכחי (לדוגמה: 3)
  total_payments?: number            // סה"כ תשלומים בסדרה (לדוגמה: 10)
  proactive_sent: boolean
  last_checked: string
  created_at: string
  // joined
  parent?: Parent
  child?: Child
}

export type ConversationDirection = 'נכנס' | 'יוצא'
export type ConversationPlatform = 'whatsapp' | 'simulator'
export type HandledBy = 'בוט' | 'נציג'

export interface Conversation {
  id: string
  parent_id?: string
  phone: string
  platform: ConversationPlatform
  direction: ConversationDirection
  message_text: string
  intent?: string
  handled_by: HandledBy
  session_id?: string
  branch_id?: string
  created_at: string
  // joined
  parent?: Parent
}

export type TaskType = 'ביטול חריג' | 'כשל תשלום' | 'רישום מאוחר' | 'שאלה כללית' | 'רשימת המתנה' | 'תלונה' | 'אחר'
export type TaskStatus = 'פתוח' | 'בטיפול' | 'טופל'
export type TaskPriority = 'דחוף' | 'גבוה' | 'רגיל'

export interface Task {
  id: string
  parent_id?: string
  type: TaskType
  description: string
  status: TaskStatus
  priority: TaskPriority
  assigned_to?: string
  branch_id?: string
  created_at: string
  updated_at: string
  // joined
  parent?: Parent
}

// ─── Registration Timeline ───────────────────────────────────────────────────
export type TimelineEventType =
  | 'status_change'
  | 'message_sent'
  | 'message_received'
  | 'payment'
  | 'task_created'
  | 'task_resolved'
  | 'system_note'
  | 'escalation'

export interface RegistrationTimeline {
  id: string
  registration_id?: string
  parent_id: string
  event_type: TimelineEventType
  old_value?: string
  new_value?: string
  description: string
  performed_by: 'בוט' | 'נציג' | 'מערכת' | 'הורה'
  metadata?: Record<string, unknown>
  branch_id?: string
  created_at: string
}

export interface CalendarEvent {
  id: string
  title: string
  event_date: string
  event_type?: 'חג' | 'חופשה' | 'יום עיון' | 'אחר'
  is_closed: boolean
  notes?: string
  branch_id?: string
  created_at: string
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────
export type FAQCategory = 'תשלומים' | 'לוז' | 'קייטנה' | 'ביטול' | 'כללי'

export interface FAQ {
  id: string
  key: string           // מפתח טכני — נוצר אוטומטית מהשאלה
  question: string      // שאלה לתצוגה
  answer: string        // תשובה — תומכת ב-{שם}, {ילד} placeholders
  category: FAQCategory
  keywords?: string     // מילות מפתח נוספות לחיפוש (ניסוחים שונים שאותו דבר)
  is_active: boolean
  created_at: string
  updated_at?: string
}

// ─── BotContent ────────────────────────────────────────────────────────────
export type BotContentCategory = 'general' | 'registration' | 'cancellation' | 'payment' | 'schedule' | 'camp'
export type BotContentFlow = 'general' | 'צהרון' | 'קייטנה' | 'ביטול' | 'תשלום' | 'לוז' | 'איסוף_מוקדם'

export interface BotContent {
  id: string
  key: string
  title: string
  content: string       // supports {שם} {ילד} {קישור} placeholders
  category: BotContentCategory
  flow: BotContentFlow
  step_label: string
  is_active: boolean
  created_at: string
}

// ─── SystemSettings ────────────────────────────────────────────────────────
export type SettingValueType = 'text' | 'url' | 'boolean' | 'number' | 'json'
export type SettingCategory = 'details' | 'whatsapp' | 'flow' | 'payments'

export interface SystemSetting {
  id: string
  category: SettingCategory
  key: string
  label: string
  value: string
  value_type: SettingValueType
  description?: string
}

// Bot types
export type BotIntent =
  | 'רישום_צהרון'
  | 'רישום_קייטנה'
  | 'ביטול'
  | 'שאלת_לוז'
  | 'איסוף_מוקדם'
  | 'בדיקת_תשלום'
  | 'כשל_תשלום'
  | 'כשל_תשלום_יזום'
  | 'אפשרויות_תשלום'   // הורה שואל על שיטות תשלום / רוצה לשנות שיטה
  | 'רשימת_המתנה'
  | 'הצעת_מקום_יזומה'  // מהמערכת — כשנפתח מקום ברשימת המתנה
  | 'בקשת_נציג'
  | 'שאלה_כללית'
  | 'לא_ידוע'

export interface BotMessage {
  role: 'user' | 'bot'
  text: string
  timestamp: Date
  intent?: BotIntent
}

export interface BotSession {
  sessionId: string
  phone: string
  parentId?: string
  parentName?: string
  messages: BotMessage[]
  currentFlow?: string
  collectedData: Record<string, string>
}
