// ─── חיפוש ב-FAQ לפני LLM fallback ─────────────────────────────────────────
// כשהבוט לא מזהה כוונה, מחפש קודם תשובה ב-FAQ לפי מילים משותפות.
// אם נמצא התאמה טובה (סף 2+ מילים) — מחזיר את התשובה.
// אחרת — מחזיר null וה-LLM יטפל.
// ──────────────────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'את', 'אם', 'גם', 'כי', 'או', 'של', 'על', 'מה', 'איך', 'מתי', 'איפה', 'למה',
  'יש', 'אין', 'זה', 'זאת', 'הוא', 'היא', 'אני', 'אנחנו', 'אתם', 'אתן',
  'אנחנו', 'הם', 'הן', 'לא', 'כן', 'אבל', 'גם', 'רק', 'כל', 'אז',
  'היי', 'שלום', 'בוקר', 'ערב', 'תודה',
])

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[?!,.;:"'״׳()\[\]]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2 && !STOPWORDS.has(w))
}

interface FAQRow {
  id:       string
  question: string
  answer:   string
  keywords: string | null
}

interface MatchScore { row: FAQRow; score: number; matched: string[] }

export async function findFaqAnswer(userMessage: string): Promise<string | null> {
  if (!userMessage || userMessage.length < 3) return null

  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const { data: faqs } = await supabase
      .from('faqs').select('id, question, answer, keywords').eq('is_active', true)

    if (!faqs?.length) return null

    const userWords = tokenize(userMessage)
    if (userWords.length === 0) return null

    let best: MatchScore | null = null

    for (const faq of (faqs as FAQRow[])) {
      const faqText  = [faq.question, faq.keywords ?? ''].join(' ')
      const faqWords = new Set(tokenize(faqText))
      const matched  = userWords.filter(w => faqWords.has(w))
      // ניקוד: התאמת מילים + בונוס אם זו מילה ארוכה (פחות סיכוי להיות תפלה)
      const score = matched.reduce((s, w) => s + (w.length >= 4 ? 1.5 : 1), 0)
      if (!best || score > best.score) best = { row: faq, score, matched }
    }

    // ── סף מחמיר — למנוע תשובות FAQ לא-רלוונטיות (משוב קורלי 2026-07) ──────────
    // הבעיה הקודמת: 2 מילים קצרות משותפות החזירו תשובה שמורה לא-קשורה כמעט לכל
    // הודעה. עכשיו דורשים התאמה *ספֶּציפית*: מילות-תוכן ארוכות, לא מילים תפלות.
    if (best) {
      const strong = best.matched.filter(w => w.length >= 4)          // מילות תוכן
      const verySpecific = best.matched.some(w => w.length >= 6)      // מילה ייחודית מאוד
      const confident =
        verySpecific ||
        strong.length >= 2 ||
        (strong.length >= 1 && best.matched.length >= 3)
      if (confident && best.score >= 3) {
        console.log(`[FAQ search] match (score=${best.score}, matched=${best.matched.join(',')}) → ${best.row.question}`)
        return best.row.answer
      }
    }
    return null
  } catch (err) {
    console.error('[FAQ search] error:', err)
    return null
  }
}

// ─── חיפוש FAQ לפי "עוגן" נושא ─────────────────────────────────────────────
// מחזיר את תשובת ה-FAQ הראשון הפעיל שהשאלה/מילות-המפתח שלו מכילות אחת
// ממילות העוגן. משמש לכוונות מוגדרות (כמו שאלת_לו"ז) כדי שגם ניסוח קצר
// כמו "שעות" / "חגים" / הספרה "4" יחזיר תמיד את ה-FAQ הנכון — ללא תלות
// בסף ההתאמה המעורפל של findFaqAnswer.
export async function findFaqByTopic(anchors: string[]): Promise<string | null> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const supabase = createServiceClient()
    const { data: faqs } = await supabase
      .from('faqs').select('question, answer, keywords').eq('is_active', true)

    if (!faqs?.length) return null

    const needles = anchors.map(a => a.toLowerCase())
    for (const faq of (faqs as FAQRow[])) {
      const hay = [faq.question, faq.keywords ?? ''].join(' ').toLowerCase()
      if (needles.some(n => hay.includes(n))) return faq.answer
    }
    return null
  } catch (err) {
    console.error('[FAQ topic] error:', err)
    return null
  }
}
