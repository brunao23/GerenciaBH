import { createClient } from "@supabase/supabase-js"

// Função para criar cliente Supabase da Bia
export function createBiaSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Variáveis de ambiente do Supabase da Bia não configuradas")
  }

  return createClient(supabaseUrl, supabaseKey)
}

// Função para criar cliente servidor da Bia
export function createBiaSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Variáveis de ambiente do Supabase da Bia não configuradas")
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })
}
