import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"

type NotificationTone = "message" | "error" | "agendamento" | "followup" | "victory"

interface TenantNotificationInput {
  tenant: string
  title: string
  description: string
  type?: NotificationTone
  sourceTable?: string
  sourceId?: string | null
  sessionId?: string | null
  numero?: string | null
}

interface TenantNotificationResult {
  ok: boolean
  error?: string
}

function cleanText(value: string, max: number) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

function isUnknownColumnError(error: any) {
  const code = String(error?.code || "")
  const message = String(error?.message || "").toLowerCase()
  return code === "42703" || (message.includes("column") && message.includes("does not exist"))
}

export async function createTenantNotification(input: TenantNotificationInput): Promise<TenantNotificationResult> {
  try {
    const tenant = normalizeTenant(input.tenant || "")
    if (!tenant) {
      return { ok: false, error: "Tenant invalido" }
    }

    const title = cleanText(input.title, 140)
    const description = cleanText(input.description, 800)

    if (!title || !description) {
      return { ok: false, error: "Titulo e descricao sao obrigatorios" }
    }

    const table = `${tenant}_notifications`
    const nowIso = new Date().toISOString()
    const supabase = createBiaSupabaseServerClient()

    const basePayload = {
      type: input.type || "message",
      title,
      read: false,
      created_at: nowIso,
      source_table: input.sourceTable || null,
      source_id: input.sourceId || null,
      session_id: input.sessionId || null,
      numero: input.numero || null,
    }

    const payloads = [
      { ...basePayload, description },
      { ...basePayload, message: description },
      { ...basePayload, description, message: description },
      basePayload,
    ]

    let lastError: any = null
    for (const payload of payloads) {
      const { error } = await supabase.from(table).insert(payload)
      if (!error) {
        return { ok: true }
      }

      lastError = error
      if (!isUnknownColumnError(error)) {
        return { ok: false, error: error.message || "Falha ao criar notificacao" }
      }
    }

    return { ok: false, error: lastError?.message || "Falha ao criar notificacao" }
  } catch (error: any) {
    return { ok: false, error: error?.message || "Falha ao criar notificacao" }
  }
}

interface AdminUpdateInput {
  tenant: string
  title: string
  message: string
  sourceId?: string
}

export async function notifyAdminUpdate(input: AdminUpdateInput): Promise<TenantNotificationResult> {
  return createTenantNotification({
    tenant: input.tenant,
    type: "message",
    title: input.title,
    description: input.message,
    sourceTable: "admin_update",
    sourceId: input.sourceId || null,
  })
}
