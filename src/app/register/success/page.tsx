export default function SuccessPage() {
  return (
    <div className="min-h-screen bg-[#fdf6ef] flex flex-col items-center justify-center px-4 text-center" dir="rtl">
      <div className="bg-white rounded-3xl shadow-lg p-10 max-w-md w-full">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-[#5c3d2e] mb-3">הטופס התקבל בהצלחה!</h1>
        <p className="text-gray-600 text-lg mb-6 leading-relaxed">
          תודה שנרשמתם לצהרון Kids &amp; Fun.<br />
          הצוות שלנו יצור אתכם קשר בהקדם<br />
          לאישור ופרטי תשלום 💛
        </p>
        <div className="bg-[#f5e6d8] rounded-2xl p-4 text-[#5c3d2e] text-sm">
          📱 ניתן גם לפנות אלינו בכל שאלה<br />
          דרך וואטסאפ
        </div>
      </div>
    </div>
  )
}
