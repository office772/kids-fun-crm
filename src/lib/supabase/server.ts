import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

// astra R1/#9: כשרצים בהקשר סימולטור — כל כתיבה היא no-op. עוטפים את .from(table)
// כך ש-insert/update/upsert/delete מחזירים תוצאה ריקה בלי לגעת ב-DB, אבל select
// וסינון עוברים ל-client האמיתי (קריאות בטוחות). מנגנון אחד חוסם את *כל* נתיבי
// השינוי במקום החרגה פר-פונקציה. request-scoped — לא משפיע על ה-webhook.
const WRITE_METHODS = new Set(['insert', 'update', 'upsert', 'delete'])

function noopWriteResult(): unknown {
  const proxy: unknown = new Proxy(function () {} as object, {
    get(_t, prop) {
      if (prop === 'then')    return (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res)
      if (prop === 'catch')   return (fn: (e: unknown) => unknown) => Promise.resolve({ data: null, error: null }).catch(fn)
      if (prop === 'finally') return (fn: () => void) => Promise.resolve({ data: null, error: null }).finally(fn)
      return () => proxy   // כל method משורשר מחזיר את אותו no-op thenable
    },
    apply() { return proxy },
  })
  return proxy
}

export function sandboxWrites<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table: string) => {
          const builder = (target as { from(t: string): unknown }).from(table)
          return new Proxy(builder as object, {
            get(b, p, r) {
              if (typeof p === 'string' && WRITE_METHODS.has(p)) return () => noopWriteResult()
              const v = Reflect.get(b, p, r)
              if (typeof v === 'function') {
                return (...args: unknown[]) => {
                  const out = (v as (...a: unknown[]) => unknown).apply(b, args)
                  return out === b ? r : out   // שרשור קריאה (eq/select/...) — ממשיכים לעטוף
                }
              }
              return v
            },
          })
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as T
}

export function createServiceClient() {
  const { createClient } = require('@supabase/supabase-js')
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { isSimulated } = require('./sim-context')
  return isSimulated() ? sandboxWrites(client) : client
}
