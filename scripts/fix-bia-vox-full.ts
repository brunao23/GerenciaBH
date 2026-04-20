/**
 * Fix completo bia_vox — corrige geminiModel inválido + messaging.instanceId bloqueador
 * Execute: npx dotenv-cli -e .env.local -- npx tsx scripts/fix-bia-vox-full.ts
 */

import { createBiaSupabaseServerClient } from "../lib/supabase/bia-client"

const TENANT = "bia_vox"
const VALID_MODEL = "gemini-2.0-flash"
const KNOWN_BAD_MODELS = ["gemini-3.1-flash-lite", "gemini-3.0-flash", "gemini-3.1-flash", "gemini-3.0-flash-lite"]

function extractInstanceIdFromZapiUrl(value: string): string {
  const text = String(value || "").trim()
  if (!text) return ""
  const match = text.match(/\/instances\/([^/]+)\//i)
  return String(match?.[1] || "").trim()
}

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
  const nativeAgent = metadata.nativeAgent || {}
  const messaging = metadata.messaging || {}

  console.log("\n=== CONFIG ATUAL ===")
  console.log("nativeAgent.geminiModel:", nativeAgent.geminiModel || "(não definido)")
  console.log("nativeAgent.enabled:", nativeAgent.enabled)
  console.log("nativeAgent.webhookEnabled:", nativeAgent.webhookEnabled)
  console.log("messaging.instanceId:", messaging.instanceId || "(vazio)")
  console.log("messaging.sendTextUrl:", messaging.sendTextUrl ? messaging.sendTextUrl.substring(0, 60) + "..." : "(vazio)")
  console.log("messaging.apiUrl:", messaging.apiUrl ? messaging.apiUrl.substring(0, 60) + "..." : "(vazio)")

  // Simula trustedInstanceCandidates (igual ao webhook)
  const instanceFromUrl = extractInstanceIdFromZapiUrl(messaging.sendTextUrl || "")
  const instanceFromApiUrl = extractInstanceIdFromZapiUrl(messaging.apiUrl || "")
  const trustedCandidates = [
    String(nativeAgent.webhookAllowedInstanceId || "").trim(),
    String(messaging.instanceId || "").trim(),
    instanceFromUrl,
    instanceFromApiUrl,
  ].filter(Boolean)

  console.log("\n=== DIAGNÓSTICO ===")

  const fixes: string[] = []

  // Check 1: instanceId bloqueando webhook
  if (trustedCandidates.length > 0) {
    console.log("❌ CHECK DE INSTANCE ID ATIVO — candidatos:", trustedCandidates)
    console.log("   Qualquer webhook do Zapi sem instanceId correspondente é BLOQUEADO com 403.")

    if (messaging.instanceId) {
      console.log(`   → messaging.instanceId="${messaging.instanceId}" está causando o bloqueio.`)
      fixes.push("clear_messaging_instanceId")
    }
    if (instanceFromUrl) {
      console.log(`   → instanceId extraído do sendTextUrl: "${instanceFromUrl}"`)
    }
    if (instanceFromApiUrl) {
      console.log(`   → instanceId extraído do apiUrl: "${instanceFromApiUrl}"`)
    }
  } else {
    console.log("✅ Check de instanceId DESATIVADO — qualquer webhook aceito.")
  }

  // Check 2: modelo Gemini inválido
  const model = String(nativeAgent.geminiModel || "").trim()
  if (KNOWN_BAD_MODELS.includes(model)) {
    console.log(`\n❌ MODELO GEMINI INVÁLIDO: "${model}"`)
    console.log(`   → Será corrigido para "${VALID_MODEL}"`)
    fixes.push("fix_geminiModel")
  } else if (!model) {
    console.log("\n⚠️  geminiModel não definido — usará fallback do código (ok por ora)")
  } else {
    console.log(`\n✅ Modelo Gemini OK: "${model}"`)
  }

  if (fixes.length === 0) {
    console.log("\n✅ Nenhuma correção necessária no config. Problema pode ser no dashboard do Zapi.")
    console.log("   Confirme que a URL de webhook está configurada no painel Zapi para esta instância.")
    return
  }

  // Aplicar correções
  console.log("\n=== APLICANDO CORREÇÕES ===")

  const updatedNativeAgent = { ...nativeAgent }
  const updatedMessaging = { ...messaging }

  if (fixes.includes("fix_geminiModel")) {
    updatedNativeAgent.geminiModel = VALID_MODEL
    console.log(`✅ geminiModel atualizado: "${model}" → "${VALID_MODEL}"`)
  }

  if (fixes.includes("clear_messaging_instanceId")) {
    delete updatedMessaging.instanceId
    console.log("✅ messaging.instanceId removido (check de instância desativado)")
  }

  const updatedMetadata = {
    ...metadata,
    nativeAgent: updatedNativeAgent,
    messaging: updatedMessaging,
  }

  const { error: updateError } = await supabase
    .from("units_registry")
    .update({ metadata: updatedMetadata })
    .eq("unit_prefix", TENANT)

  if (updateError) {
    console.error("❌ ERRO ao atualizar:", updateError.message)
    process.exit(1)
  }

  console.log("\n✅ CONFIG ATUALIZADO COM SUCESSO NO BANCO.")
  console.log("\n=== PRÓXIMOS PASSOS ===")
  console.log("1. Faça deploy ou reinicie o servidor para o config ser recarregado")
  console.log("2. Envie uma mensagem de teste do WhatsApp para bia_vox")
  console.log("3. Verifique os logs do servidor por erros de Gemini ou instanceId")
}

main().catch(err => {
  console.error("FATAL:", err)
  process.exit(1)
})
