import { PAYPLUS_STATIC_LINKS, createPayPlusPaymentLink } from '@/lib/bot/payment-helpers'

export const dynamic = 'force-dynamic'

const AREA_LABELS: Record<string, string> = {
  carmel:  'חוף הכרמל',
  sharon:  'דרום השרון / חוף השרון',
  telaviv: 'גני ילדים תל אביב',
}

// עלות חודשית לפי אזור (בסנדבוקס מוגבל אוטומטית ל-5₪ בתוך createPayPlusPaymentLink).
// TODO: למשוך מהגדרת הסניף כשתתווסף עמודת monthly_fee.
const AREA_FEES: Record<string, number> = {
  carmel:  935,
  telaviv: 946,
  sharon:  1470,
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
      .select('id, area_code, area_label, parent:parents(name, phone), child:children(name)')
      .eq('id', regId)
      .maybeSingle()
    if (!reg) return null

    const parent = Array.isArray(reg.parent) ? reg.parent[0] : reg.parent
    const child  = Array.isArray(reg.child)  ? reg.child[0]  : reg.child
    const areaCode = reg.area_code ?? area
    const amount   = AREA_FEES[areaCode] ?? 935

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

  // קישור דינמי (מועדף) → נפילה ללינק סטטי רק אם הדינמי נכשל
  const dynamicUrl = reg ? await buildDynamicPaymentUrl(area, reg) : null
  const paymentUrl = dynamicUrl ?? PAYPLUS_STATIC_LINKS[area]

  return (
    <div className="min-h-screen bg-[#fdf6ef] flex flex-col items-center justify-center px-4 py-10 text-center" dir="rtl">
      <div className="bg-white rounded-3xl shadow-lg p-10 max-w-md w-full">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-[#5c3d2e] mb-3">הטופס התקבל בהצלחה!</h1>

        {paymentUrl ? (
          <>
            <p className="text-gray-600 text-lg mb-6 leading-relaxed">
              תודה שנרשמתם לצהרון Kids &amp; Fun{areaLabel ? ` — ${areaLabel}` : ''}.<br />
              נותר צעד אחרון להשלמת הרישום:
            </p>
            <a
              href={paymentUrl}
              className="block w-full bg-[#5c8a4e] hover:bg-[#4a7440] text-white text-xl font-bold rounded-2xl py-4 px-6 mb-4 transition-colors"
            >
              💳 להסדרת התשלום (הוראת קבע)
            </a>
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              התשלום מאובטח דרך PayPlus.<br />
              לאחר ההסדרה יישלח אישור והרישום יושלם ✅
            </p>
            <div className="bg-[#f5e6d8] rounded-2xl p-4 text-[#5c3d2e] text-sm">
              מעדיפים לשלם אחרת (מזומן / צ׳קים / העברה)?<br />
              📱 כתבו לנו בוואטסאפ ונסדר הכל
            </div>
          </>
        ) : (
          <>
            <p className="text-gray-600 text-lg mb-6 leading-relaxed">
              תודה שנרשמתם לצהרון Kids &amp; Fun.<br />
              הצוות שלנו יצור אתכם קשר בהקדם<br />
              לאישור ופרטי תשלום 💛
            </p>
            <div className="bg-[#f5e6d8] rounded-2xl p-4 text-[#5c3d2e] text-sm">
              📱 ניתן גם לפנות אלינו בכל שאלה<br />
              דרך וואטסאפ
            </div>
          </>
        )}
      </div>
    </div>
  )
}
