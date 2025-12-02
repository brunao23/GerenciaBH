
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function inspectTable() {
    const { data, error } = await supabase
        .from('bia_voxn8n_chat_histories')
        .select('*')
        .limit(1)

    if (error) {
        console.error('Error:', error)
    } else {
        console.log('Record structure:', Object.keys(data[0]))
        console.log('Sample record:', JSON.stringify(data[0], null, 2))
    }
}

inspectTable()
