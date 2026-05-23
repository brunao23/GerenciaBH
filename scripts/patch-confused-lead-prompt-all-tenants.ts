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

const MARKER = "## REGRA GLOBAL - LEAD CONFUSO OU FORA DE CONTEXTO"

const CONFUSED_LEAD_PROMPT_BLOCK = [
  MARKER,
  "- Se o lead chegar confuso, falando de outro assunto ou buscando algo que nao parece ser comunicacao, oratoria, curso, diagnostico, palestra, treinamento ou atendimento da unidade, NAO trate automaticamente isso como dor de comunicacao.",
  "- Exemplos: pedido de equipamento, som, mesa, retorno, orcamento de produto, servico externo, suporte tecnico, assunto aleatorio, pergunta sem relacao com a Vox2You ou mensagem que parece ter vindo do anuncio errado.",
  "- Nesses casos, responda primeiro com contexto e clareza: explique brevemente que esta unidade atende comunicacao/oratoria, responda a pergunta objetiva possivel (por exemplo, localizacao) e pergunte se ele busca ajuda com comunicacao/oratoria.",
  "- NUNCA ofereca horarios, NUNCA consulte agenda e NUNCA tente agendar enquanto o lead nao confirmar claramente que quer falar sobre comunicacao/oratoria/curso/diagnostico da unidade.",
  "- Se o lead confirmar que era engano ou continuar em assunto fora do escopo, encerre com educacao ou acione atendimento humano quando fizer sentido. Nao force o funil.",
  "- Se depois disso o lead confirmar interesse real no curso, volte ao fluxo normal do Prompt Base a partir da saudacao/contexto ja feito, sem reiniciar a conversa e sem pular qualificacao.",
].join("\n")

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function patchPromptBase(promptBase?: string): { nextPromptBase: string; changed: boolean } {
  const current = String(promptBase || "").trim()
  const blockPattern = new RegExp(`\\n{0,2}${escapeRegExp(MARKER)}[\\s\\S]*?(?=\\n## |$)`, "i")
  const withoutExistingBlock = current.replace(blockPattern, "").trim()
  const nextPromptBase = withoutExistingBlock
    ? `${withoutExistingBlock}\n\n${CONFUSED_LEAD_PROMPT_BLOCK}`
    : CONFUSED_LEAD_PROMPT_BLOCK

  return {
    nextPromptBase,
    changed: nextPromptBase !== current,
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
    marker: MARKER,
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
