/**
 * Diagnóstico completo bia_vox — nativeAgent + messaging config
 * Execute: npx dotenv-cli -e .env.local -- npx tsx scripts/diag-bia-vox-full.ts
 */

import { createBiaSupabaseServerClient } from "../lib/supabase/bia-client"

const TENANT = "bia_vox"

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
  const nativeAgent = row.metadata?.nativeAgent || {}
  const messaging = row.metadata?.messaging || {}

  console.log("\n=== NATIVE AGENT CONFIG ===")
  console.log(JSON.stringify(nativeAgent, null, 2))

  console.log("\n=== MESSAGING CONFIG ===")
  console.log(JSON.stringify(messaging, null, 2))

  // Simula o que o webhook faz para construir trustedInstanceCandidates
  const instanceFromUrl = extractInstanceIdFromZapiUrl(messaging.sendTextUrl || "")
  const instanceFromApiUrl = extractInstanceIdFromZapiUrl(messaging.apiUrl || "")

  const trustedCandidates = [
    String(nativeAgent.webhookAllowedInstanceId || "").trim(),
    String(messaging.instanceId || "").trim(),
    instanceFromUrl,
    instanceFromApiUrl,
  ].filter(Boolean)

  console.log("\n=== INSTANCE ID CHECK (simulação) ===")
  console.log("trustedInstanceCandidates:", trustedCandidates)
  console.log("")

  if (trustedCandidates.length === 0) {
    console.log("✅ Nenhum candidato de instanceId → check de instância DESATIVADO (qualquer instanceId aceito)")
  } else {
    console.log("⚠️  Check de instanceId ATIVO.")
    console.log("   O Zapi DEVE enviar um destes instanceIds no payload do webhook:")
    trustedCandidates.forEach(c => console.log("   -", c))
    console.log("")
    console.log("   Se o Zapi não enviar instanceId, a requisição será REJEITADA com 403 instance_not_allowed")
    console.log("")
    console.log("   SOLUÇÃO: verificar se o Zapi envia 'instanceId' no corpo do webhook.")
    console.log("   Normalmente, configure 'webhookAllowedInstanceId' no nativeAgent com o instanceId correto,")
    console.log("   OU remova o 'instanceId' do messaging config se não for necessário.")
  }

  // Verificar modelo Gemini
  const model = String(nativeAgent.geminiModel || "").trim()
  console.log("\n=== MODELO GEMINI ===")
  console.log("geminiModel:", model || "(não definido)")
  const knownBadModels = ["gemini-3.1-flash-lite", "gemini-3.0-flash"]
  if (knownBadModels.includes(model)) {
    console.log("❌ MODELO INVÁLIDO! Este modelo não existe na API Gemini.")
    console.log("   Use: gemini-2.0-flash ou gemini-2.5-flash")
  } else if (!model) {
    console.log("⚠️  Modelo não definido — usará fallback do código")
  } else {
    console.log("✅ Modelo parece válido")
  }

  // Webhook URL check
  const webhookUrl = String(nativeAgent.webhookPrimaryUrl || "").trim()
  const webhookSecret = String(nativeAgent.webhookSecret || "").trim()
  console.log("\n=== WEBHOOK URL ===")
  console.log("webhookPrimaryUrl:", webhookUrl || "(ausente)")
  if (webhookUrl.includes("webhookSecret=")) {
    const urlSecret = new URL(webhookUrl).searchParams.get("webhookSecret") || ""
    console.log("secret na URL:", urlSecret)
    console.log("config.webhookSecret:", webhookSecret)
    if (urlSecret === webhookSecret) {
      console.log("✅ Secret na URL bate com config.webhookSecret")
    } else {
      console.log("❌ DIVERGÊNCIA! Secret na URL não bate com config.webhookSecret")
    }
  }

  console.log("\n=== RESUMO ===")
  const problems: string[] = []
  if (!nativeAgent.enabled) problems.push("❌ enabled = false")
  if (!nativeAgent.webhookEnabled) problems.push("❌ webhookEnabled = false")
  if (knownBadModels.includes(model)) problems.push(`❌ geminiModel inválido: "${model}"`)
  if (trustedCandidates.length > 0) problems.push(`⚠️  Check de instanceId ativo — candidatos: ${trustedCandidates.join(", ")}`)
  if (!webhookUrl) problems.push("❌ webhookPrimaryUrl ausente")

  if (problems.length === 0) {
    console.log("✅ Tudo parece OK no config. Problema pode ser no lado do Zapi (URL não configurada no dashboard)")
  } else {
    problems.forEach(p => console.log(p))
  }
}

main().catch(err => {
  console.error("FATAL:", err)
  process.exit(1)
})
