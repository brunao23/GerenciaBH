import { NextRequest, NextResponse } from "next/server"
import { N8nClient } from "@/lib/n8n/client"

export const dynamic = "force-dynamic"

type WorkflowAction = "activate" | "deactivate" | "duplicate" | "export" | "export_bulk"

function unwrapWorkflowList(raw: any): any[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw.data)) return raw.data
  if (Array.isArray(raw.workflows)) return raw.workflows
  return []
}

function unwrapSingleWorkflow(raw: any): any | null {
  if (!raw) return null
  if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) return raw.data
  if (raw.workflow && typeof raw.workflow === "object") return raw.workflow
  if (typeof raw === "object" && !Array.isArray(raw)) return raw
  return null
}

function normalizeTags(tags: any): string[] {
  if (!Array.isArray(tags)) return []
  return tags
    .map((tag) => {
      if (typeof tag === "string") return tag.trim()
      if (tag && typeof tag === "object" && typeof tag.name === "string") return tag.name.trim()
      return ""
    })
    .filter(Boolean)
}

/**
 * GET /api/admin/n8n/workflows
 * Lista workflows do N8N para o manager.
 */
export async function GET(_req: NextRequest) {
  try {
    const n8nClient = new N8nClient()
    const response = await n8nClient.listWorkflows()

    if (!response.success || !response.data) {
      return NextResponse.json(
        {
          error: "Falha ao listar workflows do N8N",
          details: response.error,
        },
        { status: 500 },
      )
    }

    const workflows = unwrapWorkflowList(response.data)
    const simplifiedWorkflows = workflows.map((w: any) => ({
      id: String(w?.id || ""),
      name: String(w?.name || ""),
      active: Boolean(w?.active),
      createdAt: w?.createdAt || w?.created_at || null,
      updatedAt: w?.updatedAt || w?.updated_at || null,
      tags: normalizeTags(w?.tags),
    }))

    return NextResponse.json({
      total: simplifiedWorkflows.length,
      workflows: simplifiedWorkflows,
    })
  } catch (error: any) {
    console.error("[Admin API] Erro ao listar workflows:", error)
    return NextResponse.json(
      {
        error: "Erro inesperado ao listar workflows",
        details: error?.message,
      },
      { status: 500 },
    )
  }
}

/**
 * POST /api/admin/n8n/workflows
 * Acoes: activate, deactivate, duplicate, export
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const action = String(body?.action || "").trim() as WorkflowAction
    const workflowId = String(body?.workflowId || "").trim()
    const workflowIds = Array.isArray(body?.workflowIds)
      ? body.workflowIds.map((id: any) => String(id || "").trim()).filter(Boolean)
      : []
    const customName = String(body?.name || "").trim()

    if (!action || !["activate", "deactivate", "duplicate", "export", "export_bulk"].includes(action)) {
      return NextResponse.json({ error: "Acao invalida" }, { status: 400 })
    }

    if (action !== "export_bulk" && !workflowId) {
      return NextResponse.json({ error: "workflowId e obrigatorio" }, { status: 400 })
    }

    const n8nClient = new N8nClient()

    if (action === "export_bulk") {
      if (workflowIds.length === 0) {
        return NextResponse.json({ error: "workflowIds e obrigatorio" }, { status: 400 })
      }

      const exported = await Promise.all(
        workflowIds.map(async (id: string) => {
          const res = await n8nClient.getWorkflow(id)
          if (!res.success || !res.data) {
            return { id, success: false, error: res.error || "Falha ao buscar workflow" }
          }

          const wf = unwrapSingleWorkflow(res.data)
          if (!wf) {
            return { id, success: false, error: "Resposta invalida do N8N para workflow" }
          }

          return {
            id,
            success: true,
            name: String(wf?.name || ""),
            workflow: wf,
          }
        }),
      )

      const okCount = exported.filter((item) => item.success).length
      return NextResponse.json({
        success: okCount > 0,
        action,
        total: workflowIds.length,
        exported: okCount,
        workflows: exported,
      })
    }

    if (action === "activate" || action === "deactivate") {
      const response = await n8nClient.toggleWorkflow(workflowId, action === "activate")
      if (!response.success) {
        return NextResponse.json(
          {
            error: `Falha ao ${action === "activate" ? "ativar" : "desativar"} workflow`,
            details: response.error,
          },
          { status: 502 },
        )
      }

      return NextResponse.json({
        success: true,
        action,
        workflowId,
      })
    }

    const workflowResponse = await n8nClient.getWorkflow(workflowId)
    if (!workflowResponse.success || !workflowResponse.data) {
      return NextResponse.json(
        { error: "Workflow nao encontrado no N8N", details: workflowResponse.error },
        { status: 404 },
      )
    }

    const workflow = unwrapSingleWorkflow(workflowResponse.data)
    if (!workflow) {
      return NextResponse.json({ error: "Resposta invalida do N8N para workflow" }, { status: 502 })
    }

    if (action === "export") {
      return NextResponse.json({
        success: true,
        action,
        workflow,
      })
    }

    const originalName = String(workflow?.name || "Workflow").trim() || "Workflow"
    const stamp = new Date().toISOString().slice(0, 19).replace("T", " ")
    const duplicatedName = customName || `${originalName} (Copia ${stamp})`

    const createPayload = {
      name: duplicatedName,
      active: false,
      nodes: Array.isArray(workflow?.nodes) ? workflow.nodes : [],
      connections: workflow?.connections || {},
      settings: workflow?.settings || {},
      staticData: workflow?.staticData || undefined,
      pinData: workflow?.pinData || undefined,
    }

    const duplicateResponse = await n8nClient.createWorkflow(createPayload as any)
    if (!duplicateResponse.success || !duplicateResponse.data) {
      return NextResponse.json(
        { error: "Falha ao duplicar workflow", details: duplicateResponse.error },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      action,
      workflow: duplicateResponse.data,
    })
  } catch (error: any) {
    console.error("[Admin API] Erro ao executar acao de workflow:", error)
    return NextResponse.json(
      {
        error: "Erro inesperado ao processar acao de workflow",
        details: error?.message,
      },
      { status: 500 },
    )
  }
}
