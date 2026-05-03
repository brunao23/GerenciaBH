import { config as dotenvConfig } from "dotenv"
import { resolve } from "path"
import { createClient } from "@supabase/supabase-js"
import { getNativeAgentConfigForTenant } from "../lib/helpers/native-agent-config"
import { LLMFactory } from "../lib/services/llm-factory"
import { ZApiService } from "../lib/services/z-api.service"

dotenvConfig({ path: resolve(process.cwd(), ".env.local") })
dotenvConfig({ path: resolve(process.cwd(), ".env") })

const TENANT = String(process.argv[2] || "vox_sete_lagoas").trim()
const PHONE = String(process.argv[3] || "5522992523549").trim()

async function main() {
  if (!TENANT) throw new Error("tenant_required")
  if (!PHONE) throw new Error("phone_required")

  process.env.VERTEX_TEST_MODE_ENABLED = "true"
  process.env.VERTEX_TEST_TENANTS = TENANT

  const cfg = await getNativeAgentConfigForTenant(TENANT)
  if (!cfg) throw new Error("native_agent_config_not_found")

  const llm = LLMFactory.getService(cfg, { tenant: TENANT })
  const serviceName = llm?.constructor?.name || "UnknownService"
  const acceptableServices = new Set(["VertexAIService", "VertexWithGoogleFallbackService"])
  if (!acceptableServices.has(serviceName)) {
    throw new Error(`vertex_not_selected service=${serviceName}`)
  }

  const decision = await llm.decideNextTurn({
    systemPrompt:
      "Voce e uma atendente comercial consultiva da unidade. Responda em PT-BR com no maximo 2 frases e tom natural.",
    conversation: [
      {
        role: "user",
        content:
          "Mensagem de validacao tecnica: responda apenas confirmando que o atendimento da unidade esta ativo para continuarmos por aqui.",
      },
    ],
  })

  const aiReply = String(decision?.reply || "").trim()
  if (!aiReply) throw new Error("vertex_reply_empty")

  const usageProvider = String(decision?.usage?.provider || "unknown").toLowerCase()
  if (usageProvider !== "vertexai") {
    throw new Error(`vertex_usage_not_confirmed provider=${usageProvider}`)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("supabase_env_missing")
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase
    .from("units_registry")
    .select("metadata")
    .eq("unit_prefix", TENANT)
    .single()

  if (error || !data) {
    throw new Error(`tenant_metadata_error ${error?.message || "not_found"}`)
  }

  const messaging: any = data?.metadata?.messaging || {}
  const sendTextUrl = String(messaging?.sendTextUrl || messaging?.apiUrl || "").trim()
  const clientToken = String(messaging?.clientToken || "").trim()
  const token = String(messaging?.token || "").trim()
  const instanceId = String(messaging?.instanceId || "ZAPI").trim()

  if (!sendTextUrl && !(token && instanceId)) {
    throw new Error("zapi_send_config_missing")
  }
  if (!clientToken) {
    throw new Error("zapi_client_token_missing")
  }

  const zapi = new ZApiService({
    instanceId,
    token: token || "ZAPI",
    clientToken,
    apiUrl: sendTextUrl || "https://api.z-api.io",
  })

  const outbound = `[VALIDACAO VERTEX - ${new Date().toISOString()}]\n${aiReply}`
  const sendResult = await zapi.sendTextMessage({
    phone: PHONE,
    message: outbound,
  })

  if (!sendResult.success) {
    throw new Error(`zapi_send_failed ${sendResult.error || "unknown_error"}`)
  }

  console.log(
    JSON.stringify({
      ok: true,
      tenant: TENANT,
      phone: PHONE,
      llmService: serviceName,
      usageProvider,
      usageModel: decision?.usage?.model || "unknown",
      zapiSuccess: true,
      zapiMessageId: sendResult.messageId || sendResult.id || null,
      replyPreview: aiReply.slice(0, 120),
    }),
  )
}

main().catch((error) => {
  console.error("[validate-vertex-send] ERROR:", error?.message || error)
  process.exit(1)
})
