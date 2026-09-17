// ─── "קול הבוט" — הפרסונה והטון של תשובות ה-LLM ───────────────────────────────
// הלקוח מגדיר את קול הבוט במסך "הגדרות → קול הבוט". הערכים נשמרים בטבלת `settings`
// (מפתחות bot_*). הם מוזרקים ל-system prompt של ה-LLM (llm-fallback + media-handler).
//
// ⚠️ עיקרון קריטי: כל עוד הלקוח לא מילא כלום — buildVoicePromptBlock מחזיר '' והפרומפט
//    זהה *בדיוק* להיום. כך אנחנו לא נוגעים בטון עד שהלקוח מחליט על פרסונה.
import { getAllSettings } from './settings-db'

// המפתחות שהמסך עורך (הכל טקסט חופשי; ריק = לא מוגדר).
export const BOT_VOICE_KEYS = [
  'bot_persona_name',   // שם הפרסונה, למשל "ג'וני" (ברירת מחדל: אין — "העוזר/ת")
  'bot_gender',         // male | female | neutral (ריק = כמו היום, נקבה)
  'bot_formality',      // תיאור חופשי: "חמה ולא רשמית" / "רשמית ומקצועית"
  'bot_emoji_level',    // none | low | high
  'bot_greeting',       // משפט פתיחה מועדף
  'bot_signoff',        // משפט סיום מועדף
  'bot_phrases_use',    // ביטויים כדאי להשתמש (שורה לכל אחד / מופרד בפסיקים)
  'bot_phrases_avoid',  // ביטויים להימנע מהם
  'bot_forbidden_words',// מילים אסורות לחלוטין (למשל "בוט")
  'bot_sample_answers', // 2-3 דוגמאות תשובה בקול הרצוי (few-shot)
] as const

export type BotVoiceKey = (typeof BOT_VOICE_KEYS)[number]
export type BotGender = 'male' | 'female' | 'neutral'

export interface BotVoice {
  personaName:    string
  gender:         BotGender | ''
  formality:      string
  emojiLevel:     '' | 'none' | 'low' | 'high'
  greeting:       string
  signoff:        string
  phrasesUse:     string
  phrasesAvoid:   string
  forbiddenWords: string
  sampleAnswers:  string
}

export const EMPTY_VOICE: BotVoice = {
  personaName: '', gender: '', formality: '', emojiLevel: '',
  greeting: '', signoff: '', phrasesUse: '', phrasesAvoid: '',
  forbiddenWords: '', sampleAnswers: '',
}

// קריאת הקול מ-settings (או ממפה שכבר נטענה). כשל → EMPTY_VOICE (פרומפט לא משתנה).
export async function getBotVoice(settings?: Record<string, string>): Promise<BotVoice> {
  try {
    const s = settings || (await getAllSettings())
    const t = (k: BotVoiceKey) => (s[k] || '').trim()
    const gender = t('bot_gender')
    const emoji  = t('bot_emoji_level')
    return {
      personaName:    t('bot_persona_name'),
      gender:         (gender === 'male' || gender === 'female' || gender === 'neutral') ? gender : '',
      formality:      t('bot_formality'),
      emojiLevel:     (emoji === 'none' || emoji === 'low' || emoji === 'high') ? emoji : '',
      greeting:       t('bot_greeting'),
      signoff:        t('bot_signoff'),
      phrasesUse:     t('bot_phrases_use'),
      phrasesAvoid:   t('bot_phrases_avoid'),
      forbiddenWords: t('bot_forbidden_words'),
      sampleAnswers:  t('bot_sample_answers'),
    }
  } catch {
    return EMPTY_VOICE
  }
}

// האם הוגדר משהו בכלל? (אם לא — לא מזריקים כלום ל-prompt.)
export function isVoiceConfigured(v: BotVoice): boolean {
  return Boolean(
    v.personaName || v.gender || v.formality || v.emojiLevel ||
    v.greeting || v.signoff || v.phrasesUse || v.phrasesAvoid ||
    v.forbiddenWords || v.sampleAnswers,
  )
}

const GENDER_GUIDE: Record<BotGender, string> = {
  female:  'פְּני אל ההורה וְדַבְּרי על עצמך בלשון נקבה ("אני שמחה לעזור", "אעביר לקורלי").',
  male:    'פְּנֵה אל ההורה וְדַבֵּר על עצמך בלשון זכר ("אני שמח לעזור", "אעביר לקורלי").',
  neutral: 'נַסֵּח בצורה ניטרלית מגדרית ככל האפשר, בלי לשון זכר/נקבה מובהקת כלפי עצמך.',
}

const EMOJI_GUIDE: Record<'none' | 'low' | 'high', string> = {
  none: 'אל תשתמש/י באמוג\'ים כלל.',
  low:  'אמוג\'י אחד לכל היותר בתשובה, ורק כשמתאים.',
  high: 'אפשר 2-3 אמוג\'ים חמים בתשובה.',
}

// בונה את בלוק "קול הבוט" ל-system prompt. ריק לגמרי → '' (הפרומפט לא משתנה).
export function buildVoicePromptBlock(v: BotVoice): string {
  if (!isVoiceConfigured(v)) return ''

  const lines: string[] = ['== קול הבוט (הגדרת הלקוח — גובר על הנחיות הטון הכלליות) ==']

  if (v.personaName) lines.push(`• שמך: "${v.personaName}". הצג/י את עצמך כך אם צריך.`)
  if (v.gender)      lines.push(`• מגדר: ${GENDER_GUIDE[v.gender]}`)
  if (v.formality)   lines.push(`• רמת רשמיות/טון: ${v.formality}`)
  if (v.emojiLevel)  lines.push(`• אמוג'ים: ${EMOJI_GUIDE[v.emojiLevel]}`)
  if (v.greeting)    lines.push(`• פתיחה מועדפת (כשמתאים): "${v.greeting}"`)
  if (v.signoff)     lines.push(`• סיום מועדף (כשמתאים): "${v.signoff}"`)
  if (v.phrasesUse)  lines.push(`• ביטויים שכדאי להשתמש בהם: ${v.phrasesUse.replace(/\n/g, ' · ')}`)
  if (v.phrasesAvoid)lines.push(`• ביטויים להימנע מהם: ${v.phrasesAvoid.replace(/\n/g, ' · ')}`)
  if (v.forbiddenWords) lines.push(`• מילים אסורות לחלוטין (אל תשתמש/י בהן לעולם): ${v.forbiddenWords.replace(/\n/g, ' · ')}`)
  if (v.sampleAnswers) lines.push(`\nדוגמאות לתשובות בקול הרצוי (חקה את הסגנון, לא את התוכן):\n${v.sampleAnswers}`)

  lines.push('\n⚠️ הקול הזה משנה רק *ניסוח וטון*. הוא לא גובר על כללי הבטיחות, איסור המצאת נתונים, איסור איסוף אשראי, או ההנחיות לגבי הפניה לקורלי.')

  return '\n\n' + lines.join('\n')
}
