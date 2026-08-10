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
        background: 'var(--crm-bg)',
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          background: 'var(--crm-surface)',
          borderRadius: 'var(--crm-radius-lg)',
          border: '1px solid var(--crm-border)',
          padding: '40px 32px',
          boxShadow: 'var(--crm-shadow-lg)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 88,
            height: 88,
            margin: '0 auto 20px',
            borderRadius: '50%',
            background: cancelled ? 'var(--crm-warning-bg)' : 'var(--crm-danger-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 44,
            color: cancelled ? 'var(--crm-warning)' : 'var(--crm-danger)',
          }}
        >
          {cancelled ? '↩' : '✕'}
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 12px', color: 'var(--crm-primary)' }}>
          {cancelled ? 'התשלום בוטל' : 'התשלום לא עבר'}
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--crm-text)', margin: '0 0 8px' }}>
          {cancelled
            ? 'ביטלת את התשלום. אפשר לנסות שוב בכל רגע.'
            : 'משהו השתבש והתשלום לא הושלם. אפשר לנסות שוב, או לפנות אלינו ונעזור.'}
        </p>
        <p style={{ fontSize: 15, color: 'var(--crm-text-muted)', margin: '24px 0 0' }}>
          צריכה עזרה? אנחנו כאן 💛
          <br />
          <strong style={{ color: 'var(--crm-primary)' }}>Kids &amp; Fun</strong>
        </p>
      </div>
    </main>
  )
}
