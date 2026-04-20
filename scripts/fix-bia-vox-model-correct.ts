/**
 * Corrige geminiModel para o ID correto da API Gemini
 * Execute: npx dotenv-cli -e .env.local -- npx tsx scripts/fix-bia-vox-model-correct.ts
 */

import { createBiaSupabaseServerClient } from "../lib/supabase/bia-client"

const TENANT = "bia_vox"
const CORRECT_MODEL = "gemini-3.1-flash-lite-preview"

async function main() {
  const supabase = createBiaSupabaseServerClient()

  const { data: rows, error } = await supabase
    .from("units_registry")
    .select("id, unit_prefix, metadata")
    .eq("unit_prefix", TENANT)
    .limit(1)

  if (error || !rows?.length) {
    console.error("ERRO:", error?.message || "bia_vox não encontrado")
    process.exit(1)
  }

  const row = rows[0]
  const metadata = row.metadata || {}
  const nativeAgent = { ...metadata.nativeAgent, geminiModel: CORRECT_MODEL }

  const { error: updateError } = await supabase
    .from("units_registry")
    .update({ metadata: { ...metadata, nativeAgent } })
    .eq("unit_prefix", TENANT)

  if (updateError) {
    console.error("ERRO ao atualizar:", updateError.message)
    process.exit(1)
  }

  console.log(`✅ geminiModel atualizado para "${CORRECT_MODEL}"`)
  console.log("Config lida em runtime do banco — nenhum deploy de código necessário.")
}

main().catch(err => { console.error("FATAL:", err); process.exit(1) })
