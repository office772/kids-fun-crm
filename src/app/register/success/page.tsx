import { createPayPlusPaymentLink } from '@/lib/bot/payment-helpers'
import { resolveMonthlyFee } from '@/lib/bot/pricing'

export const dynamic = 'force-dynamic'

const AREA_LABELS: Record<string, string> = {
  carmel:  'חוף הכרמל',
  sharon:  'דרום השרון / חוף השרון',
  telaviv: 'גני ילדים תל אביב',
}

// ─── מייצר קישור תשלום דינמי (הוראת קבע) לפי הרישום שנשמר ──────────────────
// דינמי = מכבד את הגדרת הסנדבוקס (5₪) ומחזיר קישור paymentsdev בבדיקות,
// במקום הלינקים הסטטיים שהם פרודקשן עם הסכום המלא (1470₪ וכו').
async function buildDynamicPaymentUrl(area: string, regId: string): Promise<string | null> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const { data: reg } = await supabase
      .from('registrations')
      .select('id, area_code, area_label, parent:parents(name, phone), child:children(name, school, class_name)')
      .eq('id', regId)
      .maybeSingle()
    if (!reg) return null

    const parent = Array.isArray(reg.parent) ? reg.parent[0] : reg.parent
    const child  = Array.isArray(reg.child)  ? reg.child[0]  : reg.child
    const areaCode = reg.area_code ?? area

    // מחיר דינמי לפי בית-ספר/כיתה (מודל קורלי). null → לא מייצרים לינק עם סכום
    // מנוחש; מחזירים null והדף מציג "הצוות יצור קשר".
    const amount = resolveMonthlyFee({ area_code: areaCode, school: child?.school, class_name: child?.class_name })
    if (amount == null) return null

    const result = await createPayPlusPaymentLink({
      registrationId: reg.id,
      parentName:     parent?.name ?? '',
      phone:          parent?.phone ?? '',
      childName:      child?.name ?? '',
      areaCode,
      areaLabel:      reg.area_label ?? AREA_LABELS[areaCode] ?? '',
      amount,
      description:    `הוראת קבע צהרון — ${child?.name ?? ''}`.trim(),
      paymentType:    'standing_order',
    })
    return result.success && result.paymentUrl ? result.paymentUrl : null
  } catch {
    return null
  }
}

// דף הצלחה לאחר הגשת טופס הרישום.
export default async function SuccessPage({
  searchParams,
}: {
  searchParams: { area?: string; reg?: string }
}) {
  const area = searchParams?.area ?? ''
  const reg  = searchParams?.reg ?? ''
  const areaLabel = AREA_LABELS[area] ?? ''

  // קישור דינמי לפי בית-ספר/כיתה. אם לא ניתן (מחיר לא ודאי / תקלה) — אין לינק,
  // והדף מציג "הצוות יצור קשר" במקום לחייב סכום שגוי.
  const paymentUrl = reg ? await buildDynamicPaymentUrl(area, reg) : null

  return (
    <div className="min-h-screen bg-crm-bg flex flex-col items-center justify-center px-4 py-10 text-center" dir="rtl">
      <div className="bg-crm-surface rounded-crm-lg border border-crm-border shadow-crm-lg p-8 sm:p-10 max-w-md w-full">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-crm-primary mb-3">הטופס התקבל בהצלחה!</h1>

        {paymentUrl ? (
          <>
            <p className="text-crm-text text-lg mb-6 leading-relaxed">
              תודה שנרשמתם לצהרון Kids &amp; Fun{areaLabel ? ` — ${areaLabel}` : ''}.<br />
              נותר צעד אחרון להשלמת הרישום:
            </p>
            <a
              href={paymentUrl}
              className="block w-full bg-crm-primary hover:opacity-90 text-white text-xl font-bold rounded-crm py-4 px-6 mb-4 transition-opacity"
            >
              💳 להסדרת התשלום (הוראת קבע)
            </a>
            <p className="text-crm-text-muted text-sm mb-6 leading-relaxed">
              התשלום מאובטח דרך PayPlus.<br />
              לאחר ההסדרה יישלח אישור והרישום יושלם ✅
            </p>
            <div className="bg-crm-surface-soft border border-crm-border rounded-crm p-4 text-crm-text text-sm">
              מעדיפים לשלם אחרת (מזומן / צ׳קים / העברה)?<br />
              📱 כתבו לנו בוואטסאפ ונסדר הכל
            </div>
          </>
        ) : (
          <>
            <p className="text-crm-text text-lg mb-6 leading-relaxed">
              תודה שנרשמתם לצהרון Kids &amp; Fun.<br />
              הצוות שלנו יצור אתכם קשר בהקדם<br />
              לאישור ופרטי תשלום 💛
            </p>
            <div className="bg-crm-surface-soft border border-crm-border rounded-crm p-4 text-crm-text text-sm">
              📱 ניתן גם לפנות אלינו בכל שאלה<br />
              דרך וואטסאפ
            </div>
          </>
        )}
      </div>
    </div>
  )
}
