require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  // Check for group sessions by session_id pattern
  const { data, error } = await s.from('vox_bhn8n_chat_histories')
    .select('session_id,message')
    .order('id', { ascending: false })
    .limit(2000)

  if (error) { console.error('Error:', error); return }

  const groups = data.filter(row => {
    const sid = (row.session_id || '').toLowerCase()
    const msg = row.message || {}
    const chatId = String(msg.chatId || msg.chat_id || msg.raw?.chatId || msg.raw?.data?.chatId || '')
    return sid.includes('@g.us') || sid.startsWith('group_') || msg.isGroup === true || chatId.includes('@g.us')
  })

  const unique = [...new Set(groups.map(x => x.session_id))]
  console.log('Total group rows:', groups.length)
  console.log('Unique group sessions:', unique.length)
  console.log('Sessions:', JSON.stringify(unique, null, 2))

  // Also check messages that have isGroup in their content
  const groupByMsg = data.filter(row => {
    const msg = row.message || {}
    return msg.isGroup === true || (msg.additional && msg.additional.is_group === true)
  })
  console.log('\nRows with isGroup in message:', groupByMsg.length)
  if (groupByMsg.length > 0) {
    console.log('Sample:', JSON.stringify(groupByMsg[0].session_id))
  }
}
main()
