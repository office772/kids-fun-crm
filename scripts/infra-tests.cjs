/**
 * infra-tests.cjs - בדיקות תשתית מבודדות (astra, פאזה 0).
 *
 * מריץ את הקוד האמיתי (handler / webhook / simulator) מול Supabase *מדומה בזיכרון*,
 * בלי רשת ובלי מפתחות אמיתיים. משחזר את ממצאי התשתית (3, 9-14) ומאמת את התיקונים.
 * הסימולטור החי אינו sandbox (ממצא #9) - לכן הבדיקות כאן, ולא דרכו.
 *
 *   הרצה:  node scripts/infra-tests.cjs
 *
 * מנגנון: require-hook שממפה @/ ל-src ומתרגם .ts בזמן ריצה; global.fetch חסום;
 * dbFor() הוא Proxy שממפה כל שרשרת .from(table).select/insert/update/...().then()
 * לפונקציית execute שמחזירה {data, error} - כך אפשר לזייף הצלחה/כשל לכל טבלה.
 */
const fs = require('fs')
const path = require('path')
const Module = require('module')
const ROOT = path.resolve(__dirname, '..')
const ts = require(path.join(ROOT, 'node_modules/typescript'))

// ── require-hook: @/ → src, ותרגום .ts/.tsx בזמן ריצה ─────────────────────────
const origResolve = Module._resolveFilename
Module._resolveFilename = function (req, parent, ...rest) {
  if (req.startsWith('@/')) req = path.join(ROOT, 'src', req.slice(2))
  return origResolve.call(this, req, parent, ...rest)
}
require.extensions['.ts'] = function (m, file) {
  let src = fs.readFileSync(file, 'utf8')
  // חשיפת פונקציות פנימיות של ה-webhook לבדיקה מבודדת (כמו ב-harness של astra)
  if (file.replace(/\\/g, '/').endsWith('/webhooks/manychat/route.ts')) {
    src += '\nexport { applyResult, loadSession, saveSession, logConversation, createTask };'
  }
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  m._compile(out, file)
}
require.extensions['.tsx'] = require.extensions['.ts']

// ── mock ל-@vercel/functions (waitUntil אוסף promises של רקע להמתנה בבדיקה) ────
const background = []
const priorLoad = Module._load
Module._load = function (id, ...args) {
  if (id === '@vercel/functions') return { waitUntil: (p) => { background.push(p); return p } }
  return priorLoad.call(this, id, ...args)
}

// ── חסימת רשת (שום קריאה חיצונית מותרת) ──────────────────────────────────────
global.fetch = async () => { throw new Error('NETWORK_BLOCKED_IN_TEST') }

// ── Supabase מדומה: Proxy → execute({table, op, payload, fields, filters}) ────
function dbFor(execute) {
  return {
    from(table) {
      let op = 'select', payload, fields = '', filters = []
      const q = new Proxy({}, {
        get(_, k) {
          if (k === 'then') return (res, rej) =>
            Promise.resolve().then(() => execute({ table, op, payload, fields, filters })).then(res, rej)
          return (...args) => {
            if (['insert', 'update', 'upsert', 'delete'].includes(k)) { op = k; payload = args[0] }
            else if (k === 'select') fields = args[0]
            else filters.push([k, ...args])
            return q
          }
        },
      })
      return q
    },
  }
}

let passed = 0, failed = 0
function check(name, ok, detail) {
  if (ok) { passed++; console.log('✅ ' + name) }
  else { failed++; console.log('❌ ' + name + '\n   ' + (detail || '')) }
}

const dbmod = require(path.join(ROOT, 'src/lib/supabase/server.ts'))
const handler = require(path.join(ROOT, 'src/lib/bot/handler.ts'))
const realProcess = handler.processMessage   // לשחזור אחרי בדיקות שמזייפות אותו
const request = (body) => ({ headers: { get: () => null }, json: async () => body })

;(async () => {
  // ═══ 1.2 (#3) — כשל כתיבת ביטול: אין "בוצע", אין סליקה, אין timeline ═══════════
  {
    const payplus = require(path.join(ROOT, 'src/lib/payplus-api.ts'))
    let payplusCalled = false
    payplus.isPayPlusApiConfigured = () => true
    payplus.cancelRecurringPayment = async () => { payplusCalled = true; return { success: true } }

    let timelineInserts = 0
    dbmod.createServiceClient = () => dbFor(q => {
      if (q.table === 'parents' && q.op === 'select' && q.fields === 'id') return { data: { id: 'p1' }, error: null }
      if (q.table === 'parents' && q.op === 'select') return { data: { payplus_recurring_uid: 'uid1', payplus_recurring_status: 'active' }, error: null }
      if (q.table === 'children' && q.op === 'select') return { data: [{ id: 'c1', name: 'נועם בדיקה', parent_id: 'p1' }], error: null }
      if (q.table === 'registrations' && q.op === 'select') return { data: { id: 'r1', status: 'מאושר', notes: '' }, error: null }
      if (q.table === 'registrations' && q.op === 'update') return { data: null, error: { message: 'simulated write failure' } }
      if (q.table === 'registration_timeline' && q.op === 'insert') { timelineInserts++; return { data: null, error: null } }
      return { data: null, error: null }
    })

    const session = {
      sessionId: 't', phone: '+972500000000', parentName: 'הורה בדיקה',
      messages: [], currentFlow: 'cancel_confirm_after15', collectedData: { child_name: 'נועם בדיקה' },
    }
    const r = await handler.processMessage(session, 'כן')
    check('1.2 (#3) — כשל כתיבה: אין הודעת "הביטול בוצע"', !/הביטול בוצע/.test(r.text), `text=${JSON.stringify(r.text.slice(0, 90))}`)
    check('1.2 (#3) — כשל כתיבה: לא נקראה סליקת PayPlus', payplusCalled === false, `payplusCalled=${payplusCalled}`)
    check('1.2 (#3) — כשל כתיבה: לא נכתב timeline "בוטל"', timelineInserts === 0, `timelineInserts=${timelineInserts}`)
  }

  // ═══ 2.3 (#11) — notifyStaff: שגיאת ספק (200 + status:error) = כשל, לא הצלחה ════
  {
    process.env.UCHAT_API_TOKEN = 'test-token'
    process.env.UCHAT_STAFF_USER_NS = 'admin-test'
    const fetchCalls = []
    global.fetch = async (url, opts) => {
      fetchCalls.push({ url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : null })
      return { ok: true, status: 200, json: async () => ({ status: 'error', message: 'window closed' }), text: async () => JSON.stringify({ status: 'error', message: 'window closed' }) }
    }
    dbmod.createServiceClient = () => dbFor(q => {
      if (q.table === 'frameworks') return { data: [{ id: 'f1', name: 'מסגרת בדיקה', staff: [{ name: 'מדריכה', phone: '+972500000001', role: 'מדריכה', is_active: true }] }], error: null }
      return { data: null, error: null }   // getUserNsByPhone → null
    })
    const notify = require(path.join(ROOT, 'src/lib/notify.ts'))
    const ok = await notify.notifyStaff({ text: 'בדיקת איסוף', priority: 'גבוה', framework: { area_code: 'carmel', school: 'מסגרת בדיקה' } })
    const sendTextCall = fetchCalls.find(c => c.url.includes('/subscriber/send-text'))
    check('2.3 (#11) — שגיאת ספק בגוף → notifyStaff מחזיר false', ok === false, `ok=${ok}`)
    check('2.3 (#11) — נעשתה שליחה בפועל דרך send-text', !!sendTextCall, `urls=${fetchCalls.map(c => c.url).join(',')}`)
    check('2.3 (#11) — הגוף משתמש בשדה content (לא text)',
      !!sendTextCall && sendTextCall.body && ('content' in sendTextCall.body) && !('text' in sendTextCall.body),
      `body=${JSON.stringify(sendTextCall && sendTextCall.body)}`)
    global.fetch = async () => { throw new Error('NETWORK_BLOCKED_IN_TEST') }
  }

  // ═══ 2.2 (#10) — איסוף: ניתוב מסגרת רק לילד של ההורה המזוהה (לא גלובלי) ════════
  {
    const route = require(path.join(ROOT, 'src/app/api/webhooks/manychat/route.ts'))
    const notify = require(path.join(ROOT, 'src/lib/notify.ts'))
    const notifications = []
    notify.notifyStaff = async (n) => { notifications.push(n); return false }
    notify.sendCorliEscalationTemplate = async () => false
    require(path.join(ROOT, 'src/lib/email.ts')).sendAdminAlert = async () => false
    const childLookups = []
    dbmod.createServiceClient = () => dbFor(q => {
      if (q.table === 'children' && q.op === 'select') {
        childLookups.push(q.filters)
        const hasParentFilter = q.filters.some(x => x[0] === 'eq' && x[1] === 'parent_id')
        // חיפוש גלובלי (בלי parent) "מוצא" ילד של משפחה אחרת; מסונן לפי הורה - לא מוצא
        return { data: hasParentFilter ? [] : { area_code: 'telaviv', school: 'משפחה אחרת', framework: 'צהרון' }, error: null }
      }
      return { data: null, error: null }
    })
    const pickupResult = {
      text: 'בקשת האיסוף התקבלה', isComplete: true, intent: 'איסוף_מוקדם',
      createTask: { type: 'איסוף מוקדם', description: 'איסוף מוקדם — נועם בדיקה', priority: 'גבוה' },
      notifyFramework: { byChildName: 'נועם בדיקה' },
    }
    const session = { sessionId: 'p', phone: '+972500000009', collectedData: {}, messages: [] }
    await route.applyResult(dbmod.createServiceClient(), session, { id: 'unknown-parent', name: 'הורה בדיקה' }, session.phone, pickupResult)
    const filteredByParent = childLookups.some(f => f.some(x => x[0] === 'eq' && x[1] === 'parent_id'))
    const notifiedFramework = notifications.some(n => n.framework)
    check('2.2 (#10) — חיפוש הילד מסונן לפי parent_id (לא גלובלי)', filteredByParent, `lookups=${JSON.stringify(childLookups)}`)
    check('2.2 (#10) — ילד שאינו של ההורה → אין ניתוב אוטומטי למסגרת', !notifiedFramework, `frameworks=${JSON.stringify(notifications.map(n => n.framework))}`)
  }

  // ── mocks משותפים לבדיקות ה-webhook ──────────────────────────────────────────
  const route = require(path.join(ROOT, 'src/app/api/webhooks/manychat/route.ts'))
  const uchat = require(path.join(ROOT, 'src/lib/uchat.ts'))
  require(path.join(ROOT, 'src/lib/bot/test-phones-db.ts')).isAllowedPhoneAsync = async () => true
  require(path.join(ROOT, 'src/lib/bot/settings-db.ts')).primeSettingsCache = async () => ({})
  require(path.join(ROOT, 'src/lib/bot/schools-db.ts')).primeSchoolsCache = async () => ({})
  require(path.join(ROOT, 'src/lib/bot/bot-messages-db.ts')).primeBotMessagesCache = async () => ({})

  // ═══ 2.6 (#14) — כשל שמירת session: לא שולחים את השאלה הבאה כאילו נשמרה ════════
  {
    handler.processMessage = async () => ({ text: 'מה שם הילד?', intent: 'רישום_צהרון', nextFlow: 'register_child_name' })
    dbmod.createServiceClient = () => dbFor(q => {
      if (q.table === 'parents' && q.op === 'select') return { data: [{ id: 'p1', name: 'הורה בדיקה' }], error: null }
      if (q.table === 'bot_sessions' && q.op === 'upsert') return { data: null, error: { message: 'simulated session save error' } }
      return { data: [], error: null }
    })
    const res = await route.POST(request({ phone: '+972500000000', message: '2', message_id: 'save-fail-1' }))
    const json = await res.json()
    check('2.6 (#14) — כשל שמירה: התשובה אינה השאלה הבאה', json.reply !== 'מה שם הילד?', `reply=${JSON.stringify(json.reply)}`)
    check('2.6 (#14) — כשל שמירה: מסומן saveError', json.saveError === true, `json=${JSON.stringify(json)}`)
  }

  // ═══ 2.5 (#13) — dedup אטומי: שתי בקשות מקבילות עם אותו מזהה → עיבוד אחד ═══════
  {
    let handlerCalls = 0
    handler.processMessage = async () => { handlerCalls++; return { text: 'שלום!', intent: 'שאלה_כללית', isComplete: true } }
    const ids = new Set()
    dbmod.createServiceClient = () => dbFor(q => {
      if (q.table === 'parents' && q.op === 'select') return { data: [{ id: 'p1', name: 'הורה' }], error: null }
      if (q.table === 'conversations' && q.op === 'insert' && q.payload && q.payload.id_message) {
        if (ids.has(q.payload.id_message)) return { data: null, error: { code: '23505' } }
        ids.add(q.payload.id_message); return { data: null, error: null }
      }
      return { data: [], error: null }
    })
    const replies = await Promise.all([1, 2].map(() =>
      route.POST(request({ phone: '+972500000000', message: 'שלום', message_id: 'dup-1' })).then(r => r.json())))
    const duplicates = replies.filter(r => r.duplicate).length
    check('2.5 (#13) — עיבוד אחד בלבד לשתי בקשות מקבילות', handlerCalls === 1, `handlerCalls=${handlerCalls}`)
    check('2.5 (#13) — בקשה כפולה אחת נחסמה (duplicate)', duplicates === 1, `replies=${JSON.stringify(replies)}`)
  }

  // ═══ 2.4 (#12) — תשובה איטית לא דורסת מסלול חדש ולא נשלחת ═════════════════════
  {
    let stored = { phone: '+972500000000', current_flow: 'register_child_name', collected_data: { area_code: 'sharon' }, last_message_at: '2026-09-21T10:00:00.000Z', expires_at: new Date(Date.now() + 60000).toISOString() }
    let releaseSlow
    const gate = new Promise(r => (releaseSlow = r))
    const sentTexts = []
    uchat.getUserNsByPhone = async () => 'test-ns'
    uchat.sendText = async (ns, text) => { sentTexts.push(text); return true }
    dbmod.createServiceClient = () => dbFor(q => {
      if (q.table === 'parents' && q.op === 'select') return { data: [{ id: 'p1', name: 'הורה' }], error: null }
      if (q.table === 'bot_sessions' && q.op === 'select') return { data: stored ? JSON.parse(JSON.stringify(stored)) : null, error: null }
      if (q.table === 'bot_sessions' && q.op === 'upsert') { stored = { ...q.payload }; return { data: [{ phone: q.payload.phone }], error: null } }
      if (q.table === 'bot_sessions' && q.op === 'update') {
        const revF = q.filters.find(f => f[0] === 'eq' && f[1] === 'last_message_at')
        if (stored && revF && stored.last_message_at === revF[2]) { stored = { ...q.payload, phone: stored.phone }; return { data: [{ phone: stored.phone }], error: null } }
        return { data: [], error: null }   // stale — אין שורה
      }
      return { data: [], error: null }
    })
    process.env.LLM_DEFER_TIMEOUT_MS = '10'
    handler.processMessage = async (s, msg) => {
      if (msg === 'כמה זה עולה?') { await gate; return { text: 'המחיר תלוי במסגרת', intent: 'בדיקת_תשלום', nextFlow: 'register_child_name' } }
      return { text: 'מה שם הילד לביטול?', intent: 'ביטול', nextFlow: 'cancel_child' }
    }
    const bgBefore = background.length
    await route.POST(request({ phone: '+972500000000', message: 'כמה זה עולה?', user_ns: 'test-ns', message_id: 'old' }))
    await route.POST(request({ phone: '+972500000000', message: 'אני רוצה לבטל', user_ns: 'test-ns', message_id: 'new' }))
    releaseSlow()
    await Promise.all(background.slice(bgBefore))
    check('2.4 (#12) — המסלול נשאר cancel_child (תוצאה ישנה לא דרסה)', stored.current_flow === 'cancel_child', `flow=${stored.current_flow}`)
    check('2.4 (#12) — התשובה הישנה (מחיר) לא נשלחה להורה', !sentTexts.some(t => /המחיר/.test(t)), `sent=${JSON.stringify(sentTexts)}`)
  }

  // ═══ 2.1 (#9) — הסימולטור אינו מבצע ביטול/כתיבה אמיתיים ═══════════════════════
  {
    handler.processMessage = realProcess   // הסימולטור קורא ל-processMessage האמיתי
    const simulator = require(path.join(ROOT, 'src/app/api/bot/simulate/route.ts'))
    const writes = []
    dbmod.createServiceClient = () => dbFor(q => {
      if (q.op !== 'select') writes.push({ table: q.table, op: q.op })
      if (q.table === 'parents' && q.op === 'select') return { data: q.fields === 'id' ? { id: 'p1' } : { payplus_recurring_uid: null }, error: null }
      if (q.table === 'children' && q.op === 'select') return { data: [{ id: 'c1', name: 'נועם בדיקה', parent_id: 'p1' }], error: null }
      if (q.table === 'registrations' && q.op === 'select') return { data: { id: 'r1', status: 'מאושר', notes: '' }, error: null }
      return { data: null, error: null }
    })
    const res = await simulator.POST(request({ sessionId: 'sim-1', testPhone: '+972500000000', message: 'כן', clientState: { currentFlow: 'cancel_confirm_after15', collectedData: { child_name: 'נועם בדיקה' } } }))
    await res.json()
    check('2.1 (#9) — סימולטור: אין UPDATE אמיתי ל-registrations', !writes.some(w => w.table === 'registrations' && w.op === 'update'), `writes=${JSON.stringify(writes)}`)
    check('2.1 (#9) — סימולטור: אין כתיבת timeline אמיתית', !writes.some(w => w.table === 'registration_timeline'), `writes=${JSON.stringify(writes)}`)
  }

  // ═══ R1 (#9) — סימולטור: sandbox חוסם *כל* כתיבה (גם children.update, לא רק ביטול) ══
  {
    const { sandboxWrites } = require(path.join(ROOT, 'src/lib/supabase/server.ts'))
    const { isSimulated } = require(path.join(ROOT, 'src/lib/supabase/sim-context.ts'))
    handler.processMessage = realProcess
    const simulator = require(path.join(ROOT, 'src/app/api/bot/simulate/route.ts'))
    const writes = []
    dbmod.createServiceClient = () => {
      const base = dbFor(q => { if (q.op !== 'select') writes.push({ table: q.table, op: q.op }); return { data: null, error: null } })
      return isSimulated() ? sandboxWrites(base) : base   // מחקה את createServiceClient האמיתי
    }
    const res = await simulator.POST(request({ sessionId: 'sim-r1', message: 'דני בדיקה', clientState: { currentFlow: 'register_complete_placeholder', collectedData: { placeholder_child_id: 'child-xyz' } } }))
    await res.json()
    check('R1 (#9) — סימולטור: אין UPDATE אמיתי ל-children (sandbox)', !writes.some(w => w.table === 'children' && w.op === 'update'), `writes=${JSON.stringify(writes)}`)
    check('R1 (#9) — סימולטור: אין שום כתיבה אמיתית', writes.length === 0, `writes=${JSON.stringify(writes)}`)
  }

  // ═══ R3 (#12) — תשובה ישנה שמסיימת שיחה לא מוחקת מסלול חדש (שער "הודעה חדשה יותר") ══
  {
    let stored = { phone: '+972500000000', current_flow: 'register_child_name', collected_data: {}, last_message_at: 'T0', expires_at: new Date(Date.now() + 60000).toISOString() }
    const incoming = []
    let releaseSlow; const gate = new Promise(r => (releaseSlow = r))
    const sent = []
    uchat.getUserNsByPhone = async () => 'ns'; uchat.sendText = async (n, t) => { sent.push(t); return true }
    dbmod.createServiceClient = () => dbFor(q => {
      if (q.table === 'parents' && q.op === 'select') return { data: [{ id: 'p1', name: 'הורה' }], error: null }
      if (q.table === 'conversations' && q.op === 'insert') { if (q.payload.direction === 'נכנס') incoming.push(q.payload.id_message); return { data: null, error: null } }
      if (q.table === 'conversations' && q.op === 'select') return { data: incoming.length ? [{ id_message: incoming[incoming.length - 1] }] : [], error: null }
      if (q.table === 'bot_sessions' && q.op === 'select') return { data: stored ? JSON.parse(JSON.stringify(stored)) : null, error: null }
      if (q.table === 'bot_sessions' && q.op === 'upsert') { stored = { ...q.payload }; return { data: [{ phone: q.payload.phone }], error: null } }
      if (q.table === 'bot_sessions' && q.op === 'update') { const rev = q.filters.find(f => f[0] === 'eq' && f[1] === 'last_message_at'); if (stored && rev && stored.last_message_at === rev[2]) { stored = { ...q.payload, phone: stored.phone }; return { data: [{ phone: stored.phone }], error: null } } return { data: [], error: null } }
      if (q.table === 'bot_sessions' && q.op === 'delete') { stored = null; return { data: null, error: null } }
      return { data: [], error: null }
    })
    process.env.LLM_DEFER_TIMEOUT_MS = '10'
    handler.processMessage = async (s, msg) => {
      if (msg === 'שאלה איטית') { await gate; return { text: 'תשובה ישנה', intent: 'שאלה_כללית', isComplete: true } }  // ישן: מסיים שיחה
      return { text: 'מה שם הילד לביטול?', intent: 'ביטול', nextFlow: 'cancel_child' }  // חדש: מתקדם
    }
    const bgBefore = background.length
    await route.POST(request({ phone: '+972500000000', message: 'שאלה איטית', user_ns: 'ns', message_id: 'old' }))
    await route.POST(request({ phone: '+972500000000', message: 'לבטל', user_ns: 'ns', message_id: 'new' }))
    releaseSlow(); await Promise.all(background.slice(bgBefore))
    check('R3 (#12) — תשובה ישנה שמסיימת לא מחקה מסלול חדש', !!stored && stored.current_flow === 'cancel_child', `stored=${JSON.stringify(stored)}`)
    check('R3 (#12) — התשובה הישנה לא נשלחה', !sent.some(t => /תשובה ישנה/.test(t)), `sent=${JSON.stringify(sent)}`)
  }

  // ═══ R4 (#14) — כשל שמירה בנתיב הדחוי לא שולח את התשובה ═══════════════════════
  {
    const stored = { phone: '+972500000000', current_flow: 'x', collected_data: {}, last_message_at: 'T0', expires_at: new Date(Date.now() + 60000).toISOString() }
    const incoming = []
    let releaseSlow; const gate = new Promise(r => (releaseSlow = r))
    const sent = []
    uchat.getUserNsByPhone = async () => 'ns'; uchat.sendText = async (n, t) => { sent.push(t); return true }
    dbmod.createServiceClient = () => dbFor(q => {
      if (q.table === 'parents' && q.op === 'select') return { data: [{ id: 'p1' }], error: null }
      if (q.table === 'conversations' && q.op === 'insert') { if (q.payload.direction === 'נכנס') incoming.push(q.payload.id_message); return { data: null, error: null } }
      if (q.table === 'conversations' && q.op === 'select') return { data: incoming.length ? [{ id_message: incoming[incoming.length - 1] }] : [], error: null }
      if (q.table === 'bot_sessions' && q.op === 'select') return { data: JSON.parse(JSON.stringify(stored)), error: null }
      if (q.table === 'bot_sessions' && q.op === 'update') return { data: null, error: { message: 'deferred save fail' } }
      return { data: [], error: null }
    })
    process.env.LLM_DEFER_TIMEOUT_MS = '10'
    handler.processMessage = async () => { await gate; return { text: 'מה שם הילד?', intent: 'רישום_צהרון', nextFlow: 'register_child_name' } }
    const bgBefore = background.length
    await route.POST(request({ phone: '+972500000000', message: 'איטי', user_ns: 'ns', message_id: 'only' }))
    releaseSlow(); await Promise.all(background.slice(bgBefore))
    check('R4 (#14) — כשל שמירה דחוי → התשובה לא נשלחה', !sent.some(t => /מה שם הילד/.test(t)), `sent=${JSON.stringify(sent)}`)
  }

  // ═══ R5 (#13/#14) — הודעה שנכשלה משוחררת, וניסיון חוזר לא נחסם ככפילות ═════════
  {
    const claimed = new Set()
    let failNext = true, calls = 0
    dbmod.createServiceClient = () => dbFor(q => {
      if (q.table === 'parents' && q.op === 'select') return { data: [{ id: 'p1' }], error: null }
      if (q.table === 'conversations' && q.op === 'insert' && q.payload && q.payload.id_message) {
        if (claimed.has(q.payload.id_message)) return { data: null, error: { code: '23505' } }
        claimed.add(q.payload.id_message); return { data: null, error: null }
      }
      if (q.table === 'conversations' && q.op === 'delete') { const id = q.filters.find(f => f[0] === 'eq' && f[1] === 'id_message')?.[2]; if (id) claimed.delete(id); return { data: null, error: null } }
      if (q.table === 'bot_sessions' && q.op === 'upsert') { if (failNext) { failNext = false; return { data: null, error: { message: 'save fail once' } } } return { data: [{ phone: q.payload.phone }], error: null } }
      return { data: [], error: null }
    })
    handler.processMessage = async () => { calls++; return { text: 'מה שם הילד?', intent: 'רישום_צהרון', nextFlow: 'register_child_name' } }
    const r1 = await (await route.POST(request({ phone: '+972500000000', message: '2', message_id: 'retry-1' }))).json()
    const r2 = await (await route.POST(request({ phone: '+972500000000', message: '2', message_id: 'retry-1' }))).json()
    check('R5 — ניסיון ראשון נכשל בשמירה (saveError)', r1.saveError === true, `r1=${JSON.stringify(r1)}`)
    check('R5 — ניסיון חוזר לא נחסם ככפילות (עובד שוב)', r2.duplicate !== true && calls === 2, `r2=${JSON.stringify(r2)} calls=${calls}`)
  }

  console.log(`\n────────────\nעברו: ${passed} | נכשלו: ${failed}`)
  process.exit(failed === 0 ? 0 : 1)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
