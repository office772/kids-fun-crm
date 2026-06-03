import { NextRequest, NextResponse } from 'next/server'
import { isDemoMode, DEMO_PARENTS } from '@/lib/demo-data'
import { Parent } from '@/lib/types'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, phone, email, childName, childClass, framework, paymentStatus, paymentAmount, notes } = body

  if (isDemoMode()) {
    // במצב demo — מוסיפים לזיכרון בלבד
    const newParent: Parent = {
      id: `demo_${Date.now()}`,
      phone: phone.replace(/\D/g, '').replace(/^0/, '972'),
      name,
      email: email || undefined,
      notes: notes || undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      children: childName ? [{
        id: `child_${Date.now()}`,
        parent_id: `demo_${Date.now()}`,
        name: childName,
        class_name: childClass || undefined,
        framework: framework || undefined,
        created_at: new Date().toISOString(),
      }] : [],
      payments: paymentStatus ? [{
        id: `pay_${Date.now()}`,
        parent_id: `demo_${Date.now()}`,
        amount: paymentAmount ? parseFloat(paymentAmount) : undefined,
        currency: 'ILS',
        status: paymentStatus,
        proactive_sent: false,
        last_checked: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }] : [],
      tasks: [],
      conversations: [],
    }
    DEMO_PARENTS.unshift(newParent)
    return NextResponse.json(newParent)
  }

  // מצב אמיתי — Supabase
  const { createServiceClient } = await import("@/lib/supabase/server")
  const supabase = createServiceClient()

  const cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '972')

  const { data: parent, error: parentError } = await supabase
    .from('parents')
    .insert({ name, phone: cleanPhone, email: email || null, notes: notes || null })
    .select()
    .single()

  if (parentError) return NextResponse.json({ error: parentError.message }, { status: 500 })

  if (childName) {
    await supabase.from('children').insert({
      parent_id: parent.id,
      name: childName,
      class_name: childClass || null,
      framework: framework || null,
    })
  }

  if (paymentStatus) {
    await supabase.from('payments').insert({
      parent_id: parent.id,
      amount: paymentAmount ? parseFloat(paymentAmount) : null,
      status: paymentStatus,
    })
  }

  return NextResponse.json(parent)
}
