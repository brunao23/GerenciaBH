/**
 * Reverte geminiModel de bia_vox para gemini-3.1-flash-lite
 * Execute: npx dotenv-cli -e .env.local -- npx tsx scripts/revert-bia-vox-model.ts
 */

import { createBiaSupabaseServerClient } from "../lib/supabase/bia-client"

const TENANT = "bia_vox"
const ORIGINAL_MODEL = "gemini-3.1-flash-lite"

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
  const nativeAgent = { ...metadata.nativeAgent, geminiModel: ORIGINAL_MODEL }

  const { error: updateError } = await supabase
    .from("units_registry")
    .update({ metadata: { ...metadata, nativeAgent } })
    .eq("unit_prefix", TENANT)

  if (updateError) {
    console.error("ERRO ao atualizar:", updateError.message)
    process.exit(1)
  }

  console.log(`✅ geminiModel revertido para "${ORIGINAL_MODEL}"`)
}

main().catch(err => { console.error("FATAL:", err); process.exit(1) })
