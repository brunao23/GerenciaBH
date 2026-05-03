import { config as dotenvConfig } from "dotenv"
import { resolve } from "path"
import { getNativeAgentConfigForTenant } from "../lib/helpers/native-agent-config"
import { LLMFactory } from "../lib/services/llm-factory"

dotenvConfig({ path: resolve(process.cwd(), ".env.local") })
dotenvConfig({ path: resolve(process.cwd(), ".env") })

const tenant = String(process.argv[2] || "vox_sete_lagoas").trim()
const dummyProject = String(process.argv[3] || "dummy-vertex-project").trim()

async function main() {
  process.env.VERTEX_GLOBAL_ENABLED = "true"
  process.env.VERTEX_PROJECT_ID = dummyProject

  const config = await getNativeAgentConfigForTenant(tenant)
  if (!config) throw new Error("native_agent_config_not_found")

  const llm = LLMFactory.getService(config, { tenant })
  const serviceName = llm?.constructor?.name || "UnknownService"

  const decision = await llm.decideNextTurn({
    systemPrompt: "Voce e uma assistente. Responda em PT-BR com uma frase.",
    conversation: [{ role: "user", content: "Confirme funcionamento." }],
  })

  console.log(
    JSON.stringify({
      ok: true,
      tenant,
      serviceName,
      usageProvider: decision?.usage?.provider || "unknown",
      usageModel: decision?.usage?.model || "unknown",
      replyPreview: String(decision?.reply || "").slice(0, 120),
    }),
  )
}

main().catch((error) => {
  console.error("[test-vertex-fallback-dry-run] ERROR:", error?.message || error)
  process.exit(1)
})
