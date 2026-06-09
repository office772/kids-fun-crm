'use client'

import { useState, useEffect } from 'react'
import { Parent } from '@/lib/types'

export interface FormData {
  // Parent
  name: string
  phone: string
  email: string
  city: string
  parent2Name: string
  parent2Phone: string
  parentIdNumber: string
  // Child
  childName: string
  childClass: string
  framework: string
  area: string
  school: string
  grade: string
  gender: string
  dietary: string
  childIdNumber: string
  // Payment
  paymentStatus: string
  paymentAmount: string
  // Notes
  notes: string
}

interface Props {
  onClose: () => void
  onSave: (data: FormData) => Promise<void>
  editParent?: Parent
}

function buildForm(parent?: Parent): FormData {
  if (!parent) return {
    name: '', phone: '', email: '', city: '', parent2Name: '', parent2Phone: '', parentIdNumber: '',
    childName: '', childClass: '', framework: '', area: '', school: '', grade: '', gender: '', dietary: '', childIdNumber: '',
    paymentStatus: '', paymentAmount: '', notes: '',
  }
  const child = parent.children?.[0]
  const payment = parent.payments?.[0]
  return {
    name: parent.name || '',
    phone: parent.phone || '',
    email: parent.email || '',
    city: (parent as unknown as Record<string, string>).city || '',
    parent2Name: (parent as unknown as Record<string, string>).parent2_name || '',
    parent2Phone: (parent as unknown as Record<string, string>).parent2_phone || '',
    parentIdNumber: (parent as unknown as Record<string, string>).id_number || '',
    childName: child?.name || '',
    childClass: child?.class_name || '',
    framework: child?.framework || '',
    area: child?.area_code || '',
    school: child?.school || '',
    grade: child?.grade || '',
    gender: (child as unknown as Record<string, string> | undefined)?.gender || '',
    dietary: (child as unknown as Record<string, string> | undefined)?.dietary || '',
    childIdNumber: (child as unknown as Record<string, string> | undefined)?.id_number || '',
    paymentStatus: payment?.status || '',
    paymentAmount: payment?.amount?.toString() || '',
    notes: parent.notes || '',
  }
}

export function AddParentModal({ onClose, onSave, editParent }: Props) {
  const isEdit = !!editParent
  const [form, setForm] = useState<FormData>(buildForm(editParent))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  useEffect(() => { setForm(buildForm(editParent)) }, [editParent])

  const set = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
  }

  const validate = () => {
    const errs: typeof errors = {}
    if (!form.name.trim()) errs.name = 'שם חובה'
    if (!form.phone.trim()) errs.phone = 'טלפון חובה'
    else if (!/^[0-9+\s-]{9,15}$/.test(form.phone)) errs.phone = 'טלפון לא תקין'
    if (!isEdit && !form.childName.trim()) errs.childName = 'שם ילד/ה חובה'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try { await onSave(form); onClose() }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* כותרת */}
        <div className="p-5 text-white rounded-t-2xl" style={{ background: 'var(--crm-primary)' }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">{isEdit ? '✏️ עריכת פרטי הורה' : '➕ הוספת הורה חדש'}</h2>
              <p className="text-white/70 text-sm mt-0.5">{isEdit ? `עורכים את ${editParent?.name}` : 'מילוי ידני של פרטי לקוח'}</p>
            </div>
            <button onClick={onClose} className="bg-white/20 hover:bg-white/30 rounded-full w-9 h-9 flex items-center justify-center text-lg transition-colors">✕</button>
          </div>
        </div>

        <div className="p-5 space-y-5">

          {/* שלב 1 — פרטי הורה */}
          <section>
            <SectionTitle num="1" title="פרטי הורה" />
            <div className="space-y-3">
              <Field label="שם מלא" required error={errors.name}>
                <input type="text" placeholder="לדוגמה: רונית כהן" value={form.name} onChange={e => set('name', e.target.value)} className={cls(!!errors.name)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="טלפון (WhatsApp)" required error={errors.phone}>
                  <input type="tel" placeholder="05X-XXXXXXX" value={form.phone} onChange={e => set('phone', e.target.value)} className={cls(!!errors.phone)} dir="ltr" />
                </Field>
                <Field label="עיר מגורים">
                  <input type="text" placeholder="תל אביב" value={form.city} onChange={e => set('city', e.target.value)} className={cls(false)} />
                </Field>
              </div>
              <Field label="אימייל">
                <input type="email" placeholder="example@gmail.com" value={form.email} onChange={e => set('email', e.target.value)} className={cls(false)} dir="ltr" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="שם הורה 2">
                  <input type="text" placeholder="בן זוג" value={form.parent2Name} onChange={e => set('parent2Name', e.target.value)} className={cls(false)} />
                </Field>
                <Field label="טלפון הורה 2">
                  <input type="tel" placeholder="05X-XXXXXXX" value={form.parent2Phone} onChange={e => set('parent2Phone', e.target.value)} className={cls(false)} dir="ltr" />
                </Field>
              </div>
              <Field label="ת.ז. הורה">
                <input type="text" placeholder="9 ספרות" value={form.parentIdNumber} onChange={e => set('parentIdNumber', e.target.value)} className={cls(false)} dir="ltr" />
              </Field>
            </div>
          </section>

          <Divider />

          {/* שלב 2 — פרטי ילד */}
          <section>
            <SectionTitle num="2" title="פרטי ילד/ה" />
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="שם הילד/ה" required={!isEdit} error={errors.childName}>
                  <input type="text" placeholder="לדוגמה: נועה כהן" value={form.childName} onChange={e => set('childName', e.target.value)} className={cls(!!errors.childName)} />
                </Field>
                <Field label="ת.ז. ילד/ה">
                  <input type="text" placeholder="9 ספרות" value={form.childIdNumber} onChange={e => set('childIdNumber', e.target.value)} className={cls(false)} dir="ltr" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="מין">
                  <select value={form.gender} onChange={e => set('gender', e.target.value)} className={cls(false)}>
                    <option value="">לא צוין</option>
                    <option value="זכר">זכר</option>
                    <option value="נקבה">נקבה</option>
                    <option value="אחר">אחר</option>
                  </select>
                </Field>
                <Field label="תזונה">
                  <select value={form.dietary} onChange={e => set('dietary', e.target.value)} className={cls(false)}>
                    <option value="">רגיל</option>
                    <option value="צמחוני">צמחוני 🥗</option>
                    <option value="טבעוני">טבעוני 🌱</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="מסגרת">
                  <select value={form.framework} onChange={e => set('framework', e.target.value)} className={cls(false)}>
                    <option value="">בחרי...</option>
                    <option value="צהרון">צהרון</option>
                    <option value="קייטנה">קייטנה</option>
                    <option value="שניהם">צהרון + קייטנה</option>
                  </select>
                </Field>
                <Field label="אזור">
                  <select value={form.area} onChange={e => set('area', e.target.value)} className={cls(false)}>
                    <option value="">בחרי...</option>
                    <option value="sharon">דרום השרון</option>
                    <option value="carmel">חוף הכרמל</option>
                    <option value="telaviv">תל אביב</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="בית ספר">
                  <input type="text" placeholder='לדוגמה: "אורט"' value={form.school} onChange={e => set('school', e.target.value)} className={cls(false)} />
                </Field>
                <Field label="כיתה">
                  <input type="text" placeholder="א1 / גן" value={form.grade || form.childClass} onChange={e => { set('grade', e.target.value); set('childClass', e.target.value) }} className={cls(false)} />
                </Field>
              </div>
            </div>
          </section>

          <Divider />

          {/* שלב 3 — תשלום */}
          <section>
            <SectionTitle num="3" title="תשלום (אופציונלי)" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="סטטוס תשלום">
                <select value={form.paymentStatus} onChange={e => set('paymentStatus', e.target.value)} className={cls(false)}>
                  <option value="">לא ידוע</option>
                  <option value="שולם">שולם ✅</option>
                  <option value="ממתין">ממתין ⏳</option>
                  <option value="נכשל">נכשל ❌</option>
                </select>
              </Field>
              <Field label="סכום (₪)">
                <input type="number" placeholder="800" value={form.paymentAmount} onChange={e => set('paymentAmount', e.target.value)} className={cls(false)} min="0" />
              </Field>
            </div>
          </section>

          <Divider />

          {/* הערות */}
          <Field label="הערות נוספות">
            <textarea
              placeholder="אלרגיות, מגבלות, הסכמות מיוחדות..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className={`${cls(false)} resize-none`}
              rows={3}
            />
          </Field>

          {/* כפתורים */}
          <div className="flex gap-3 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 disabled:opacity-60 font-bold py-3 rounded-full text-base transition-colors hover:opacity-90"
              style={{ background: 'var(--crm-action)', color: 'var(--crm-text)' }}>
              {saving ? 'שומר...' : isEdit ? '✅ שמור שינויים' : '✅ שמור הורה'}
            </button>
            <button onClick={onClose} className="px-5 bg-gray-100 hover:bg-gray-200 font-medium py-3 rounded-full transition-colors" style={{ color: 'var(--crm-text)' }}>
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ num, title }: { num: string; title: string }) {
  return (
    <h3 className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--crm-text)' }}>
      <span className="rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold text-white"
        style={{ background: 'var(--crm-primary)' }}>{num}</span>
      {title}
    </h3>
  )
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-stone-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}

function Divider() { return <hr className="border-stone-100" /> }

function cls(hasError: boolean) {
  return `w-full border-2 rounded-xl px-3 py-2.5 text-base focus:outline-none transition-colors text-right ${hasError ? 'border-red-300 focus:border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50'} focus:[border-color:var(--crm-primary)]`
}
