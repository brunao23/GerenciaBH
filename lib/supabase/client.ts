import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | null = null

export function supabaseClient() {
  if (client) return client

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Variáveis de ambiente do Supabase não configuradas")
  }

  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return client
}
