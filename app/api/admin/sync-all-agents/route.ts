/**
 * API Admin: Sincronizar TODOS os agentes de TODOS os tenants com N8N
 *
 * POST /api/admin/sync-all-agents
 *
 * Percorre todas as empresas, regenera o prompt e atualiza os workflows
 * N8N (zapi-principal, follow-up, lembrete) com a regra anti-abreviação
 * de nomes e qualquer outra atualização no prompt-generator.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import {
  gerarPromptAgente,
  AgenteConfig,
} from "@/lib/agente/prompt-generator"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const REGRA_ANTI_ABREVIACAO =
  "JAMAIS abrevie, encurte ou use apelidos derivados do nome do lead. Use SEMPRE o nome EXATO e COMPLETO (primeiro nome) como informado. Exemplos proibidos: Cah (Camila), Fer (Fernanda), Gabi (Gabriela), Rafa (Rafael), Lu (Lucas). Se o nome do WhatsApp parecer apelido (ex: Caaah, Feer), NAO repita — use 'voce' ate confirmar o nome real."

async function verificarAdmin(
  req: NextRequest
): Promise<{ isAdmin: boolean; userId?: string }> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth-token")?.value
    if (token) {
      const session = await verifyToken(token)
      if (session?.isAdmin) {
        return { isAdmin: true, userId: session.userId }
      }
    }
  } catch {}

  const authHeader = req.headers.get("authorization")
  const apiKey = authHeader?.replace("Bearer ", "")
  if (apiKey && apiKey === process.env.ADMIN_SYNC_SECRET) {
    return { isAdmin: true, userId: "api-key" }
  }

  if (apiKey && (apiKey === process.env.CRON_SECRET || apiKey === process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return { isAdmin: true, userId: "service-key" }
  }

  return { isAdmin: false }
}

function injectAntiAbreviacao(systemMessage: string): string {
  if (!systemMessage) return systemMessage
  if (systemMessage.includes("JAMAIS abrevie")) return systemMessage

  const insertPoints = [
    "CONTEXTO DO LEAD",
    "TOOLS DISPONÍVEIS",
    "TOOLS DISPON",
    "REGRA DE SEGURANÇA",
    "REGRA DE SEGURANCA",
    "LÓGICA DE DECISÃO",
    "LOGICA DE DECISAO",
    "Diretrizes para a mensagem",
  ]

  for (const point of insertPoints) {
    if (systemMessage.includes(point)) {
      return systemMessage.replace(
        point,
        `REGRA ABSOLUTA DE NOME:\n- ${REGRA_ANTI_ABREVIACAO}\n\n${point}`
      )
    }
  }

  return systemMessage + `\n\nREGRA ABSOLUTA DE NOME:\n- ${REGRA_ANTI_ABREVIACAO}`
}

type WfResult = {
  type: string
  workflowId: string
  status: "updated" | "skipped" | "error"
  detail?: string
}

async function syncWorkflow(
  n8nClient: any,
  workflowId: string | null | undefined,
  wfType: string,
  empresaId: string,
  config: any | null
): Promise<WfResult> {
  if (!workflowId) {
    return { type: wfType, workflowId: "-", status: "skipped", detail: "Sem workflow ID" }
  }

  try {
    const wfResponse = await n8nClient.getWorkflow(workflowId)
    if (!wfResponse.success || !wfResponse.data) {
      return { type: wfType, workflowId, status: "error", detail: "Workflow nao encontrado no N8N" }
    }

    const wfData: any = wfResponse.data
    const nodes = Array.isArray(wfData?.nodes) ? wfData.nodes : []
    let updated = false

    for (const node of nodes) {
      const isAgentNode =
        node.type === "@n8n/n8n-nodes-langchain.agent" ||
        node.type === "n8n-nodes-langchain.agent" ||
        node.name?.toLowerCase().includes("agent")

      if (!isAgentNode || !node.parameters) continue

      if (wfType === "zapi-principal" && config) {
        const promptGerado = gerarPromptAgente(config as unknown as AgenteConfig)
        node.parameters.systemMessage = JSON.stringify(promptGerado, null, 2)
        updated = true
      } else {
        // Para follow-up, lembrete, ou zapi sem config: injetar regra
        if (node.parameters?.options?.systemMessage) {
          node.parameters.options.systemMessage = injectAntiAbreviacao(
            String(node.parameters.options.systemMessage)
          )
          updated = true
        } else if (node.parameters?.systemMessage) {
          node.parameters.systemMessage = injectAntiAbreviacao(
            String(node.parameters.systemMessage)
          )
          updated = true
        }
      }
    }

    if (updated) {
      await n8nClient.updateWorkflow(workflowId, { nodes })
      return {
        type: wfType,
        workflowId,
        status: "updated",
        detail: wfType === "zapi-principal" && config
          ? "Prompt regenerado completo"
          : "Regra anti-abreviacao injetada",
      }
    }

    return { type: wfType, workflowId, status: "skipped", detail: "No AI Agent nao encontrado" }
  } catch (err: any) {
    return { type: wfType, workflowId, status: "error", detail: err.message }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { isAdmin } = await verificarAdmin(req)
    if (!isAdmin) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    // 1. Listar todas as empresas
    const { data: empresas, error: errEmpresas } = await supabaseAdmin
      .from("empresas")
      .select("id, nome, schema")

    if (errEmpresas || !empresas) {
      return NextResponse.json(
        { error: "Erro ao listar empresas", details: errEmpresas?.message },
        { status: 500 }
      )
    }

    const { N8nClient } = await import("@/lib/n8n/client")
    const n8nClient = new N8nClient()

    const results: Array<{
      empresa: string
      empresaId: string
      workflows: WfResult[]
    }> = []

    let totalUpdated = 0
    let totalSkipped = 0
    let totalErrors = 0

    for (const empresa of empresas) {
      const empresaResult = {
        empresa: empresa.nome,
        empresaId: empresa.id,
        workflows: [] as WfResult[],
      }

      // Buscar workflow IDs de AMBAS as tabelas possíveis
      const { data: credenciais } = await supabaseAdmin
        .from("empresa_credenciais")
        .select("workflow_zapi_principal, workflow_follow_up, workflow_lembrete")
        .eq("empresa_id", empresa.id)
        .single()

      const { data: wfRows } = await supabaseAdmin
        .from("empresa_workflows")
        .select("workflow_id, workflow_type")
        .eq("empresa_id", empresa.id)

      // Mapear workflow IDs (credenciais tem prioridade)
      const zapiId =
        credenciais?.workflow_zapi_principal ||
        wfRows?.find((w: any) => w.workflow_type === "zapi-principal")?.workflow_id
      const followUpId =
        credenciais?.workflow_follow_up ||
        wfRows?.find((w: any) => w.workflow_type === "follow-up")?.workflow_id
      const lembreteId =
        credenciais?.workflow_lembrete ||
        wfRows?.find((w: any) => w.workflow_type === "lembrete")?.workflow_id

      if (!zapiId && !followUpId && !lembreteId) {
        empresaResult.workflows.push({
          type: "all",
          workflowId: "-",
          status: "skipped",
          detail: "Nenhum workflow encontrado em empresa_credenciais nem empresa_workflows",
        })
        totalSkipped++
        results.push(empresaResult)
        continue
      }

      // Buscar config do agente (para regenerar prompt completo do zapi)
      const { data: config } = await supabaseAdmin
        .from("empresa_agente_config")
        .select("*")
        .eq("empresa_id", empresa.id)
        .single()

      // Sync cada workflow
      for (const [wfId, wfType] of [
        [zapiId, "zapi-principal"],
        [followUpId, "follow-up"],
        [lembreteId, "lembrete"],
      ] as const) {
        if (!wfId) continue
        const result = await syncWorkflow(n8nClient, wfId, wfType, empresa.id, config)
        empresaResult.workflows.push(result)
        if (result.status === "updated") totalUpdated++
        else if (result.status === "skipped") totalSkipped++
        else totalErrors++
      }

      // Registrar timestamp
      await supabaseAdmin
        .from("empresa_agente_config")
        .update({ updated_at: new Date().toISOString() })
        .eq("empresa_id", empresa.id)

      results.push(empresaResult)
    }

    return NextResponse.json({
      success: true,
      summary: {
        total_empresas: empresas.length,
        total_updated: totalUpdated,
        total_skipped: totalSkipped,
        total_errors: totalErrors,
      },
      results,
    })
  } catch (error: any) {
    console.error("[sync-all-agents] Erro geral:", error)
    return NextResponse.json(
      { error: "Erro ao sincronizar agentes", details: error.message },
      { status: 500 }
    )
  }
}
