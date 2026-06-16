// ─── עמוד כשל / ביטול תשלום ──────────────────────────────────────────────
// PayPlus מפנה לכאן כשתשלום נכשל (refURL_failure) או בוטל (refURL_cancel + cancelled=1).

export const dynamic = 'force-dynamic'

export default function PaymentFailPage({
  searchParams,
}: {
  searchParams: { test?: string; reg?: string; cancelled?: string }
}) {
  const cancelled = searchParams.cancelled === '1'

  return (
    <main
      dir="rtl"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg,#fef2f2 0%,#f6f7fb 100%)',
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
            background: cancelled ? '#f59e0b' : '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 48,
            color: '#fff',
          }}
        >
          {cancelled ? '↩' : '✕'}
        </div>
        <h1 style={{ fontSize: 26, margin: '0 0 12px', color: cancelled ? '#b45309' : '#b91c1c' }}>
          {cancelled ? 'התשלום בוטל' : 'התשלום לא עבר'}
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: '#374151', margin: '0 0 8px' }}>
          {cancelled
            ? 'ביטלת את התשלום. אפשר לנסות שוב בכל רגע.'
            : 'משהו השתבש והתשלום לא הושלם. אפשר לנסות שוב, או לפנות אלינו ונעזור.'}
        </p>
        <p style={{ fontSize: 15, color: '#6b7280', margin: '24px 0 0' }}>
          צריכה עזרה? אנחנו כאן 💛
          <br />
          <strong>Kids &amp; Fun</strong>
        </p>
      </div>
    </main>
  )
}
