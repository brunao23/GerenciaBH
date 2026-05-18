import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import {
  getNativeAgentConfigForTenant,
  updateNativeAgentConfigForTenant,
  validateNativeAgentConfig,
} from "@/lib/helpers/native-agent-config"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { runAdminPromptStudio } from "@/lib/services/admin-prompt-studio.service"
import { notifyAdminUpdate } from "@/lib/services/tenant-notifications"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

async function requireAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) return null

  const session = await verifyToken(token)
  if (!session?.isAdmin) return null
  return session
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin()
    if (!session) return jsonError("Acesso negado", 403)

    const body = await req.json().catch(() => ({}))
    const tenant = normalizeTenant(body?.tenant)
    const instruction = String(body?.instruction || "").trim()
    const maxMessages = Number(body?.maxMessages || 260)

    if (!tenant) return jsonError("Unidade invalida", 400)
    if (!instruction) return jsonError("Informe o pedido para os multiagentes", 400)

    const result = await runAdminPromptStudio({
      tenant,
      instruction,
      maxMessages,
    })

    return NextResponse.json({ ok: true, result })
  } catch (error: any) {
    console.error("[admin][prompt-studio] erro ao executar multiagentes:", error)
    return jsonError(error?.message || "Falha ao executar multiagentes", 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAdmin()
    if (!session) return jsonError("Acesso negado", 403)

    const body = await req.json().catch(() => ({}))
    const tenant = normalizeTenant(body?.tenant)
    const promptBase = String(body?.promptBase || "").trim()

    if (!tenant) return jsonError("Unidade invalida", 400)
    if (promptBase.length < 300) {
      return jsonError("O prompt gerado esta curto demais para aplicar com seguranca", 400)
    }

    const current = await getNativeAgentConfigForTenant(tenant)
    if (!current) return jsonError("Configuracao do agente nao encontrada", 404)

    const nextConfig = {
      ...current,
      promptBase,
    }

    const validationError = validateNativeAgentConfig(nextConfig)
    if (validationError) return jsonError(validationError, 400)

    await updateNativeAgentConfigForTenant(tenant, nextConfig)
    await notifyAdminUpdate({
      tenant,
      title: "Prompt base atualizado",
      message: "O prompt base da unidade foi atualizado pelo Prompt Studio IA.",
      sourceId: `prompt-studio-${Date.now()}`,
    }).catch((notifyError) => {
      console.error("[admin][prompt-studio] erro ao notificar unidade:", notifyError)
    })

    return NextResponse.json({ ok: true, tenant })
  } catch (error: any) {
    console.error("[admin][prompt-studio] erro ao aplicar prompt:", error)
    return jsonError(error?.message || "Falha ao aplicar prompt", 500)
  }
}
