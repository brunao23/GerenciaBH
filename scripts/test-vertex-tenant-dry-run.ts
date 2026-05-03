import { config as dotenvConfig } from "dotenv"
import { resolve } from "path"
import { getNativeAgentConfigForTenant } from "../lib/helpers/native-agent-config"
import { LLMFactory } from "../lib/services/llm-factory"

dotenvConfig({ path: resolve(process.cwd(), ".env.local") })
dotenvConfig({ path: resolve(process.cwd(), ".env") })

const tenant = String(process.argv[2] || "vox_sete_lagoas").trim()

async function main() {
  if (!tenant) {
    throw new Error("tenant_invalido")
  }

  process.env.VERTEX_TEST_MODE_ENABLED = "true"
  process.env.VERTEX_TEST_TENANTS = tenant

  console.log("[vertex-dry-run] tenant:", tenant)
  console.log("[vertex-dry-run] VERTEX_PROJECT_ID:", process.env.VERTEX_PROJECT_ID ? "SET" : "MISSING")
  console.log(
    "[vertex-dry-run] GOOGLE_APPLICATION_CREDENTIALS:",
    process.env.GOOGLE_APPLICATION_CREDENTIALS ? "SET" : "MISSING",
  )

  const config = await getNativeAgentConfigForTenant(tenant)
  if (!config) {
    throw new Error("native_agent_config_not_found")
  }

  const llm = LLMFactory.getService(config, { tenant })
  const providerName = llm?.constructor?.name || "UnknownService"
  console.log("[vertex-dry-run] llm service:", providerName)

  const acceptableServices = new Set(["VertexAIService", "VertexWithGoogleFallbackService"])
  if (!acceptableServices.has(providerName)) {
    throw new Error(`vertex_not_selected service=${providerName}`)
  }

  const decision = await llm.decideNextTurn({
    systemPrompt:
      "Voce e uma assistente comercial consultiva. Responda em PT-BR em no maximo 2 frases.",
    conversation: [{ role: "user", content: "Teste tecnico: confirme em uma frase que esta ativo." }],
  })

  console.log("[vertex-dry-run] usage provider:", decision?.usage?.provider || "unknown")
  console.log("[vertex-dry-run] usage model:", decision?.usage?.model || "unknown")
  console.log("[vertex-dry-run] reply:", String(decision?.reply || "").slice(0, 200))

  if (decision?.usage?.provider !== "vertexai") {
    throw new Error(
      `vertex_usage_not_confirmed provider=${String(decision?.usage?.provider || "unknown")}`,
    )
  }

  console.log("[vertex-dry-run] OK")
}

main().catch((error) => {
  console.error("[vertex-dry-run] ERROR:", error?.message || error)
  process.exit(1)
})
