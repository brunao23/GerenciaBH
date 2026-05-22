import { config as dotenvConfig } from "dotenv"
import { resolve } from "path"

dotenvConfig({ path: resolve(process.cwd(), ".env.local") })
dotenvConfig({ path: resolve(process.cwd(), ".env") })

const TENANT = "vox_sete_lagoas"
const MARKER = "## CONTINUIDADE, LOCALIZACAO E CIDADES PROXIMAS - SETE LAGOAS"

const LOCATION_CONTINUITY_BLOCK = [
  MARKER,
  "- Depois que voce ja se apresentou nesta conversa, nao se apresente novamente. Responda a pergunta do lead diretamente e siga o proximo passo natural do Prompt Base.",
  "- Quando o lead perguntar se a unidade e de Sete Lagoas, onde fica, ou se atende Matheus Leme, Betim e cidades proximas, confirme que a Vox2You Sete Lagoas atende essa regiao e conduza o atendimento de forma natural.",
  "- Nao diga que nao existe unidade ou atendimento para Matheus Leme, Betim ou cidades proximas sem validar o contexto comercial da unidade.",
  "- Se o lead estiver fora de Sete Lagoas ou da regiao atendida, continue a conversa normalmente, explique a possibilidade de atendimento online quando fizer sentido e acione a equipe humana com um resumo curto para validacao logistica.",
  "- Em perguntas de localizacao, cidade ou cobertura regional, responda essa duvida primeiro. Nao repita saudacao, apresentacao ou pergunta de area/desafio se isso ja apareceu no historico.",
].join("\n")

function patchPromptBase(promptBase?: string): { nextPromptBase: string; changed: boolean } {
  const current = String(promptBase || "").trim()
  if (current.includes(MARKER)) {
    return { nextPromptBase: current, changed: false }
  }

  const nextPromptBase = current
    ? `${current}\n\n${LOCATION_CONTINUITY_BLOCK}`
    : LOCATION_CONTINUITY_BLOCK

  return {
    nextPromptBase,
    changed: nextPromptBase !== current,
  }
}

async function main() {
  const nativeAgentConfigMod: any = await import("../lib/helpers/native-agent-config")
  const nativeAgentConfig = nativeAgentConfigMod.default || nativeAgentConfigMod
  const getNativeAgentConfigForTenant = nativeAgentConfig.getNativeAgentConfigForTenant
  const updateNativeAgentConfigForTenant = nativeAgentConfig.updateNativeAgentConfigForTenant

  if (!getNativeAgentConfigForTenant || !updateNativeAgentConfigForTenant) {
    throw new Error("native_agent_config_helpers_unavailable")
  }

  const config = await getNativeAgentConfigForTenant(TENANT)
  if (!config) {
    throw new Error(`native_agent_config_not_found:${TENANT}`)
  }

  const { nextPromptBase, changed } = patchPromptBase(config.promptBase)
  if (changed) {
    await updateNativeAgentConfigForTenant(TENANT, {
      ...config,
      promptBase: nextPromptBase,
    })
  }

  const refreshed = await getNativeAgentConfigForTenant(TENANT)
  console.log(JSON.stringify({
    tenant: TENANT,
    changed,
    markerPresent: Boolean(refreshed?.promptBase?.includes(MARKER)),
    promptBaseLength: refreshed?.promptBase?.length || 0,
  }, null, 2))
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error))
  process.exit(1)
})
