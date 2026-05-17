'use client'

type StatusType = string

// Pantarei-aligned color palette
// rose/salmon = accent (#D29486 family) for open/new items
// plum = primary (#6D436D) for active/in-progress items
// green = success, amber = warning, red = error, stone = neutral
const statusStyles: Record<string, { bg: string; color: string; dot?: string }> = {
  // תשלום
  'שולם':           { bg: '#dcfce7', color: '#15803d', dot: '#16a34a' },
  'ממתין':          { bg: '#fef3c7', color: '#b45309', dot: '#d97706' },
  'נכשל':           { bg: '#f5dde5', color: '#7d2d4a', dot: '#9d3d5e' },
  'חלקי':           { bg: '#fce9e6', color: '#a05a4f', dot: '#D29486' },
  'זיכוי':          { bg: '#ede8f5', color: '#5a3d7a', dot: '#6D436D' },

  // רישום
  'מאושר':          { bg: '#dcfce7', color: '#15803d', dot: '#16a34a' },
  'ממתין לאישור':   { bg: '#fef3c7', color: '#b45309', dot: '#d97706' },
  'נדחה':           { bg: '#f5dde5', color: '#7d2d4a', dot: '#9d3d5e' },
  'רשימת המתנה':    { bg: '#fce9e6', color: '#a05a4f', dot: '#D29486' },
  'בוטל':           { bg: '#f5f5f4', color: '#78716c', dot: '#a8a29e' },
  'ליד חדש':        { bg: '#fce9e6', color: '#a05a4f', dot: '#D29486' },
  'רשום':           { bg: '#6D436D', color: '#ffffff', dot: '#ffffff' },

  // משימות — rose for open (needs attention), plum for in-progress, green for done
  'פתוח':           { bg: '#fce9e6', color: '#a05a4f', dot: '#D29486' },
  'בטיפול':         { bg: '#6D436D', color: '#ffffff', dot: '#ffffff' },
  'טופל':           { bg: '#f5f5f4', color: '#78716c', dot: '#a8a29e' },

  // עדיפות
  'דחוף':           { bg: '#f5dde5', color: '#7d2d4a', dot: '#9d3d5e' },
  'גבוה':           { bg: '#fce9e6', color: '#a05a4f', dot: '#D29486' },
  'רגיל':           { bg: '#f5f5f4', color: '#78716c', dot: '#a8a29e' },
}

const fallback = { bg: '#f5f5f4', color: '#78716c', dot: '#a8a29e' }

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
