import { PAYPLUS_STATIC_LINKS } from '@/lib/bot/payment-helpers'

const AREA_LABELS: Record<string, string> = {
  carmel:  'חוף הכרמל',
  sharon:  'דרום השרון / חוף השרון',
  telaviv: 'גני ילדים תל אביב',
}

// דף הצלחה לאחר הגשת טופס הרישום.
// אם ידוע האזור — מציגים מיד את קישור התשלום (הוראת קבע ב-PayPlus),
// כדי שההורה יסגור את המעגל בלי לחכות לנציגה.
export default function SuccessPage({
  searchParams,
}: {
  searchParams: { area?: string }
}) {
  const area = searchParams?.area ?? ''
  const paymentUrl = PAYPLUS_STATIC_LINKS[area]
  const areaLabel = AREA_LABELS[area] ?? ''

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
