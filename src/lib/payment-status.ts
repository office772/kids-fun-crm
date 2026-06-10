import { Payment, PaymentHealth, SyncSource } from './types'

// ─── סטטוס בריאות תשלום ────────────────────────────────────────────────────────
// לא רק "שולם" — אלא תמונת מצב ניהולית: כשל / כרטיס פג תוקף / תקין
// ──────────────────────────────────────────────────────────────────────────────

export interface PaymentHealthInfo {
  health: PaymentHealth
  icon: string          // 🔴 / 🟡 / 🟢
  label: string         // טקסט לתצוגה
  color: string         // צבע טקסט
  bg: string            // צבע רקע
}

const HEALTH_STYLES: Record<PaymentHealth, Omit<PaymentHealthInfo, 'health'>> = {
  failed:   { icon: '🔴', label: 'כשל תשלום',     color: '#EF4444', bg: '#FCEAEA' },
  expiring: { icon: '🟡', label: 'כרטיס פג תוקף', color: '#7B6010', bg: '#FEF9C3' },
  ok:       { icon: '🟢', label: 'תקין',           color: '#297058', bg: '#E6F4EF' },
}

// קובע את בריאות התשלום מתוך הנתונים שמגיעים מ-PayPlus / GreenInvoice
export function getPaymentHealth(pay: Pick<Payment, 'status' | 'number_of_failures' | 'card_expired'>): PaymentHealth {
  if (pay.status === 'נכשל' || (pay.number_of_failures ?? 0) > 0) return 'failed'
  if (pay.card_expired) return 'expiring'
  return 'ok'
}

export function getPaymentHealthInfo(pay: Pick<Payment, 'status' | 'number_of_failures' | 'card_expired'>): PaymentHealthInfo {
  const health = getPaymentHealth(pay)
  return { health, ...HEALTH_STYLES[health] }
}

// בריאות מצרפית של הורה — הגרוע מבין כל התשלומים שלו
export function getParentPaymentHealth(payments?: Payment[]): PaymentHealth {
  if (!payments || payments.length === 0) return 'ok'
  if (payments.some(p => getPaymentHealth(p) === 'failed')) return 'failed'
  if (payments.some(p => getPaymentHealth(p) === 'expiring')) return 'expiring'
  return 'ok'
}

export function getParentPaymentHealthInfo(payments?: Payment[]): PaymentHealthInfo {
  const health = getParentPaymentHealth(payments)
  return { health, ...HEALTH_STYLES[health] }
}

// ─── תווית מקור סנכרון ──────────────────────────────────────────────────────────
const SOURCE_LABELS: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  payplus:              { label: 'PayPlus',       icon: '💳', color: '#297058', bg: '#E6F4EF' },
  payplus_recurring:    { label: 'PayPlus',       icon: '💳', color: '#297058', bg: '#E6F4EF' },
  payplus_webhook:      { label: 'PayPlus',       icon: '💳', color: '#297058', bg: '#E6F4EF' },
  greeninvoice:         { label: 'חשבונית ירוקה', icon: '🧾', color: '#5c3d2e', bg: '#f5e6d8' },
  greeninvoice_webhook: { label: 'חשבונית ירוקה', icon: '🧾', color: '#5c3d2e', bg: '#f5e6d8' },
  manual:               { label: 'ידני',          icon: '✍️', color: '#6D436D', bg: '#F0EBF3' },
  excel_import:         { label: 'ייבוא אקסל',    icon: '📊', color: '#1d4ed8', bg: '#e0eaff' },
  woocommerce:          { label: 'אתר (קייטנות)', icon: '🏕️', color: '#9a3412', bg: '#ffedd5' },
}

const SOURCE_FALLBACK = { label: 'ידני', icon: '✍️', color: '#6D436D', bg: '#F0EBF3' }

export function getSourceLabel(source?: SyncSource | string | null) {
  if (!source) return SOURCE_FALLBACK
  return SOURCE_LABELS[source] ?? SOURCE_FALLBACK
}
