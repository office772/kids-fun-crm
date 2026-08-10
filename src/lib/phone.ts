// ─── נרמול טלפון ─────────────────────────────────────────────────────────────
// מקורות שונים שומרים טלפון בפורמטים שונים:
//   - הבוט/uChat:  +972547580548  (E.164 עם +)
//   - טופס רישום:  972547580548   (ספרות בלבד)
//   - ידני/ישן:    0547580548     (מקומי)
// כדי שלא ייווצרו הורים כפולים — כל חיפוש הורה לפי טלפון צריך לכסות את כל הווריאנטים.

// "972547580548" — בינלאומי ללא + (הפורמט הקנוני שלנו)
export function normIntl(raw: string): string {
  return (raw || '').replace(/\D/g, '').replace(/^0/, '972')
}

// כל הווריאנטים האפשריים לאותו מספר — לשימוש ב-.in('phone', …)
export function phoneVariants(raw: string): string[] {
  const intl  = normIntl(raw)                    // 972...
  const local = '0' + intl.replace(/^972/, '')   // 0...
  return Array.from(new Set([intl, '+' + intl, local, (raw || '').trim()].filter(Boolean)))
}
