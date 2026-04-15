/**
 * Script de diagnóstico e fix para o agente nativo do bia_vox
 * Execute: npx tsx scripts/fix-bia-vox-agent.ts
 */

import { createBiaSupabaseServerClient } from "../lib/supabase/bia-client"

const TENANT = "bia_vox"
const WEBHOOK_PRIMARY_URL =
  "https://gerencia.geniallabs.com.br/api/agent/webhooks/zapi?tenant=bia_vox&webhookSecret=Fdc56557f851f4b30ae6002462713fad6S"

async function main() {
  const supabase = createBiaSupabaseServerClient()

  console.log(`\n=== DIAGNÓSTICO AGENTE NATIVO: ${TENANT} ===\n`)

  // 1. Buscar registro atual
  const { data: rows, error: fetchErr } = await supabase
    .from("units_registry")
    .select("id, unit_prefix, metadata")
    .eq("unit_prefix", TENANT)
    .limit(1)

  if (fetchErr) {
    console.error("ERRO ao buscar units_registry:", fetchErr.message)
    process.exit(1)
  }

  if (!rows || rows.length === 0) {
    console.error(`Registro "${TENANT}" não encontrado em units_registry`)
    process.exit(1)
  }

  const row = rows[0]
  const current = (row.metadata?.nativeAgent || {}) as Record<string, any>

  console.log("--- Config atual (nativeAgent) ---")
  console.log(JSON.stringify(current, null, 2))
  console.log("")

  // 2. Diagnóstico
  const issues: string[] = []

  if (!current.enabled) issues.push("❌ enabled = false  → agente nativo desabilitado")
  if (!current.webhookEnabled) issues.push("❌ webhookEnabled = false  → webhook desabilitado")
  if (current.webhookAllowedInstanceId)
    issues.push(`❌ webhookAllowedInstanceId = "${current.webhookAllowedInstanceId}"  → bloqueia todas as instâncias`)
  if (!current.webhookPrimaryUrl)
    issues.push("❌ webhookPrimaryUrl ausente  → tenant não pode ser resolvido pela URL")
  if (!current.geminiApiKey) issues.push("⚠️  geminiApiKey ausente  → Gemini não funcionará")

  if (issues.length === 0) {
    console.log("✅ Nenhum problema detectado na config básica")
  } else {
    console.log("--- Problemas encontrados ---")
    issues.forEach((i) => console.log(i))
  }

  console.log("")

  // 3. Aplicar fixes
  const patched: Record<string, any> = {
    ...current,
    enabled: true,
    webhookEnabled: true,
    webhookPrimaryUrl: WEBHOOK_PRIMARY_URL,
  }

  // Remover campo que causa bloqueio
  delete patched.webhookAllowedInstanceId

  const newMetadata = {
    ...(row.metadata || {}),
    nativeAgent: patched,
  }

  const { error: updateErr } = await supabase
    .from("units_registry")
    .update({ metadata: newMetadata })
    .eq("id", row.id)

  if (updateErr) {
    console.error("ERRO ao aplicar fix:", updateErr.message)
    process.exit(1)
  }

  console.log("--- Config após fix ---")
  console.log(JSON.stringify(patched, null, 2))
  console.log("")
  console.log("✅ Fix aplicado com sucesso!")
  console.log("")
  console.log("Campos garantidos:")
  console.log("  enabled               =", patched.enabled)
  console.log("  webhookEnabled        =", patched.webhookEnabled)
  console.log("  webhookAllowedInstanceId =", patched.webhookAllowedInstanceId ?? "(removido)")
  console.log("  webhookPrimaryUrl     =", patched.webhookPrimaryUrl)
  console.log("")
  console.log("Próximo passo: envie uma mensagem de teste no WhatsApp para bia_vox")
}

main().catch((err) => {
  console.error("FATAL:", err)
  process.exit(1)
})
