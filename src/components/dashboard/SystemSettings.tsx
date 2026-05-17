'use client'

import { useState, useEffect } from 'react'
import { SystemSetting, SettingCategory } from '@/lib/types'
import { Save, CheckCircle } from 'lucide-react'

// ─── Demo data ────────────────────────────────────────────────────────────────
const DEMO_SETTINGS: SystemSetting[] = [
  // details
  {
    id: '1', category: 'details', key: 'branch_name', label: 'שם הסניף',
    value: 'Kids & Fun – תל אביב', value_type: 'text',
    description: 'שם שיוצג בפניות ובהודעות הבוט',
  },
  {
    id: '2', category: 'details', key: 'branch_phone', label: 'מספר טלפון',
    value: '052-000-0000', value_type: 'text',
    description: 'מספר ליצירת קשר — יוצג להורים',
  },
  {
    id: '3', category: 'details', key: 'branch_city', label: 'עיר',
    value: 'תל אביב', value_type: 'text',
    description: 'העיר בה פועל הסניף',
  },
  {
    id: '4', category: 'details', key: 'support_hours', label: 'שעות פעילות',
    value: 'ראשון–חמישי 08:00–17:00', value_type: 'text',
    description: 'שעות בהן נציג זמין — שימוש בהסלמת הבוט',
  },

  // whatsapp
  {
    id: '5', category: 'whatsapp', key: 'manychat_webhook_secret', label: 'ManyChat Webhook Secret',
    value: 'your-secret-here', value_type: 'text',
    description: 'מפתח לאימות הודעות נכנסות מ-ManyChat',
  },
  {
    id: '6', category: 'whatsapp', key: 'whatsapp_number', label: 'מספר WhatsApp עסקי',
    value: '+972520000000', value_type: 'text',
    description: 'מספר ה-WhatsApp Business של הסניף',
  },
  {
    id: '7', category: 'whatsapp', key: 'bot_active', label: 'בוט פעיל',
    value: 'true', value_type: 'boolean',
    description: 'כאשר כבוי — כל הפניות עוברות ישירות לנציג',
  },
  {
    id: '8', category: 'whatsapp', key: 'out_of_hours_message', label: 'הודעה מחוץ לשעות',
    value: 'קיבלתי את פנייתך! 😊 הצוות יחזור אליך בשעות הפעילות. חנות זמנים: ראשון–חמישי 08:00–17:00.',
    value_type: 'text',
    description: 'נשלח אוטומטית כאשר הפנייה מגיעה מחוץ לשעות הפעילות',
  },

  // flow
  {
    id: '9', category: 'flow', key: 'registration_open', label: 'רישום לצהרון פתוח',
    value: 'true', value_type: 'boolean',
    description: 'כאשר סגור — הבוט מנתב להמתנה',
  },
  {
    id: '10', category: 'flow', key: 'camp_registration_open', label: 'רישום לקייטנה פתוח',
    value: 'false', value_type: 'boolean',
    description: 'כאשר סגור — הבוט אוסף פרטים ידנית לצוות',
  },
  {
    id: '11', category: 'flow', key: 'max_waiting_list', label: 'מקסימום רשימת המתנה',
    value: '20', value_type: 'number',
    description: 'מספר המקסימלי בתור ההמתנה — מעל זה הבוט מתנצל',
  },
  {
    id: '12', category: 'flow', key: 'registration_form_url', label: 'קישור טופס רישום',
    value: 'https://forms.example.com/register', value_type: 'url',
    description: 'הקישור שהבוט ישלח להורים לאחר אישור רישום',
  },
  {
    id: '13', category: 'flow', key: 'escalation_enabled', label: 'הסלמה לנציג מופעלת',
    value: 'true', value_type: 'boolean',
    description: 'כאשר כבוי — אין הסלמה לנציג, הבוט מטפל בהכל',
  },

  // payments
  {
    id: '14', category: 'payments', key: 'payplus_api_key', label: 'PayPlus API Key',
    value: 'YOUR_PAYPLUS_API_KEY', value_type: 'text',
    description: 'מפתח API לממשק PayPlus — שמור בסוד!',
  },
  {
    id: '15', category: 'payments', key: 'payment_check_interval_hours', label: 'תדירות בדיקת תשלומים (שעות)',
    value: '2', value_type: 'number',
    description: 'כמה שעות בין כל בדיקת סטטוס תשלומים',
  },
  {
    id: '16', category: 'payments', key: 'proactive_failure_enabled', label: 'פנייה יזומה בכשל תשלום',
    value: 'true', value_type: 'boolean',
    description: 'כאשר פעיל — הבוט שולח הודעה אוטומטית בכשל תשלום',
  },
  {
    id: '17', category: 'payments', key: 'monthly_fee', label: 'שכר לימוד חודשי (ש"ח)',
    value: '1200', value_type: 'number',
    description: 'עלות חודשית לצהרון — לשימוש בחישובי זיכוי',
  },
]

const CATEGORY_LABELS: Record<SettingCategory, string> = {
  details: '🏫 פרטי סניף',
  whatsapp: '💬 WhatsApp',
  flow: '🔄 זרימת בוט',
  payments: '💳 תשלומים',
}

// ─── Component ────────────────────────────────────────────────────────────────
export function SystemSettings() {
  const [settings, setSettings] = useState<SystemSetting[]>(DEMO_SETTINGS)
  const [activeCategory, setActiveCategory] = useState<SettingCategory>('details')
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})

  const categories: SettingCategory[] = ['details', 'whatsapp', 'flow', 'payments']
  const visibleSettings = settings.filter(s => s.category === activeCategory)

  const handleChange = (id: string, newValue: string) => {
    setSettings(prev => prev.map(s => (s.id === id ? { ...s, value: newValue } : s)))
    setDirty(prev => ({ ...prev, [id]: true }))
    setSaved(prev => ({ ...prev, [id]: false }))
  }

  const handleToggle = (id: string) => {
    const current = settings.find(s => s.id === id)
    if (!current) return
    const newVal = current.value === 'true' ? 'false' : 'true'
    setSettings(prev => prev.map(s => (s.id === id ? { ...s, value: newVal } : s)))
    // Booleans save instantly — show feedback
    setSaved(prev => ({ ...prev, [id]: true }))
    setTimeout(() => setSaved(prev => ({ ...prev, [id]: false })), 2000)
  }

  const handleSave = (id: string) => {
    // In production: PATCH /api/settings/:id
    setDirty(prev => ({ ...prev, [id]: false }))
    setSaved(prev => ({ ...prev, [id]: true }))
    setTimeout(() => setSaved(prev => ({ ...prev, [id]: false })), 2000)
  }

  return (
    <div>
      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap mb-6">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
            style={
              activeCategory === cat
                ? { background: 'var(--crm-primary)', color: '#fff' }
                : { background: '#fff', color: 'var(--crm-text)', border: '1px solid #e5e7eb', opacity: 0.7 }
            }
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Settings rows */}
      <div className="space-y-3">
        {visibleSettings.map(setting => (
          <SettingRow
            key={setting.id}
            setting={setting}
            isDirty={!!dirty[setting.id]}
            isSaved={!!saved[setting.id]}
            onChange={val => handleChange(setting.id, val)}
            onToggle={() => handleToggle(setting.id)}
            onSave={() => handleSave(setting.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── SettingRow ───────────────────────────────────────────────────────────────
function SettingRow({
  setting,
  isDirty,
  isSaved,
  onChange,
  onToggle,
  onSave,
}: {
  setting: SystemSetting
  isDirty: boolean
  isSaved: boolean
  onChange: (val: string) => void
  onToggle: () => void
  onSave: () => void
}) {
  const isBoolean = setting.value_type === 'boolean'
  const isActive = setting.value === 'true'

  return (
    <div
      className="rounded-xl border p-4 flex items-start justify-between gap-4 transition-all"
      style={{
        background: isDirty ? '#FAF5EE' : '#fff',
        borderColor: isDirty ? '#e8c4d0' : '#f3f4f6',
      }}
    >
      {/* Label + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-semibold text-sm" style={{ color: 'var(--crm-text)' }}>
            {setting.label}
          </p>
          <span
            className="text-xs font-mono px-2 py-0.5 rounded-full"
            style={{ background: '#f3f4f6', color: '#78716c' }}
          >
            {setting.key}
          </span>
        </div>
        {setting.description && (
          <p className="text-xs" style={{ color: 'var(--crm-text)', opacity: 0.55 }}>
            {setting.description}
          </p>
        )}
      </div>

      {/* Control */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isBoolean ? (
          /* Toggle */
          <div className="flex items-center gap-2">
            {isSaved && <CheckCircle size={16} color="#16a34a" />}
            <button
              onClick={onToggle}
              className="relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none"
              style={{ background: isActive ? 'var(--crm-primary)' : '#d1d5db' }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
                style={{ transform: isActive ? 'translateX(1.5rem)' : 'translateX(0.125rem)' }}
              />
            </button>
            <span
              className="text-sm font-medium w-10"
              style={{ color: isActive ? 'var(--crm-primary)' : '#9ca3af' }}
            >
              {isActive ? 'פעיל' : 'כבוי'}
            </span>
          </div>
        ) : (
          /* Text / URL / Number input + Save button */
          <div className="flex items-center gap-2">
            {isSaved && <CheckCircle size={16} color="#16a34a" />}
            <input
              type={setting.value_type === 'number' ? 'number' : 'text'}
              value={setting.value}
              onChange={e => onChange(e.target.value)}
              dir={setting.value_type === 'url' || setting.key.includes('key') ? 'ltr' : 'rtl'}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none w-56"
              style={{
                borderColor: isDirty ? 'var(--crm-primary)' : '#e5e7eb',
                background: '#fff',
              }}
            />
            {isDirty && (
              <button
                onClick={onSave}
                className="flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-lg text-white transition-all hover:opacity-90"
                style={{ background: 'var(--crm-primary)' }}
              >
                <Save size={14} />
                שמור
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
