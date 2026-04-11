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

function getSupabaseServerKey() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error("Variáveis de ambiente do Supabase da Bia não configuradas")
  }

  if (!serviceKey) {
    const message =
      "SUPABASE_SERVICE_ROLE_KEY não configurada. O servidor precisa da Service Role para acessar dados com RLS."
    if (process.env.NODE_ENV === "development") {
      console.warn(`[Supabase] ${message} Usando ANON como fallback (RLS pode bloquear).`)
      if (!anonKey) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY não configurada para fallback.")
      }
      return anonKey
    }
    throw new Error(message)
  }

  if (anonKey && serviceKey === anonKey) {
    const message =
      "SUPABASE_SERVICE_ROLE_KEY está igual à NEXT_PUBLIC_SUPABASE_ANON_KEY. Isso bloqueia acesso com RLS."
    if (process.env.NODE_ENV === "development") {
      console.warn(`[Supabase] ${message}`)
    } else {
      throw new Error(message)
    }
  }

  return serviceKey
}

// Função para criar cliente servidor da Bia
export function createBiaSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = getSupabaseServerKey()

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Variáveis de ambiente do Supabase da Bia não configuradas")
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })
}
