// ─── עמוד צפייה בשיחה — יעד כפתור "צפייה בשיחה" בתבנית escalation_to_corli ────
// קורלי מקבלת בוואטסאפ הודעת הסלמה עם כפתור → הכפתור מוביל לכאן: /c/<parent_id>
// מציג את פרטי ההורה + ההתכתבות האחרונה שלו עם הבוט, בעברית RTL, ידידותי למובייל.

import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface ConversationRow {
  direction:    string
  message_text: string
  created_at:   string
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default async function ConversationPage({ params }: { params: { id: string } }) {
  const supabase = createServiceClient()

  const { data: parent } = await supabase
    .from('parents').select('id, name, phone').eq('id', params.id).maybeSingle()

  const { data: rows } = parent
    ? await supabase
        .from('conversations')
        .select('direction, message_text, created_at')
        .eq('parent_id', parent.id)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: null }

  // מציגים בסדר כרונולוגי (הישן למעלה)
  const messages = ((rows ?? []) as ConversationRow[]).reverse()

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: 'var(--crm-bg, #FDF8F0)', fontFamily: 'inherit' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 12px 40px' }}>

        <div style={{ background: 'var(--crm-primary, #6D436D)', color: '#fff', borderRadius: 16, padding: '14px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>💬 שיחה עם {parent?.name || 'הורה לא מזוהה'}</div>
          {parent?.phone && (
            <div style={{ fontSize: 14, opacity: 0.85, marginTop: 2 }}>
              <a href={`https://wa.me/${parent.phone.replace(/\D/g, '')}`} style={{ color: '#FAD980', textDecoration: 'none' }}>
                {parent.phone} — פתיחת וואטסאפ ↗
              </a>
            </div>
          )}
        </div>

        {!parent && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, textAlign: 'center', color: '#5E4B35' }}>
            לא נמצא הורה עם המזהה הזה. ייתכן שהרשומה נמחקה.
          </div>
        )}

        {parent && messages.length === 0 && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, textAlign: 'center', color: '#5E4B35' }}>
            אין עדיין הודעות שמורות לשיחה הזו.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.map((m, i) => {
            const incoming = m.direction === 'נכנס'
            return (
              <div key={i} style={{ display: 'flex', justifyContent: incoming ? 'flex-start' : 'flex-end' }}>
                <div style={{
                  maxWidth: '82%',
                  background: incoming ? '#FFFFFF' : '#E7F6E7',
                  border: '1px solid rgba(0,0,0,0.06)',
                  borderRadius: 14,
                  padding: '9px 13px',
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: '#3d2f22',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  <div style={{ fontSize: 11, color: '#96897a', marginBottom: 3 }}>
                    {incoming ? '👤 ההורה' : '🤖 הבוט'} · {formatTime(m.created_at)}
                  </div>
                  {m.message_text}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ textAlign: 'center', marginTop: 22 }}>
          <Link href="/dashboard" style={{
            display: 'inline-block', background: 'var(--crm-action, #FAD980)', color: '#7B6010',
            borderRadius: 12, padding: '10px 22px', fontWeight: 600, fontSize: 15, textDecoration: 'none',
          }}>
            למעבר לדשבורד המלא ←
          </Link>
        </div>

      </div>
    </div>
  )
}
