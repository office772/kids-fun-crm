/**
 * migrate.js — העברת נתונים מ-Supabase של עינת → Supabase של הלקוחה
 *
 * הרצה: node scripts/migrate.js
 */

const { createClient } = require('@supabase/supabase-js')
const readline = require('readline')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(resolve => rl.question(q, resolve))

// טבלאות לפי סדר (לשמור על foreign keys)
const TABLES = [
  'branches',
  'parents',
  'children',
  'registrations',
  'payments',
  'conversations',
  'tasks',
  'calendar_events',
  'settings',
]

async function copyTable(source, dest, tableName) {
  process.stdout.write(`  העברת ${tableName}... `)

  const { data, error } = await source.from(tableName).select('*')
  if (error) {
    console.log(`⚠️  דלוג (${error.message})`)
    return 0
  }
  if (!data || data.length === 0) {
    console.log('ריק, דלוג')
    return 0
  }

  // מחיקת נתונים קיימים ביעד (אם יש)
  await dest.from(tableName).delete().neq('id', '00000000-0000-0000-0000-000000000000')

  // הכנסה בחבילות של 100
  const BATCH = 100
  let inserted = 0
  for (let i = 0; i < data.length; i += BATCH) {
    const batch = data.slice(i, i + BATCH)
    const { error: insertErr } = await dest.from(tableName).insert(batch)
    if (insertErr) {
      console.log(`\n  ❌ שגיאה בשורה ${i}: ${insertErr.message}`)
      continue
    }
    inserted += batch.length
  }

  console.log(`✅ ${inserted} רשומות`)
  return inserted
}

async function main() {
  console.log('\n🚀 סקריפט העברת נתונים — Kids & Fun')
  console.log('=====================================\n')

  console.log('📌 מקור (Supabase של עינת):')
  const sourceUrl = await ask('   Project URL: ')
  const sourceKey = await ask('   Service Role Key: ')

  console.log('\n📌 יעד (Supabase של הלקוחה):')
  const destUrl = await ask('   Project URL: ')
  const destKey = await ask('   Service Role Key: ')

  console.log('\n⚠️  שים לב: פעולה זו תמחק נתונים קיימים ביעד!')
  const confirm = await ask('   להמשיך? (כן/לא): ')

  if (confirm.trim() !== 'כן') {
    console.log('❌ בוטל.')
    rl.close()
    return
  }

  console.log('\n🔄 מתחיל העברה...\n')

  const source = createClient(sourceUrl.trim(), sourceKey.trim())
  const dest = createClient(destUrl.trim(), destKey.trim())

  // בדיקת חיבור
  const { error: connErr } = await source.from('parents').select('id').limit(1)
  if (connErr) {
    console.log(`❌ לא ניתן להתחבר למקור: ${connErr.message}`)
    rl.close()
    return
  }

  let total = 0
  for (const table of TABLES) {
    total += await copyTable(source, dest, table)
  }

  console.log(`\n✅ הועברו ${total} רשומות בסך הכל!`)
  console.log('\n📋 הצעדים הבאים:')
  console.log('  1. עדכני את ה-Environment Variables ב-Vercel')
  console.log('  2. עדכני את ה-webhook URL ב-ManyChat')
  console.log('  3. בדקי שהדשבורד עולה')
  console.log('\n🎉 המסירה הושלמה!\n')

  rl.close()
}

main().catch(err => {
  console.error('שגיאה:', err.message)
  rl.close()
  process.exit(1)
})
