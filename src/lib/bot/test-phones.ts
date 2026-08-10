// ─── מספרי בדיקה (שלב בדיקות) ────────────────────────────────────────────────
// רק המספרים האלה מקבלים תשובה מהבוט, ורק עליהם מותר "איפוס בדיקה" בדשבורד.
// לפתיחה לכולם בסיום הבדיקות: לרוקן את המערך → TEST_PHONES = []
export const TEST_PHONES = [
  '972544535688',
  '972546603344',
  // '972547580548' — אייל: הוסר 08/07 (מתכתב עם המספר העסקי בלי קשר לבוט — הבוט שותק אצלו)
  '972546102262',   // קורלי — בדיקות לקראת מסירה
  '972544487290',   // אייבי — בדיקות
]

// נרמול לפורמט בינלאומי להשוואה (0xx– → 972xx)
export function normIntl(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0/, '972')
}

// האם המספר מורשה (ברשימת הבדיקה). רשימה ריקה = כולם מורשים.
export function isTestPhone(raw: string): boolean {
  if (TEST_PHONES.length === 0) return true
  const digits = normIntl(raw)
  return TEST_PHONES.some(p => normIntl(p) === digits)
}
