import { NextRequest, NextResponse } from 'next/server'
import { processMessage } from '@/lib/bot/handler'
import { BotSession } from '@/lib/types'

// Sessions in-memory לסימולטור
const simulatorSessions = new Map<string, BotSession>()

export async function POST(req: NextRequest) {
  try {
    const { message, sessionId, parentName, reset } = await req.json()

    if (!message || !sessionId) {
      return NextResponse.json({ error: 'Missing message or sessionId' }, { status: 400 })
    }

    if (reset) {
      simulatorSessions.delete(sessionId)
    }

    const session: BotSession = simulatorSessions.get(sessionId) || {
      sessionId,
      phone: 'simulator',
      parentName: parentName || 'הורה לדוגמה',
      messages: [],
      collectedData: {}
    }

    const response = processMessage(session, message)

    // עדכון session
    if (response.nextFlow) {
      session.currentFlow = response.nextFlow
    } else if (response.isComplete) {
      session.currentFlow = undefined
    }
    simulatorSessions.set(sessionId, session)

    return NextResponse.json({
      reply: response.text,
      intent: response.intent,
      escalate: response.escalate || false,
      createTask: response.createTask || null,
      currentFlow: session.currentFlow || null
    })

  } catch (error) {
    console.error('Simulator error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
