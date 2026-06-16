// ─── עמוד אישור תשלום מוצלח ──────────────────────────────────────────────
// PayPlus מפנה לכאן אחרי תשלום שעבר (refURL_success).

export const dynamic = 'force-dynamic'

export default function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: { test?: string; reg?: string }
}) {
  const isTest = searchParams.test === '1'

  return (
    <main
      dir="rtl"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg,#f0fdf4 0%,#f6f7fb 100%)',
        fontFamily: '-apple-system, "Segoe UI", Arial, sans-serif',
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          background: '#fff',
          borderRadius: 20,
          padding: '40px 32px',
          boxShadow: '0 8px 32px rgba(0,0,0,.1)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 88,
            height: 88,
            margin: '0 auto 20px',
            borderRadius: '50%',
            background: '#16a34a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 48,
            color: '#fff',
          }}
        >
          ✓
        </div>
        <h1 style={{ fontSize: 26, margin: '0 0 12px', color: '#15803d' }}>
          התשלום התקבל בהצלחה! 🎉
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: '#374151', margin: '0 0 8px' }}>
          תודה רבה! קיבלנו את התשלום שלך.
          <br />
          אישור נשלח אליך גם במייל.
        </p>
        {isTest && (
          <p
            style={{
              fontSize: 14,
              color: '#92400e',
              background: '#fef9c3',
              border: '1px solid #fde047',
              borderRadius: 10,
              padding: '10px 14px',
              margin: '16px 0 0',
            }}
          >
            🧪 זו הייתה עסקת בדיקה (סנדבוקס) — לא חויב כסף אמיתי.
          </p>
        )}
        <p style={{ fontSize: 15, color: '#6b7280', margin: '24px 0 0' }}>
          יש שאלה? אנחנו כאן 💛
          <br />
          <strong>Kids &amp; Fun</strong>
        </p>
      </div>
    </main>
  )
}
