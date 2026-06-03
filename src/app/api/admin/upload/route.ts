import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const BUCKET = 'bot-assets'
const MAX_MB = 20

export async function POST(req: NextRequest) {
  try {
    const formData  = await req.formData()
    const file      = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'לא נשלח קובץ' }, { status: 400 })

    // גודל מקסימלי
    if (file.size > MAX_MB * 1024 * 1024) {
      return NextResponse.json({ error: `הקובץ גדול מ-${MAX_MB}MB` }, { status: 400 })
    }

    // שם ייחודי
    const ext      = file.name.split('.').pop() ?? 'bin'
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const supabase = createServiceClient()
    const buffer   = Buffer.from(await file.arrayBuffer())

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(filename, buffer, {
        contentType: file.type,
        upsert:      false,
      })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filename)

    return NextResponse.json({ url: publicUrl, filename })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'שגיאה'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
