'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

function validateIsraeliId(raw: string): boolean {
  const id = raw.replace(/\D/g, '').padStart(9, '0')
  if (id.length !== 9) return false
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let val = Number(id[i]) * ((i % 2) + 1)
    if (val > 9) val -= 9
    sum += val
  }
  return sum % 10 === 0
}

// מיפוי כיתה → טווח שנות לידה הגיוניות (שנת לימודים תשפ"ו = 2025/2026)
const SCHOOL_YEAR = 2026  // שנת הלימודים הנוכחית
const GRADE_BIRTH_RANGE: Record<string, [number, number]> = {
  'גן':    [SCHOOL_YEAR - 7,  SCHOOL_YEAR - 4],
  'גן חובה': [SCHOOL_YEAR - 7, SCHOOL_YEAR - 4],
  'א':     [SCHOOL_YEAR - 8,  SCHOOL_YEAR - 6],
  'ב':     [SCHOOL_YEAR - 9,  SCHOOL_YEAR - 7],
  'ג':     [SCHOOL_YEAR - 10, SCHOOL_YEAR - 8],
  'ד':     [SCHOOL_YEAR - 11, SCHOOL_YEAR - 9],
  'ה':     [SCHOOL_YEAR - 12, SCHOOL_YEAR - 10],
  'ו':     [SCHOOL_YEAR - 13, SCHOOL_YEAR - 11],
}

function gradeFromClass(cls: string): string | null {
  if (!cls) return null
  // תופס "א", "א1", "א'", "כיתה א" וכו'
  const m = cls.match(/^(גן חובה|גן|[אבגדהוא-ת])/)
  return m ? m[1] : null
}

function validateBirthDateVsGrade(birthDate: string, cls: string): string | null {
  if (!birthDate || !cls) return null
  const year = new Date(birthDate).getFullYear()
  const today = new Date()

  // לידה בעתיד
  if (new Date(birthDate) > today) return 'תאריך לידה לא יכול להיות בעתיד'

  // ילד מבוגר מדי (מעל 16)
  if (today.getFullYear() - year > 16) return 'תאריך לידה נראה מוקדם מדי — אנא בדקי'

  const grade = gradeFromClass(cls)
  if (!grade || !GRADE_BIRTH_RANGE[grade]) return null

  const [minYear, maxYear] = GRADE_BIRTH_RANGE[grade]
  if (year < minYear || year > maxYear) {
    return `לכיתה ${grade} מצופה שנת לידה ${minYear}–${maxYear} (הוזן: ${year}) — אנא בדקי`
  }
  return null
}

const AREAS: Record<string, string> = {
  sharon:  'דרום השרון / חוף השרון',
  carmel:  'חוף הכרמל',
  telaviv: 'גני ילדים תל אביב',
}

interface SchoolData { name: string; city?: string }

function RegisterForm() {
  const searchParams = useSearchParams()
  const router       = useRouter()

  const areaFromUrl  = searchParams.get('area')  || ''
  const childFromUrl = searchParams.get('child') || ''
  const classFromUrl = searchParams.get('class') || ''
  const phoneFromUrl = searchParams.get('phone') || ''

  // ─── state ────────────────────────────────────────────────────────────────
  const [area,             setArea]             = useState(areaFromUrl)
  const [schools,          setSchools]          = useState<SchoolData[]>([])
  const [classes,          setClasses]          = useState<{ name: string }[]>([])
  const [capacityInfo,     setCapacityInfo]     = useState<{ hasSpots: boolean; available: number } | null>(null)

  // פרטי הורה
  const [parentName,       setParentName]       = useState('')
  const [parentPhone,      setParentPhone]      = useState(phoneFromUrl.replace('972', '0').replace('simulator',''))
  const [parentEmail,      setParentEmail]      = useState('')
  const [parentPhone2,     setParentPhone2]     = useState('')
  const [parentName2,      setParentName2]      = useState('')
  const [parentIdNum,      setParentIdNum]      = useState('')
  const [emergencyContact, setEmergencyContact] = useState('')

  // פרטי ילד
  const [childFirstName,   setChildFirstName]   = useState(() => childFromUrl.split(' ')[0] || '')
  const [childLastName,    setChildLastName]     = useState(() => childFromUrl.split(' ').slice(1).join(' ') || '')
  const [childIdNum,       setChildIdNum]       = useState('')
  const [childBirthDate,   setChildBirthDate]   = useState('')
  const [childGender,      setChildGender]      = useState('')
  const [childCity,        setChildCity]        = useState('')
  const [childSchool,      setChildSchool]      = useState('')
  const [childClass,       setChildClass]       = useState(classFromUrl)

  // בריאות
  const [hasAllergy,       setHasAllergy]       = useState('')
  const [allergyDetails,   setAllergyDetails]   = useState('')
  const [dietPref,         setDietPref]         = useState('')
  const [hasMedical,       setHasMedical]       = useState('')
  const [medicalDetails,   setMedicalDetails]   = useState('')
  const [healthConfirmed,  setHealthConfirmed]  = useState(false)

  // כללי
  const [notes,            setNotes]            = useState('')
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState('')

  // ─── טעינת נתוני אזור ────────────────────────────────────────────────────
  useEffect(() => {
    if (!area) return
    // קיבולת
    fetch(`/api/capacity?area=${area}`)
      .then(r => r.json())
      .then(d => setCapacityInfo({ hasSpots: d.hasSpots, available: d.available }))
      .catch(() => setCapacityInfo({ hasSpots: true, available: 30 }))
    // בתי ספר + כיתות
    fetch(`/api/schools?area=${area}`)
      .then(r => r.json())
      .then(d => {
        setSchools(d.schools ?? [])
        setClasses(d.classes ?? [])
        setChildSchool('')
        setChildClass('')
      })
  }, [area])

  // ─── שליחה ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!healthConfirmed) { setError('יש לאשר את הצהרת הבריאות'); return }
    if (parentIdNum && !validateIsraeliId(parentIdNum)) { setError('ת.ז. הורה אינה תקינה'); return }
    if (childIdNum && !validateIsraeliId(childIdNum))   { setError('ת.ז. ילד/ה אינה תקינה'); return }
    const birthDateErr = validateBirthDateVsGrade(childBirthDate, childClass)
    if (birthDateErr) { setError(birthDateErr); return }
    const childName = `${childFirstName.trim()} ${childLastName.trim()}`.trim()
    setLoading(true); setError('')

    try {
      const res = await fetch('/api/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          areaCode: area,
          parentName, parentPhone, parentEmail,
          parentPhone2, parentName2, parentIdNum,
          emergencyContact,
          childName, childIdNum, childBirthDate,
          childGender, childCity, childSchool, childClass,
          childAllergies: hasAllergy === 'כן' ? allergyDetails : '',
          dietPref,
          childMedicalNotes: hasMedical === 'כן' ? medicalDetails : '',
          notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.waitingList ? 'לא נותר מקום פנוי. צרו קשר בוואטסאפ להצטרף לרשימת המתנה.' : data.error || 'שגיאה בשמירת הטופס')
        return
      }
      router.push(`/register/success?area=${encodeURIComponent(area)}`)
    } catch {
      setError('שגיאת תקשורת — נסו שוב')
    } finally {
      setLoading(false)
    }
  }

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#fdf6ef]" dir="rtl">
      {/* כותרת */}
      <div className="bg-[#5c3d2e] text-white py-8 px-4 text-center">
        <div className="text-3xl font-bold mb-1">Kids &amp; Fun 🌟</div>
        <div className="text-lg opacity-90">טופס רישום לצהרון</div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">

        {/* כרטיס קיבולת */}
        {area && capacityInfo && (
          <div
            className="rounded-2xl p-4 mb-6 text-center font-medium"
            style={capacityInfo.hasSpots
              ? { background: '#E6F4EF', color: '#297058' }
              : { background: '#FCEAEA', color: '#EF4444' }}
          >
            {capacityInfo.hasSpots
              ? `✅ יש מקום! נותרו ${capacityInfo.available} מקומות ב${AREAS[area]}`
              : `⚠️ אין מקום פנוי ב${AREAS[area]} — ניתן להצטרף לרשימת המתנה`}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* 1. אזור */}
          <Section title="📍 אזור הצהרון">
            <div className="grid grid-cols-1 gap-3">
              {Object.entries(AREAS).map(([code, label]) => (
                <label key={code} className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  area === code ? 'border-[#5c3d2e] bg-[#f5e6d8]' : 'border-gray-200 bg-white hover:border-[#c49a6c]'
                }`}>
                  <input type="radio" name="area" value={code} checked={area === code}
                    onChange={() => setArea(code)} className="w-5 h-5 accent-[#5c3d2e]" />
                  <span className="font-medium text-[#3d2b1f]">{label}</span>
                </label>
              ))}
            </div>
          </Section>

          {/* 2. פרטי הורה */}
          <Section title="👨‍👩‍👧 פרטי הורה">
            <Field label="שם מלא הורה 1" required>
              <input type="text" value={parentName} onChange={e => setParentName(e.target.value)}
                placeholder="שם פרטי + משפחה" required />
            </Field>
            <Field label="טלפון הורה 1" required>
              <input type="tel" value={parentPhone} onChange={e => setParentPhone(e.target.value)}
                placeholder="05X-XXXXXXX" required />
            </Field>
            <Field label="ת.ז. הורה" required>
              <input type="text" value={parentIdNum} onChange={e => setParentIdNum(e.target.value)}
                placeholder="9 ספרות" required />
            </Field>
            <Field label="כתובת מייל" required>
              <input type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)}
                placeholder="your@email.com" required />
            </Field>
            <Field label="שם הורה 2">
              <input type="text" value={parentName2} onChange={e => setParentName2(e.target.value)}
                placeholder="אופציונלי" />
            </Field>
            <Field label="טלפון הורה 2">
              <input type="tel" value={parentPhone2} onChange={e => setParentPhone2(e.target.value)}
                placeholder="05X-XXXXXXX" />
            </Field>
            <Field label="איש קשר חירום">
              <input type="text" value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)}
                placeholder="שם + טלפון (למשל: סבתא שרה 052-0000000)" />
            </Field>
          </Section>

          {/* 3. פרטי ילד */}
          <Section title="🧒 פרטי הילד/ה">
            <Field label="שם פרטי" required>
              <input type="text" value={childFirstName} onChange={e => setChildFirstName(e.target.value)}
                placeholder="שם פרטי" required />
            </Field>
            <Field label="שם משפחה" required>
              <input type="text" value={childLastName} onChange={e => setChildLastName(e.target.value)}
                placeholder="שם משפחה" required />
            </Field>
            <Field label="ת.ז. ילד/ה" required>
              <input type="text" value={childIdNum} onChange={e => setChildIdNum(e.target.value)}
                placeholder="9 ספרות" required />
            </Field>
            <Field label="תאריך לידה" required>
              <input
                type="date"
                value={childBirthDate}
                onChange={e => setChildBirthDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                min="2005-01-01"
                required
              />
              {(() => {
                const warn = validateBirthDateVsGrade(childBirthDate, childClass)
                return warn ? (
                  <p className="text-amber-600 text-xs mt-1 font-medium">⚠️ {warn}</p>
                ) : null
              })()}
            </Field>
            <Field label="מין" required>
              <select value={childGender} onChange={e => setChildGender(e.target.value)} required>
                <option value="">בחרו</option>
                <option value="זכר">זכר</option>
                <option value="נקבה">נקבה</option>
              </select>
            </Field>
            <Field label="עיר מגורים" required>
              <input type="text" value={childCity} onChange={e => setChildCity(e.target.value)}
                placeholder="עיר מגורים" required />
            </Field>

            {/* בית חינוכי — דינמי לפי אזור */}
            <Field label="בית חינוכי" required>
              {!area ? (
                <div className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-400 text-right">
                  ← בחרו אזור בתחילת הטופס כדי לראות את הרשימה
                </div>
              ) : schools.length > 0 ? (
                <select value={childSchool} onChange={e => setChildSchool(e.target.value)} required>
                  <option value="">בחרו בית חינוכי</option>
                  {schools.map(s => (
                    <option key={s.name} value={s.name}>
                      {s.name}{s.city ? ` — ${s.city}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input type="text" value={childSchool} onChange={e => setChildSchool(e.target.value)}
                  placeholder="שם בית הספר / גן" required />
              )}
            </Field>

            {/* כיתה — מוסתר בתל אביב (גני ילדים בלבד) */}
            {area !== 'telaviv' && (
              <Field label="כיתה" required>
                {classes.length > 0 ? (
                  <select value={childClass} onChange={e => setChildClass(e.target.value)} required>
                    <option value="">בחרו כיתה</option>
                    {classes.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" value={childClass} onChange={e => setChildClass(e.target.value)}
                    placeholder={area ? 'כיתה' : 'בחרו אזור תחילה'} disabled={!area} required />
                )}
              </Field>
            )}
          </Section>

          {/* 4. הצהרת בריאות */}
          <Section title="🏥 הצהרת בריאות">
            <Field label="רגישות למזון" required>
              <select value={hasAllergy} onChange={e => setHasAllergy(e.target.value)} required>
                <option value="">בחרו</option>
                <option value="אין">אין</option>
                <option value="כן">כן</option>
              </select>
            </Field>
            {hasAllergy === 'כן' && (
              <Field label="פרטי הרגישות" required>
                <input type="text" value={allergyDetails} onChange={e => setAllergyDetails(e.target.value)}
                  placeholder="תארו את הרגישות" required />
              </Field>
            )}

            <Field label="העדפה תזונתית" required>
              <select value={dietPref} onChange={e => setDietPref(e.target.value)} required>
                <option value="">בחרו</option>
                <option value="אין">אין העדפה מיוחדת</option>
                <option value="צמחוני">צמחוני</option>
                <option value="טבעוני">טבעוני</option>
              </select>
            </Field>

            <Field label="בעיה רפואית ידועה" required>
              <select value={hasMedical} onChange={e => setHasMedical(e.target.value)} required>
                <option value="">בחרו</option>
                <option value="לא">לא</option>
                <option value="כן">כן</option>
              </select>
            </Field>
            {hasMedical === 'כן' && (
              <Field label="פרטי הבעיה הרפואית" required>
                <textarea value={medicalDetails} onChange={e => setMedicalDetails(e.target.value)}
                  placeholder="תארו את הבעיה הרפואית" rows={3} required />
              </Field>
            )}

            {/* אישור הצהרת בריאות */}
            <label className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
              healthConfirmed ? 'border-[#5c3d2e] bg-[#f5e6d8]' : 'border-gray-200 bg-gray-50'
            }`}>
              <input type="checkbox" checked={healthConfirmed} onChange={e => setHealthConfirmed(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-[#5c3d2e] flex-shrink-0" />
              <span className="text-sm text-[#3d2b1f] leading-relaxed">
                אני מאשר/ת שהמידע הרפואי שמסרתי נכון ומלא, וכי הילד/ה בריא/ה ומסוגל/ת להשתתף בפעילויות הצהרון
              </span>
            </label>
          </Section>

          {/* 5. הערות */}
          <Section title="💬 הערות נוספות">
            <Field label="הערות / בקשות מיוחדות">
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="כל מידע נוסף שתרצו להעביר לצוות" rows={3} />
            </Field>
          </Section>

          {/* שגיאה */}
          {error && (
            <div className="rounded-2xl p-4 text-center text-sm" style={{ background: '#FCEAEA', border: '1px solid #EF444433', color: '#EF4444' }}>
              {error}
            </div>
          )}

          {/* שליחה */}
          <button type="submit" disabled={loading || !area}
            className="w-full py-4 rounded-2xl font-bold text-lg transition-all bg-[#5c3d2e] text-white hover:bg-[#3d2b1f] disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'שולח...' : '✅ שלח טופס רישום'}
          </button>

          <p className="text-center text-sm text-gray-500">
            לאחר השליחה תקבלו אישור ופרטי תשלום ב-WhatsApp
          </p>
        </form>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
      <h2 className="font-bold text-[#5c3d2e] text-lg border-b border-[#f0e0d0] pb-2">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-[#3d2b1f]">
        {label}{required && <span className="text-red-500 mr-1">*</span>}
      </label>
      <div className="[&_input]:w-full [&_input]:border [&_input]:border-gray-200 [&_input]:rounded-xl [&_input]:p-3 [&_input]:text-base [&_input]:outline-none [&_input]:focus:border-[#5c3d2e] [&_input]:disabled:bg-gray-100 [&_select]:w-full [&_select]:border [&_select]:border-gray-200 [&_select]:rounded-xl [&_select]:p-3 [&_select]:text-base [&_select]:outline-none [&_select]:focus:border-[#5c3d2e] [&_textarea]:w-full [&_textarea]:border [&_textarea]:border-gray-200 [&_textarea]:rounded-xl [&_textarea]:p-3 [&_textarea]:text-base [&_textarea]:outline-none [&_textarea]:focus:border-[#5c3d2e] [&_textarea]:resize-none">
        {children}
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#fdf6ef] flex items-center justify-center">
        <div className="text-[#5c3d2e] text-xl">טוען...</div>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  )
}
