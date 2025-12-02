import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function debugTimestamp() {
    const { data, error } = await supabase
        .from('bia_voxn8n_chat_histories')
        .select('*')
        .order('id', { ascending: false })
        .limit(5)

    if (error) {
        console.error('Error:', error)
    } else {
        console.log('\n=== ESTRUTURA DE 5 REGISTROS MAIS RECENTES ===\n')
        data.forEach((record, i) => {
            console.log(`\n--- REGISTRO ${i + 1} (ID: ${record.id}) ---`)
            console.log('Chaves do objeto:', Object.keys(record))
            console.log('\nValor de created_at (raiz):', record.created_at)
            console.log('Valor de message:', JSON.stringify(record.message, null, 2))
            console.log('\nConteúdo completo (primeiros 500 chars):')
            const content = record.message?.content || record.message?.text || ''
            console.log(content.substring(0, 500))
            console.log('\n' + '='.repeat(80))
        })
    }
}

debugTimestamp()
