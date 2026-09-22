// astra R1/#9: בידוד הסימולטור מכתיבה אמיתית.
// הסימולטור אינו sandbox — הוא קורא ל-processMessage האמיתי, וכל flow יוצר לעצמו
// createServiceClient עם service-role. חסימה פר-פונקציה (כמו בביטול) לא מספיקה: יש
// נתיבי שינוי נוספים (למשל children.update ב-register_complete_placeholder) שמסתמכים
// על מצב שיחה/מזהי ישויות שהלקוח שולח. לכן חוסמים *כל* כתיבה כברירת מחדל, ברמת ה-client.
//
// AsyncLocalStorage נושא דגל "מדומה" לאורך כל עץ ה-async של הבקשה. createServiceClient
// בודק אותו ומחזיר client שבו insert/update/upsert/delete הם no-op (קריאות select
// עוברות כרגיל, כדי שהסימולטור עדיין יראה נתונים אמיתיים). request-scoped — בקשות רגילות
// (webhook) אינן מושפעות.
import { AsyncLocalStorage } from 'node:async_hooks'

const store = new AsyncLocalStorage<boolean>()

/** מריץ פונקציה בהקשר "מדומה" — כל כתיבה ל-Supabase בתוכה תהיה no-op. */
export function runSimulated<T>(fn: () => T): T {
  return store.run(true, fn)
}

/** true אם הקוד רץ כרגע בתוך הקשר סימולטור. */
export function isSimulated(): boolean {
  return store.getStore() === true
}
