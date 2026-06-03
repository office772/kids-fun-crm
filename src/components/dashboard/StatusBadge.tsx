'use client'

// ─── המניפה המאושרת ────────────────────────────────────────────────────────
// ירוק:   #297058 | רקע בהיר: #E6F4EF
// אדום:   #EF4444 | רקע בהיר: #FCEAEA
// צהוב:   #FAD980 | רקע בהיר: #FEF9C3  (שניהם במניפה)
// סגול:   #6D436D | רקע בהיר: #F0EBF3
// סלמון:  #D29486 | רקע בהיר: #FAF0ED
// אפור:   #7B8794 | רקע בהיר: #F0F1F2
// ──────────────────────────────────────────────────────────────────────────

type StatusType = string

const statusStyles: Record<string, { bg: string; color: string; dot?: string }> = {
  // ── תשלום ────────────────────────────────────────────────────────────────
  'שולם':           { bg: '#E6F4EF', color: '#297058', dot: '#297058' },
  'ממתין':          { bg: '#FEF9C3', color: '#7B6010', dot: '#FAD980' },
  'נכשל':           { bg: '#FCEAEA', color: '#EF4444', dot: '#EF4444' },
  'חלקי':           { bg: '#FAF0ED', color: '#9B4A38', dot: '#D29486' },
  'זיכוי':          { bg: '#F0EBF3', color: '#6D436D', dot: '#6D436D' },

  // ── רישום ────────────────────────────────────────────────────────────────
  'מאושר':          { bg: '#E6F4EF', color: '#297058', dot: '#297058' },
  'ממתין לאישור':   { bg: '#FEF9C3', color: '#7B6010', dot: '#FAD980' },
  'נדחה':           { bg: '#FCEAEA', color: '#EF4444', dot: '#EF4444' },
  'רשימת המתנה':    { bg: '#FAF0ED', color: '#9B4A38', dot: '#D29486' },
  'בוטל':           { bg: '#F0F1F2', color: '#7B8794', dot: '#7B8794' },
  'ליד חדש':        { bg: '#FAF0ED', color: '#9B4A38', dot: '#D29486' },
  'רשום':           { bg: '#6D436D', color: '#ffffff',  dot: '#ffffff' },

  // ── משימות ───────────────────────────────────────────────────────────────
  'פתוח':           { bg: '#FAF0ED', color: '#9B4A38', dot: '#D29486' },
  'בטיפול':         { bg: '#6D436D', color: '#ffffff',  dot: '#ffffff' },
  'טופל':           { bg: '#F0F1F2', color: '#7B8794', dot: '#7B8794' },

  // ── עדיפות ───────────────────────────────────────────────────────────────
  'דחוף':           { bg: '#FCEAEA', color: '#EF4444', dot: '#EF4444' },
  'גבוה':           { bg: '#FAF0ED', color: '#9B4A38', dot: '#D29486' },
  'רגיל':           { bg: '#F0F1F2', color: '#7B8794', dot: '#7B8794' },
}

const fallback = { bg: '#F0F1F2', color: '#7B8794', dot: '#7B8794' }

interface Props {
  status: StatusType
  size?: 'sm' | 'md'
  showDot?: boolean
}

export function StatusBadge({ status, size = 'md', showDot = true }: Props) {
  const cfg = statusStyles[status] ?? fallback
  const sizeClass = size === 'sm' ? 'text-xs px-2.5 py-0.5' : 'text-sm px-3 py-1'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${sizeClass}`}
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {showDot && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: cfg.dot ?? cfg.color }}
        />
      )}
      {status}
    </span>
  )
}
