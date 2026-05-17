export interface Branch {
  id: string
  name: string
  city?: string
  phone?: string
  is_active: boolean
  created_at: string
}

export interface Parent {
  id: string
  phone: string
  name?: string
  email?: string
  notes?: string
  branch_id?: string
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
  allergies?: string
  medical_notes?: string
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
  waiting_list_position?: number
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

export interface Payment {
  id: string
  parent_id: string
  child_id?: string
  amount?: number
  currency: string
  status: PaymentStatus
  due_date?: string
  paid_at?: string
  payplus_ref?: string
  failure_reason?: string
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
  | 'רשימת_המתנה'
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
