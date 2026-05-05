import { config as dotenvConfig } from "dotenv"
import { resolve } from "path"

dotenvConfig({ path: resolve(process.cwd(), ".env.local") })
dotenvConfig({ path: resolve(process.cwd(), ".env") })

import { createBiaSupabaseServerClient } from "../lib/supabase/bia-client"
import {
  getNativeAgentConfigForTenant,
  updateNativeAgentConfigForTenant,
} from "../lib/helpers/native-agent-config"
import { normalizeTenant } from "../lib/helpers/normalize-tenant"

const AUDIO_PROMPT_BLOCK = [
  "## REGRAS DE AUDIO DO LEAD (OBRIGATORIAS):",
  "- O usuario pode enviar audio normalmente. Audio e um formato valido de atendimento.",
  "- Quando o sistema fornecer a transcricao do audio, trate essa transcricao como a mensagem real do lead, com o mesmo peso de uma mensagem digitada.",
  "- NUNCA recuse atendimento por ser audio e NUNCA diga que o lead precisa digitar se a transcricao estiver disponivel.",
  "- Ao interpretar audio, preserve com maxima atencao nomes, numeros, datas, horarios, valores e detalhes concretos mencionados pelo lead.",
  "- Se a transcricao vier como [audio_sem_fala_inteligivel], peca de forma curta e natural para o lead repetir o ponto principal por audio ou texto.",
].join("\n")

function patchPromptBase(promptBase?: string): { nextPromptBase: string; changed: boolean } {
  const current = String(promptBase || "").trim()
  const normalized = current.toLowerCase()

  if (
    normalized.includes("## regras de audio do lead (obrigatorias):".toLowerCase()) ||
    normalized.includes("o usuario pode enviar audio normalmente")
  ) {
    return {
      nextPromptBase: current,
      changed: false,
    }
  }

  return {
    nextPromptBase: current ? `${current}\n\n${AUDIO_PROMPT_BLOCK}` : AUDIO_PROMPT_BLOCK,
    changed: true,
  }
}

async function main() {
  const supabase = createBiaSupabaseServerClient()
  const { data, error } = await supabase
    .from("units_registry")
    .select("unit_prefix")
    .order("unit_prefix", { ascending: true })

  if (error) {
    throw new Error(`failed_to_list_units_registry: ${error.message}`)
  }

  const tenants = Array.from(
    new Set(
      (Array.isArray(data) ? data : [])
        .map((row: any) => normalizeTenant(row?.unit_prefix))
        .filter(Boolean),
    ),
  )

  const changed: string[] = []
  const skipped: string[] = []

  for (const tenant of tenants) {
    const config = await getNativeAgentConfigForTenant(tenant)
    if (!config) {
      skipped.push(`${tenant}:missing_config`)
      continue
    }

    const { nextPromptBase, changed: promptChanged } = patchPromptBase(config.promptBase)
    if (!promptChanged) {
      skipped.push(`${tenant}:already_patched`)
      continue
    }

    await updateNativeAgentConfigForTenant(tenant, {
      ...config,
      promptBase: nextPromptBase,
    })
    changed.push(tenant)
  }

  console.log(JSON.stringify({
    tenantsFound: tenants.length,
    changedCount: changed.length,
    changed,
    skippedCount: skipped.length,
    skipped,
  }, null, 2))
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error))
  process.exit(1)
})
