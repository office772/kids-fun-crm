// ─── עמוד אישור תשלום מוצלח ──────────────────────────────────────────────
// PayPlus מפנה לכאן אחרי תשלום שעבר (refURL_success).

export const dynamic = 'force-dynamic'

export default function PaymentSuccessPage() {
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
            background: 'var(--crm-success-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 44,
            color: 'var(--crm-success)',
          }}
        >
          ✓
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 12px', color: 'var(--crm-primary)' }}>
          התשלום התקבל בהצלחה! 🎉
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--crm-text)', margin: '0 0 8px' }}>
          תודה רבה! קיבלנו את התשלום שלך.
          <br />
          אישור נשלח אליך גם במייל.
        </p>
        <p style={{ fontSize: 15, color: 'var(--crm-text-muted)', margin: '24px 0 0' }}>
          יש שאלה? אנחנו כאן 💛
          <br />
          <strong style={{ color: 'var(--crm-primary)' }}>Kids &amp; Fun</strong>
        </p>
      </div>
    </main>
  )
}
