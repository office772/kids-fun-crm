import { NextRequest, NextResponse } from 'next/server'
import { checkCapacity, AREAS } from '@/lib/bot/registration-helpers'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const areaCode = searchParams.get('area')

  if (!areaCode || !AREAS[areaCode]) {
    return NextResponse.json(
      { error: 'אזור לא תקין', validAreas: Object.keys(AREAS) },
      { status: 400 }
    )
  }

  const capacity = await checkCapacity(areaCode)
  return NextResponse.json(capacity)
}
