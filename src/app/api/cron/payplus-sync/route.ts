export const dynamic = 'force-dynamic'

// ─── סנכרון יומי של חיובים מ-PayPlus ─────────────────────────────────────────
// רץ כל בוקר (בנפרד מ-payments-check). שולף את 3 הדו"חות מ-PayPlus:
//   - חיובים שבוצעו (charged)
//   - חיובים שנכשלו (failures)
//   - כרטיסים שפג תוקפם (expiredcards)
// מצליב מול ה-CRM ומשלים רשומות חסרות / מעדכן סטטוסים.
// משמש כ-safety net במקרה ש-callback אחד נכשל או הלך לאיבוד.
//
// ⚠️ חשוב — מבנה הדו"חות (אומת חי מול PayPlus 2026-06-29):
//   charged:  יש transaction_uid + uid.  אין customer_phone.
//   failures: יש uid (מזהה רשומת הכשל) + status (אובייקט).  אין transaction_uid, אין phone.
//   לכן: מתאימים הורה לפי recurring_uid / customer_name (לא טלפון), ו-dedup לפי uid.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { fetchChargedReport, fetchFailuresReport, fetchExpiredCardsReport, isPayPlusApiConfigured, type ChargedRecord } from '@/lib/payplus-api'
import { isAuthorizedCron, unauthorized } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return unauthorized()
  if (!isPayPlusApiConfigured()) {
    console.log('[Cron payplus-sync] PayPlus API not configured — skipping')
    return NextResponse.json({ ok: true, skipped: true, reason: 'api not configured' })
  }

  // טווח: 45 ימים אחורה — מכסה מחזור חיוב חודשי מלא + מרווח, כך שכשל לא יתפספס
  // גם אם ה-cron לא רץ כמה ימים. דו"ח הכשלים ממילא מכיל רק כשלים שלא נפתרו,
  // ו-dedup (לפי uid/transaction_uid) מונע כפילויות בהרצות חוזרות.
  const toDate   = new Date().toISOString().slice(0, 10)
  const fromDate = new Date(Date.now() - 45 * 86400_000).toISOString().slice(0, 10)

  const [charged, failures, expired] = await Promise.all([
    fetchChargedReport(fromDate, toDate),
    fetchFailuresReport(fromDate, toDate),
    fetchExpiredCardsReport(),
  ])

  const { createServiceClient } = await import('@/lib/supabase/server')
  const supabase = createServiceClient()

  const stats = { reconciled: 0, new_charges: 0, failures_recorded: 0, failures_nomatch: 0, marked_expired: 0, errors: 0 }

  // ─── חיובים שבוצעו: לוודא שיש להם רשומה ב-CRM ─────────────────────────────
  for (const rec of (charged.data ?? [])) {
    try {
      // backfill מתמשך: שמירת recurring_uid על ההורה (אם חסר) — מאפשר חידוש כרטיס
      if (rec.recurring_uid) {
        const pid = await findParent(supabase, rec)
        if (pid) {
          await supabase.from('parents')
            .update({ payplus_recurring_uid: rec.recurring_uid, payplus_recurring_status: 'active' })
            .eq('id', pid).is('payplus_recurring_uid', null)
        }
      }
      if (!rec.transaction_uid) continue

      // חיוב שלא נקלט דרך webhook — מצרפים אותו.
      // upsert + ignoreDuplicates = INSERT ON CONFLICT DO NOTHING (חסין מהרצות חוזרות).
      // תוצאת ה-upsert היא מקור האמת: שורה הוחזרה = הוספנו; ריק = כבר היה (reconciled).
      const parentId = await findParent(supabase, rec)
      if (!parentId) continue

      const { data: ins } = await supabase.from('payments').upsert({
        parent_id:               parentId,
        amount:                  rec.amount ?? null,
        status:                  'שולם',
        payment_type:            'הוראת קבע',
        paid_at:                 ppDateToISO(rec.execution_date ?? rec.date_to_charge) ?? new Date().toISOString(),
        payplus_transaction_uid: rec.transaction_uid,
        payplus_ref:             rec.transaction_uid,
        source:                  'payplus_webhook',
        payment_number:          rec.payment_number ?? null,
      }, { onConflict: 'payplus_transaction_uid', ignoreDuplicates: true }).select('id')
      if (ins && ins.length) stats.new_charges++
      else stats.reconciled++
    } catch (err) {
      console.error('[payplus-sync] charged error:', err)
      stats.errors++
    }
  }

  // ─── כשלים: רושמים רשומת תשלום 'נכשל' + פנייה דחופה לכל אחד שלא טופל ────────
  // ⚠️ דו"ח הכשלים אין בו transaction_uid — ה-dedup ומפתח הזיהוי הם uid (מזהה
  //    רשומת הכשל ב-PayPlus). זה תוקן ב-2026-06-29: קודם היה `if (!transaction_uid)
  //    continue` שדילג על כל כשל בשקט (כך Issan Simha וכשלים נוספים לא נקלטו).
  for (const rec of (failures.data ?? [])) {
    try {
      const failKey = rec.uid
        || (rec.recurring_uid && rec.date_to_charge ? `fail_${rec.recurring_uid}_${rec.date_to_charge}` : null)
      if (!failKey) continue

      const parentId = await findParent(supabase, rec)
      if (!parentId) { stats.failures_nomatch++; continue }

      // upsert ignoreDuplicates — שורה ריקה = הכשל כבר נרשם, מדלגים (כולל הפנייה)
      const reason = failureReason(rec)
      const { data: ins } = await supabase.from('payments').upsert({
        parent_id:               parentId,
        amount:                  rec.amount ?? null,
        status:                  'נכשל',
        payment_type:            'הוראת קבע',
        number_of_failures:      1,
        payplus_transaction_uid: failKey,
        payplus_ref:             failKey,
        source:                  'payplus_webhook',
        failure_reason:          reason,
      }, { onConflict: 'payplus_transaction_uid', ignoreDuplicates: true }).select('id')
      if (!ins || !ins.length) continue

      // סימון ההו"ק כ-failed (כדי שהבוט/הדשבורד ידעו)
      await supabase.from('parents')
        .update({ payplus_recurring_status: 'failed' })
        .eq('id', parentId).neq('payplus_recurring_status', 'failed')

      // פנייה אחת פתוחה לכל הורה (לא כופלים מדי יום).
      // ⚠️ limit(1) ולא maybeSingle — maybeSingle מחזיר null כשיש כמה שורות,
      //    מה שהיה גורם ליצירת כפילות אינסופית למי שכבר יש לו >1 פנייה פתוחה.
      const { data: openTasks } = await supabase
        .from('tasks').select('id')
        .eq('parent_id', parentId).eq('type', 'כשל תשלום').eq('status', 'פתוח').limit(1)
      if (!openTasks?.length) {
        await supabase.from('tasks').insert({
          parent_id:   parentId,
          type:        'כשל תשלום',
          description: `כשל חיוב הוראת קבע — ${rec.customer_name ?? ''} (₪${rec.amount ?? '?'}) | ${reason} | נקלט בסנכרון יומי`,
          priority:    'דחוף',
          status:      'פתוח',
        })
      }
      stats.failures_recorded++
    } catch (err) {
      console.error('[payplus-sync] failure error:', err)
      stats.errors++
    }
  }

  // ─── כרטיסים שפג תוקפם: סימון בהורה ──────────────────────────────────────
  for (const rec of (expired.data ?? [])) {
    try {
      const parentId = await findParent(supabase, rec)
      if (!parentId) continue
      await supabase.from('parents').update({ payplus_recurring_status: 'expired' }).eq('id', parentId)
      // פנייה אחת פתוחה לכל הורה (לא כופלים מדי יום) — limit(1) ולא maybeSingle (ראה הערה למעלה)
      const { data: existingTasks } = await supabase
        .from('tasks').select('id')
        .eq('parent_id', parentId).eq('type', 'כשל תשלום').eq('status', 'פתוח').limit(1)
      if (!existingTasks?.length) {
        await supabase.from('tasks').insert({
          parent_id:   parentId,
          type:        'כשל תשלום',
          description: `🟡 כרטיס אשראי פג תוקף — ${rec.customer_name ?? ''} | יש לעדכן פרטי כרטיס`,
          priority:    'גבוה',
          status:      'פתוח',
        })
      }
      stats.marked_expired++
    } catch (err) {
      console.error('[payplus-sync] expired error:', err)
      stats.errors++
    }
  }

  console.log(`[payplus-sync] reconciled=${stats.reconciled} new_charges=${stats.new_charges} failures=${stats.failures_recorded} (nomatch=${stats.failures_nomatch}) expired=${stats.marked_expired} errors=${stats.errors}`)
  return NextResponse.json({ ok: true, stats })
}

// ─── helpers ─────────────────────────────────────────────────────────────────

// מציאת הורה לפי recurring_uid → שם לקוח (הדו"חות אינם כוללים טלפון!)
async function findParent(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createServiceClient>>,
  rec: ChargedRecord
): Promise<string | null> {
  if (rec.recurring_uid) {
    const { data } = await supabase
      .from('parents').select('id').eq('payplus_recurring_uid', rec.recurring_uid).maybeSingle()
    if (data) return data.id
  }
  // התאמה לפי שם — רק אם חד-משמעית (שם יחיד), לא מנחשים בכפילות
  const name = rec.customer_name?.trim()
  if (name) {
    let { data: matches } = await supabase.from('parents').select('id').ilike('name', name).limit(2)
    if (!matches?.length) {
      const res = await supabase.from('parents').select('id').ilike('name', `%${name}%`).limit(2)
      matches = res.data
    }
    if (matches && matches.length === 1) return matches[0].id
  }
  return null
}

// חילוץ סיבת כשל קריאה מתוך rec.status (אובייקט { status_code, key } או מחרוזת)
function failureReason(rec: ChargedRecord): string {
  const s = rec.status
  let code = ''
  let key  = ''
  if (s && typeof s === 'object') {
    code = String(s.status_code ?? s.code ?? '')
    key  = String(s.key ?? s.description ?? '')
  } else if (s != null) {
    code = String(s)
  }
  // כרטיס פג תוקף לפי תאריך התפוגה (MMYY)
  if (isExpiredByDate(rec.card_expiry)) return 'כרטיס אשראי פג תוקף'
  if (/expir|פג.?תוקף/i.test(key)) return 'כרטיס אשראי פג תוקף'
  if (code) return `עסקה נדחתה (קוד ${code})`
  return 'חיוב נכשל'
}

// "0131" → ינואר 2031.  מחזיר true אם התאריך כבר עבר.
function isExpiredByDate(expiry?: string): boolean {
  if (!expiry || !/^\d{4}$/.test(expiry)) return false
  const mm = parseInt(expiry.slice(0, 2), 10)
  const yy = parseInt(expiry.slice(2), 10)
  if (mm < 1 || mm > 12) return false
  const exp = new Date(2000 + yy, mm, 1) // תחילת החודש שאחרי תוקף
  return exp.getTime() < Date.now()
}

// "DD/MM/YYYY" → ISO string (או undefined אם לא בפורמט)
function ppDateToISO(d?: string): string | undefined {
  if (!d) return undefined
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return undefined
  return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`).toISOString()
}
