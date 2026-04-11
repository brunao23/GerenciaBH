import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { createTenantNotification } from "@/lib/services/tenant-notifications"
import { resolveTenantRegistryPrefix } from "@/lib/helpers/tenant-resolution"

type FeedbackBody = {
  subject?: string
  category?: string
  contact?: string
  message?: string
  page?: string
}

function clean(value: unknown, max: number) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

export async function POST(req: Request) {
  try {
    const { tenant, session } = await getTenantFromRequest()
    const body = (await req.json().catch(() => ({}))) as FeedbackBody

    const subject = clean(body.subject, 120) || "Feedback da plataforma"
    const category = clean(body.category, 40) || "geral"
    const contact = clean(body.contact, 120)
    const message = clean(body.message, 2000)
    const page = clean(body.page, 200)

    if (message.length < 10) {
      return NextResponse.json({ error: "Mensagem deve ter pelo menos 10 caracteres." }, { status: 400 })
    }

    const supabase = createBiaSupabaseServerClient()
    const nowIso = new Date().toISOString()

    const feedbackEntry = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
      created_at: nowIso,
      tenant,
      unit_name: session?.unitName || tenant,
      subject,
      category,
      contact,
      message,
      page,
      status: "new",
    }

    const registryTenant = await resolveTenantRegistryPrefix(tenant)
    const { data: unitData, error: unitFetchError } = await supabase
      .from("units_registry")
      .select("id, metadata")
      .eq("unit_prefix", registryTenant)
      .maybeSingle()

    if (unitFetchError) {
      console.error("[feedback] erro ao buscar unidade:", unitFetchError)
    }

    if (unitData?.id) {
      const metadata = unitData.metadata && typeof unitData.metadata === "object" ? unitData.metadata : {}
      const inbox = asArray((metadata as any).feedback_inbox)
      const nextInbox = [feedbackEntry, ...inbox].slice(0, 200)
      const nextMetadata = { ...(metadata as Record<string, unknown>), feedback_inbox: nextInbox }

      const { error: updateError } = await supabase.from("units_registry").update({ metadata: nextMetadata }).eq("id", unitData.id)

      if (updateError) {
        console.error("[feedback] erro ao salvar inbox:", updateError)
      }
    }

    await createTenantNotification({
      tenant,
      type: "message",
      title: "Feedback recebido",
      description: "Seu feedback foi registrado. Obrigado por ajudar a melhorar a plataforma.",
      sourceTable: "feedback",
      sourceId: feedbackEntry.id,
    }).catch((error) => {
      console.error("[feedback] erro ao criar notificacao de retorno:", error)
    })

    return NextResponse.json({
      success: true,
      message: "Feedback recebido com sucesso.",
    })
  } catch (error: any) {
    console.error("[feedback] erro:", error)
    return NextResponse.json({ error: error?.message || "Erro ao enviar feedback" }, { status: 500 })
  }
}
