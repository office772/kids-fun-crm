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

// ── Supabase מצבי בזיכרון: bot_sessions (עם rev), whatsapp_message_log (claim),
//    conversations (היסטוריה), tasks. תואם למנגנון האמיתי (astra R3/R5). ────────────
function makeSessionDB() {
  const state = { sessions: new Map(), wml: new Map(), conv: [], tasks: [], failSave: false }
  state.client = () => dbFor(q => {
    const { table, op, payload, filters } = q
    const eqv = (k) => (filters.find(f => f[0] === 'eq' && f[1] === k) || [])[2]
    if (table === 'parents' && op === 'select') return { data: [{ id: 'p1', name: 'הורה' }], error: null }
    if (table === 'whatsapp_message_log') {
      const id = (payload && payload.id_message) || eqv('id_message')
      if (op === 'insert') { if (state.wml.has(id)) return { data: null, error: { code: '23505' } }; state.wml.set(id, { processed: false, created_at: new Date().toISOString() }); return { data: null, error: null } }
      if (op === 'select') { const e = state.wml.get(id); return { data: e ? [{ processed: e.processed, created_at: e.created_at }] : [], error: null } }
      if (op === 'update') { if (state.wml.has(id)) state.wml.get(id).processed = true; return { data: null, error: null } }
      if (op === 'delete') { state.wml.delete(id); return { data: null, error: null } }
    }
    if (table === 'bot_sessions') {
      const phone = (payload && payload.phone) || eqv('phone')
      const rev = eqv('rev')
      if (op === 'update' && !rev) {                    // loadSession bump
        const cur = state.sessions.get(phone)
        if (!cur) return { data: [], error: null }
        cur.rev = payload.rev
        return { data: [{ parent_id: cur.parent_id ?? null, current_flow: cur.current_flow ?? null, collected_data: cur.collected_data ?? {}, last_message_at: cur.last_message_at ?? new Date().toISOString(), expires_at: cur.expires_at ?? new Date(Date.now() + 60000).toISOString() }], error: null }
      }
      if (op === 'update' && rev) {                     // persistSession מותנה
        if (state.failSave) return { data: null, error: { message: 'save fail' } }
        const cur = state.sessions.get(phone)
        if (cur && cur.rev === rev) { state.sessions.set(phone, { ...payload }); return { data: [{ phone }], error: null } }
        return { data: [], error: null }                // stale
      }
      if (op === 'insert') {                            // persistSession session חדש
        if (state.failSave) return { data: null, error: { message: 'save fail' } }
        if (state.sessions.has(phone)) return { data: null, error: { code: '23505' } }
        state.sessions.set(phone, { ...payload }); return { data: null, error: null }
      }
      if (op === 'delete') {
        if (rev) { const cur = state.sessions.get(phone); if (cur && cur.rev === rev) { state.sessions.delete(phone); return { data: [{ phone }], error: null } } return { data: [], error: null } }
        state.sessions.delete(phone); return { data: null, error: null }
      }
    }
    if (table === 'conversations') { if (op === 'insert') { if (payload.direction === 'נכנס') state.conv.push(payload); return { data: null, error: null } } if (op === 'select') return { data: [], error: null } }
    if (table === 'tasks' && op === 'insert') { state.tasks.push(payload); return { data: null, error: null } }
    return { data: null, error: null }
  })
  return state
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

  // ═══ 2.6 (#14) — כשל שמירת session: retry בטוח, לא השאלה הבאה ═════════════════
  {
    const db = makeSessionDB(); db.failSave = true; dbmod.createServiceClient = db.client
    handler.processMessage = async () => ({ text: 'מה שם הילד?', intent: 'רישום_צהרון', nextFlow: 'register_child_name' })
    const json = await (await route.POST(request({ phone: '+972500000000', message: '2', message_id: 'save-fail-1' }))).json()
    check('2.6 (#14) — כשל שמירה: התשובה אינה השאלה הבאה', json.reply !== 'מה שם הילד?', `reply=${JSON.stringify(json.reply)}`)
    check('2.6 (#14) — כשל שמירה: מסומן saveError', json.saveError === true, `json=${JSON.stringify(json)}`)
  }

  // ═══ 2.5 (#13) — שתי בקשות מקבילות עם אותו מזהה → עיבוד אחד (claim) ═══════════
  {
    const db = makeSessionDB(); dbmod.createServiceClient = db.client
    let calls = 0
    handler.processMessage = async () => { calls++; return { text: 'שלום!', intent: 'שאלה_כללית', isComplete: true } }
    const replies = await Promise.all([1, 2].map(() =>
      route.POST(request({ phone: '+972500000000', message: 'שלום', message_id: 'dup-1' })).then(r => r.json())))
    check('2.5 (#13) — עיבוד אחד בלבד לשתי בקשות מקבילות', calls === 1, `calls=${calls}`)
    check('2.5 (#13) — בקשה כפולה אחת נחסמה (duplicate)', replies.filter(r => r.duplicate).length === 1, `replies=${JSON.stringify(replies)}`)
  }

  // ═══ 2.4 (#12) — תשובה איטית לא דורסת מסלול חדש ולא נשלחת (rev) ═══════════════
  {
    const PHONE = '+972500000000'
    const db = makeSessionDB()
    db.sessions.set(PHONE, { phone: PHONE, current_flow: 'register_child_name', collected_data: {}, rev: 'r0' })
    dbmod.createServiceClient = db.client
    let releaseSlow; const gate = new Promise(r => (releaseSlow = r))
    const sent = []
    uchat.getUserNsByPhone = async () => 'ns'; uchat.sendText = async (n, t) => { sent.push(t); return true }
    process.env.LLM_DEFER_TIMEOUT_MS = '10'
    handler.processMessage = async (s, msg) => {
      if (msg === 'כמה זה עולה?') { await gate; return { text: 'המחיר תלוי במסגרת', intent: 'בדיקת_תשלום', nextFlow: 'register_child_name' } }
      return { text: 'מה שם הילד לביטול?', intent: 'ביטול', nextFlow: 'cancel_child' }
    }
    const bgBefore = background.length
    await route.POST(request({ phone: PHONE, message: 'כמה זה עולה?', user_ns: 'ns', message_id: 'old' }))
    await route.POST(request({ phone: PHONE, message: 'אני רוצה לבטל', user_ns: 'ns', message_id: 'new' }))
    releaseSlow(); await Promise.all(background.slice(bgBefore))
    const flow = db.sessions.get(PHONE)?.current_flow
    check('2.4 (#12) — המסלול נשאר cancel_child (תוצאה ישנה לא דרסה)', flow === 'cancel_child', `flow=${flow}`)
    check('2.4 (#12) — התשובה הישנה (מחיר) לא נשלחה', !sent.some(t => /המחיר/.test(t)), `sent=${JSON.stringify(sent)}`)
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

  // ═══ R3 (#12) — תשובה ישנה שמסיימת שיחה לא מוחקת מסלול חדש (rev) ══════════════
  {
    const PHONE = '+972500000000'
    const db = makeSessionDB()
    db.sessions.set(PHONE, { phone: PHONE, current_flow: 'register_child_name', collected_data: {}, rev: 'r0' })
    dbmod.createServiceClient = db.client
    let releaseSlow; const gate = new Promise(r => (releaseSlow = r))
    const sent = []
    uchat.getUserNsByPhone = async () => 'ns'; uchat.sendText = async (n, t) => { sent.push(t); return true }
    process.env.LLM_DEFER_TIMEOUT_MS = '10'
    handler.processMessage = async (s, msg) => {
      if (msg === 'שאלה איטית') { await gate; return { text: 'תשובה ישנה', intent: 'שאלה_כללית', isComplete: true } }  // ישן: מסיים שיחה
      return { text: 'מה שם הילד לביטול?', intent: 'ביטול', nextFlow: 'cancel_child' }  // חדש: מתקדם
    }
    const bgBefore = background.length
    await route.POST(request({ phone: PHONE, message: 'שאלה איטית', user_ns: 'ns', message_id: 'old' }))
    await route.POST(request({ phone: PHONE, message: 'לבטל', user_ns: 'ns', message_id: 'new' }))
    releaseSlow(); await Promise.all(background.slice(bgBefore))
    const cur = db.sessions.get(PHONE)
    check('R3 (#12) — תשובה ישנה שמסיימת לא מחקה מסלול חדש', !!cur && cur.current_flow === 'cancel_child', `session=${JSON.stringify(cur)}`)
    check('R3 (#12) — התשובה הישנה לא נשלחה', !sent.some(t => /תשובה ישנה/.test(t)), `sent=${JSON.stringify(sent)}`)
  }

  // ═══ R4 (#14) — כשל שמירה בנתיב הדחוי לא שולח את התשובה ═══════════════════════
  {
    const PHONE = '+972500000000'
    const db = makeSessionDB()
    db.sessions.set(PHONE, { phone: PHONE, current_flow: 'x', collected_data: {}, rev: 'r0' })
    db.failSave = true
    dbmod.createServiceClient = db.client
    let releaseSlow; const gate = new Promise(r => (releaseSlow = r))
    const sent = []
    uchat.getUserNsByPhone = async () => 'ns'; uchat.sendText = async (n, t) => { sent.push(t); return true }
    process.env.LLM_DEFER_TIMEOUT_MS = '10'
    handler.processMessage = async () => { await gate; return { text: 'מה שם הילד?', intent: 'רישום_צהרון', nextFlow: 'register_child_name' } }
    const bgBefore = background.length
    await route.POST(request({ phone: PHONE, message: 'איטי', user_ns: 'ns', message_id: 'only' }))
    releaseSlow(); await Promise.all(background.slice(bgBefore))
    check('R4 (#14) — כשל שמירה דחוי → התשובה לא נשלחה', !sent.some(t => /מה שם הילד/.test(t)), `sent=${JSON.stringify(sent)}`)
  }

  // ═══ R5 — כשל שמירה משחרר תפיסה; retry מעובד, בלי פנייה כפולה ═════════════════
  {
    const db = makeSessionDB(); dbmod.createServiceClient = db.client
    let calls = 0
    handler.processMessage = async () => { calls++; return { text: 'מה שם הילד?', intent: 'רישום_צהרון', nextFlow: 'register_child_name', createTask: { type: 'שאלה כללית', description: 'בדיקה', priority: 'רגיל' } } }
    db.failSave = true
    const r1 = await (await route.POST(request({ phone: '+972500000000', message: '2', message_id: 'retry-1' }))).json()
    db.failSave = false
    const r2 = await (await route.POST(request({ phone: '+972500000000', message: '2', message_id: 'retry-1' }))).json()
    check('R5 — ניסיון ראשון נכשל בשמירה (saveError)', r1.saveError === true, `r1=${JSON.stringify(r1)}`)
    check('R5 — ניסיון חוזר עובד (לא duplicate)', r2.duplicate !== true && calls === 2, `r2=${JSON.stringify(r2)} calls=${calls}`)
    check('R5 — נוצרה פנייה אחת בלבד (לא כפולה ב-retry)', db.tasks.length === 1, `tasks=${db.tasks.length}`)
  }

  // ═══ R1b — הסימולטור לא עושה fetch ל-PayPlus בענף חידוש כרטיס (renewRecurringCard) ══
  {
    handler.processMessage = realProcess
    // מפתחות PayPlus מוגדרים כדי שבלי השער renewRecurringCard *היה* מגיע ל-fetch:
    process.env.PAYPLUS_API_KEY = 'k'; process.env.PAYPLUS_SECRET_KEY = 's'; process.env.PAYPLUS_TERMINAL_UID = 't'
    const db = makeSessionDB(); dbmod.createServiceClient = db.client
    const helpers = require(path.join(ROOT, 'src/lib/bot/payment-helpers.ts'))
    helpers.findRecurringForRenewal = async () => ({ uid: 'sim-uid' })
    const fetchUrls = []
    global.fetch = async (url) => { fetchUrls.push(String(url)); throw new Error('NETWORK_BLOCKED_IN_TEST') }
    const simulator = require(path.join(ROOT, 'src/app/api/bot/simulate/route.ts'))
    const res = await simulator.POST(request({ sessionId: 'sim-pp', testPhone: '+972500000000', message: 'כן', clientState: { currentFlow: 'payment_fail_confirm_child', collectedData: { child_name: 'נועם בדיקה', payment_fail_branch: 'card' } } }))
    await res.json()
    global.fetch = async () => { throw new Error('NETWORK_BLOCKED_IN_TEST') }
    delete process.env.PAYPLUS_API_KEY; delete process.env.PAYPLUS_SECRET_KEY; delete process.env.PAYPLUS_TERMINAL_UID
    check('R1b — הסימולטור לא עשה fetch ל-PayPlus (renewRecurringCard חסום)', !fetchUrls.some(u => /payplus/i.test(u)), `fetchUrls=${JSON.stringify(fetchUrls)}`)
  }

  console.log(`\n────────────\nעברו: ${passed} | נכשלו: ${failed}`)
  process.exit(failed === 0 ? 0 : 1)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
