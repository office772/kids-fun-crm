'use client'

// ─── מסך "קול הבוט" ───────────────────────────────────────────────────────────
// עורך את הפרסונה והטון של תשובות ה-LLM החופשיות (מפתחות bot_* בטבלת settings).
// שמירה אמיתית דרך /api/admin/settings. כל עוד ריק — הבוט מתנהג כמו היום.
import { useEffect, useState } from 'react'
import { Info, Check, Loader2 } from 'lucide-react'

const VOICE_KEYS = [
  'bot_persona_name', 'bot_gender', 'bot_formality', 'bot_emoji_level',
  'bot_greeting', 'bot_signoff', 'bot_phrases_use', 'bot_phrases_avoid',
  'bot_forbidden_words', 'bot_sample_answers',
] as const
type VoiceKey = (typeof VOICE_KEYS)[number]
type VoiceState = Record<VoiceKey, string>

const EMPTY: VoiceState = {
  bot_persona_name: '', bot_gender: '', bot_formality: '', bot_emoji_level: '',
  bot_greeting: '', bot_signoff: '', bot_phrases_use: '', bot_phrases_avoid: '',
  bot_forbidden_words: '', bot_sample_answers: '',
}

export function BotVoiceSettings() {
  const [values, setValues]   = useState<VoiceState>(EMPTY)
  const [initial, setInitial] = useState<VoiceState>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res  = await fetch('/api/admin/settings')
        const json = await res.json()
        if (cancelled) return
        const s = (json?.settings || {}) as Record<string, string>
        const next = { ...EMPTY }
        for (const k of VOICE_KEYS) next[k] = s[k] || ''
        setValues(next)
        setInitial(next)
      } catch {
        if (!cancelled) setError('לא הצלחנו לטעון את ההגדרות. רעננו את הדף ונסו שוב.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const dirty = VOICE_KEYS.some(k => values[k] !== initial[k])

  const set = (k: VoiceKey, v: string) => {
    setValues(prev => ({ ...prev, [k]: v }))
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: values }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'שמירה נכשלה')
      setInitial(values)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 justify-center" style={{ color: 'var(--crm-text)', opacity: 0.6 }}>
        <Loader2 size={18} className="animate-spin" /> טוען…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* הסבר */}
      <div
        className="rounded-xl border p-4 flex items-start gap-3"
        style={{ background: '#EEF6FF', borderColor: '#BBD8F5' }}
      >
        <Info size={20} color="#1E5A9E" className="flex-shrink-0 mt-0.5" />
        <div className="text-sm leading-relaxed" style={{ color: '#1E3A5F' }}>
          <p className="font-bold mb-0.5">מה זה קול הבוט?</p>
          <p>
            כאן מגדירים את <b>הטון והאישיות</b> של הבוט בתשובות החופשיות (שאלות פתוחות של הורים).
            זה משנה <b>רק את הניסוח</b> — לא את המסלולים, המחירים או כללי הבטיחות.
            כל עוד השדות ריקים, הבוט עונה כמו היום. מלאו בהדרגה ובדקו בסימולטור.
          </p>
        </div>
      </div>

      <Field
        label="שם הבוט / הפרסונה"
        help='איך הבוט יקרא לעצמו כשצריך, למשל "ג׳וני". השאירו ריק כדי לא להשתמש בשם.'
      >
        <input
          type="text" value={values.bot_persona_name}
          onChange={e => set('bot_persona_name', e.target.value)}
          placeholder="ללא שם"
          className="crm-input" dir="rtl"
        />
      </Field>

      <Field label="מגדר הבוט" help="באיזו לשון הבוט ידבר על עצמו. ריק = כמו היום (נקבה).">
        <select
          value={values.bot_gender}
          onChange={e => set('bot_gender', e.target.value)}
          className="crm-input" dir="rtl"
        >
          <option value="">לא הוגדר (כמו היום)</option>
          <option value="female">נקבה</option>
          <option value="male">זכר</option>
          <option value="neutral">ניטרלי</option>
        </select>
      </Field>

      <Field label="רמת רשמיות / טון" help='תיאור חופשי, למשל: "חמה, קרובה ולא רשמית" או "מקצועית ומכבדת".'>
        <input
          type="text" value={values.bot_formality}
          onChange={e => set('bot_formality', e.target.value)}
          placeholder="ריק = חם ושירותי (ברירת מחדל)"
          className="crm-input" dir="rtl"
        />
      </Field>

      <Field label="שימוש באמוג׳ים" help="כמה אמוג׳ים הבוט ישלב בתשובות.">
        <select
          value={values.bot_emoji_level}
          onChange={e => set('bot_emoji_level', e.target.value)}
          className="crm-input" dir="rtl"
        >
          <option value="">לא הוגדר (מעט, כמו היום)</option>
          <option value="none">בלי אמוג׳ים</option>
          <option value="low">מעט (עד אחד)</option>
          <option value="high">הרבה (2-3)</option>
        </select>
      </Field>

      <Field label="משפט פתיחה מועדף" help="איך הבוט יפתח תשובה כשמתאים. ריק = ללא פתיחה קבועה.">
        <input
          type="text" value={values.bot_greeting}
          onChange={e => set('bot_greeting', e.target.value)}
          placeholder='למשל: "היי, כאן ג׳וני מ-Kids & Fun 😊"'
          className="crm-input" dir="rtl"
        />
      </Field>

      <Field label="משפט סיום מועדף" help="איך הבוט יסיים תשובה מהותית. ריק = ללא סיום קבוע.">
        <input
          type="text" value={values.bot_signoff}
          onChange={e => set('bot_signoff', e.target.value)}
          placeholder='למשל: "אני כאן לכל שאלה 💛"'
          className="crm-input" dir="rtl"
        />
      </Field>

      <Field label="ביטויים שכדאי להשתמש בהם" help="שורה לכל ביטוי. הבוט ישאף לשלב אותם כשמתאים.">
        <textarea
          value={values.bot_phrases_use}
          onChange={e => set('bot_phrases_use', e.target.value)}
          placeholder="בשמחה&#10;אין בעיה&#10;נשמח לעזור"
          rows={3} className="crm-input" dir="rtl"
        />
      </Field>

      <Field label="ביטויים להימנע מהם" help="שורה לכל ביטוי. הבוט ינסה לא להשתמש בהם.">
        <textarea
          value={values.bot_phrases_avoid}
          onChange={e => set('bot_phrases_avoid', e.target.value)}
          placeholder="אין באפשרותי&#10;מצטערים על אי הנוחות"
          rows={3} className="crm-input" dir="rtl"
        />
      </Field>

      <Field label="מילים אסורות לחלוטין" help='מילים שהבוט לעולם לא יגיד. מומלץ להוסיף את המילה "בוט". שורה לכל מילה.'>
        <textarea
          value={values.bot_forbidden_words}
          onChange={e => set('bot_forbidden_words', e.target.value)}
          placeholder="בוט"
          rows={2} className="crm-input" dir="rtl"
        />
      </Field>

      <Field label="דוגמאות לתשובות בקול הרצוי" help="2-3 דוגמאות של תשובה טובה בסגנון שאתם רוצים. הבוט יחקה את הסגנון, לא את התוכן.">
        <textarea
          value={values.bot_sample_answers}
          onChange={e => set('bot_sample_answers', e.target.value)}
          placeholder='הורה: "מתי הצהרון מתחיל?"&#10;בוט: "היי! הצהרון מתחיל ב-1 בספטמבר 😊 רוצה שאשלח לך את כל הפרטים?"'
          rows={5} className="crm-input" dir="rtl"
        />
      </Field>

      {error && (
        <p className="text-sm font-medium" style={{ color: '#B91C1C' }}>{error}</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--crm-primary)', color: '#fff' }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          {saving ? 'שומר…' : 'שמירה'}
        </button>
        {saved && !dirty && (
          <span className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#15803D' }}>
            <Check size={16} /> נשמר בהצלחה
          </span>
        )}
        {dirty && !saving && (
          <span className="text-sm" style={{ color: 'var(--crm-text)', opacity: 0.55 }}>
            יש שינויים שלא נשמרו
          </span>
        )}
      </div>

      <style jsx>{`
        :global(.crm-input) {
          width: 100%;
          border: 1px solid var(--crm-border, #e5e7eb);
          border-radius: 0.75rem;
          padding: 0.6rem 0.9rem;
          font-size: 0.95rem;
          background: #fff;
          color: var(--crm-text, #1f2937);
          line-height: 1.6;
        }
        :global(.crm-input:focus) {
          outline: none;
          border-color: var(--crm-primary, #d97706);
        }
      `}</style>
    </div>
  )
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-bold text-sm mb-1" style={{ color: 'var(--crm-text)' }}>
        {label}
      </label>
      {help && (
        <p className="text-xs mb-2" style={{ color: 'var(--crm-text)', opacity: 0.55 }}>{help}</p>
      )}
      {children}
    </div>
  )
}
