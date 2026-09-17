'use client'

import { useState } from 'react'
import { SystemSetting, SettingCategory } from '@/lib/types'
import { AlertTriangle } from 'lucide-react'

// ⚠️ באנר "תצוגה מקדימה" — הלשונית הזו עדיין לא מחוברת ל-DB (אין /api/settings).
// עד שתחובר, אסור שתיראה כמו מסך עריכה אמיתי — אחרת הצוות יערוך, יראה "נשמר",
// והבוט ימשיך להתעלם. הגדרות שכן עובדות: שאלות ותשובות, קיבולת, צוות מסגרות, מספרי בדיקה.
function PreviewNotice() {
  return (
    <div
      className="rounded-xl border p-4 mb-5 flex items-start gap-3"
      style={{ background: '#FEF3E2', borderColor: '#F5C97A' }}
    >
      <AlertTriangle size={20} color="#B45309" className="flex-shrink-0 mt-0.5" />
      <div className="text-sm leading-relaxed" style={{ color: '#7C4A03' }}>
        <p className="font-bold mb-0.5">תצוגה מקדימה — עדיין לא ניתן לערוך כאן</p>
        <p>
          המסך הזה מציג את ההגדרות המתוכננות, אבל <b>שינוי כאן לא נשמר ולא משפיע על הבוט</b> (הפיצ'ר בבנייה).
          לשינוי שעות, מחירים או טקסטים בשלב זה — פני לעינת.
          הלשוניות שכבר עובדות: <b>שאלות ותשובות · קיבולת · צוות מסגרות · מספרי בדיקה</b>.
        </p>
      </div>
    </div>
  )
}

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
    id: '5', category: 'whatsapp', key: 'manychat_webhook_secret', label: 'uChat Webhook Secret',
    value: 'your-secret-here', value_type: 'text',
    description: 'מפתח לאימות הודעות נכנסות מ-uChat',
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
  // תצוגה מקדימה בלבד — הנתונים דמו, אין כתיבה ל-DB עד שיחובר /api/settings.
  const [activeCategory, setActiveCategory] = useState<SettingCategory>('details')

  const categories: SettingCategory[] = ['details', 'whatsapp', 'flow', 'payments']
  const visibleSettings = DEMO_SETTINGS.filter(s => s.category === activeCategory)

  return (
    <div>
      {/* ⚠️ תצוגה מקדימה — לא מחובר ל-DB עדיין. אסור להטעות את המשתמשת שכאילו נשמר. */}
      <PreviewNotice />

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
          <SettingRow key={setting.id} setting={setting} />
        ))}
      </div>
    </div>
  )
}

// ─── SettingRow ───────────────────────────────────────────────────────────────
function SettingRow({ setting }: { setting: SystemSetting }) {
  const isBoolean = setting.value_type === 'boolean'
  const isActive = setting.value === 'true'

  return (
    <div
      className="rounded-xl border p-4 flex items-start justify-between gap-4"
      style={{ background: '#fff', borderColor: '#f3f4f6' }}
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
          <div className="flex items-center gap-2" title="תצוגה מקדימה — לא ניתן לשנות עדיין">
            <span
              className="relative w-12 h-6 rounded-full opacity-50 cursor-not-allowed"
              style={{ background: isActive ? 'var(--crm-primary)' : '#d1d5db' }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm"
                style={{ transform: isActive ? 'translateX(1.5rem)' : 'translateX(0.125rem)' }}
              />
            </span>
            <span
              className="text-sm font-medium w-10"
              style={{ color: isActive ? 'var(--crm-primary)' : '#9ca3af' }}
            >
              {isActive ? 'פעיל' : 'כבוי'}
            </span>
          </div>
        ) : (
          /* Text / URL / Number — תצוגה בלבד (readOnly), בלי כפתור שמירה מטעה */
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={setting.value}
              readOnly
              dir={setting.value_type === 'url' || setting.key.includes('key') ? 'ltr' : 'rtl'}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none w-56 cursor-not-allowed"
              style={{ borderColor: '#e5e7eb', background: '#f9fafb', color: '#6b7280' }}
              title="תצוגה מקדימה — לא ניתן לשנות עדיין"
            />
          </div>
        )}
      </div>
    </div>
  )
}
