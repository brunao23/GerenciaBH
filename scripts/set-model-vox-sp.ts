/**
 * Script: Atualiza o modelo do Gemini para gemini-3.1-flash-lite no tenant vox_sp
 * Uso: npx tsx scripts/set-model-vox-sp.ts
 */

import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { createClient } from "@supabase/supabase-js"

const TENANT = "vox_sp"
const NEW_MODEL = "gemini-3.1-flash-lite"

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  // 1. Buscar metadata atual
  const { data, error } = await supabase
    .from("units_registry")
    .select("unit_prefix, metadata")
    .eq("unit_prefix", TENANT)
    .single()

  if (error || !data) {
    console.error("❌ Erro ao buscar tenant:", error?.message)
    return
  }

  const metadata = data.metadata || {}
  const nativeAgent = metadata.nativeAgent || metadata.aiAgent || {}
  
  console.log(`Tenant: ${TENANT}`)
  console.log(`Modelo atual: ${nativeAgent.geminiModel || "default (gemini-2.5-flash)"}`)
  console.log(`Novo modelo: ${NEW_MODEL}`)
  console.log("")

  // 2. Atualizar modelo
  const updatedNativeAgent = {
    ...nativeAgent,
    geminiModel: NEW_MODEL,
    aiProvider: "google",
  }

  const updatedMetadata = {
    ...metadata,
    nativeAgent: updatedNativeAgent,
  }

  const { error: updateError } = await supabase
    .from("units_registry")
    .update({ metadata: updatedMetadata })
    .eq("unit_prefix", TENANT)

  if (updateError) {
    console.error("❌ Erro ao atualizar:", updateError.message)
    return
  }

  console.log(`✅ Modelo atualizado para ${NEW_MODEL} no tenant ${TENANT}!`)
  console.log("Agora envie uma mensagem via WhatsApp para testar.")
}

main().catch(console.error)
