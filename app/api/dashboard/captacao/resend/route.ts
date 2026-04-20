import { NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"
import { createZApiServiceFromMessagingConfig } from "@/lib/helpers/zapi-messaging"
import { generatePersonalizedWelcome } from "@/lib/helpers/lead-welcome"
import { TenantChatHistoryService } from "@/lib/services/tenant-chat-history.service"

export async function POST(req: Request) {
  let unitPrefix: string
  try {
    const result = await getTenantFromRequest()
    unitPrefix = result.tenant
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const { leadId } = await req.json().catch(() => ({}))
  if (!leadId) return NextResponse.json({ error: "leadId obrigatório" }, { status: 400 })

  const supabase = createBiaSupabaseServerClient()
  const campaignTable = `${unitPrefix}_lead_campaigns`

  const { data: lead, error: fetchErr } = await supabase
    .from(campaignTable)
    .select("id, phone, name, campaign_name, form_data")
    .eq("id", leadId)
    .maybeSingle()

  if (fetchErr || !lead) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 })
  }

  if (!lead.phone) {
    return NextResponse.json({ error: "Lead sem telefone" }, { status: 400 })
  }

  const messagingConfig = await getMessagingConfigForTenant(unitPrefix)
  const { service, error: zapiError } = createZApiServiceFromMessagingConfig(messagingConfig)

  if (!service) {
    console.error(`[captacao/resend] Zapi não configurado para ${unitPrefix}:`, zapiError)
    return NextResponse.json({ error: "WhatsApp não configurado" }, { status: 503 })
  }

  const formFields: Array<{ name: string; values: string[] }> =
    lead.form_data?.field_data ?? []

  const message = await generatePersonalizedWelcome({
    name: lead.name ?? null,
    campaignName: lead.campaign_name ?? null,
    formFields,
  })

  const zapiResult = await service.sendTextMessage({
    phone: lead.phone,
    message,
    delayMessage: 1,
    delayTyping: 2,
  })

  if (!zapiResult.success) {
    return NextResponse.json({ error: "Falha ao enviar mensagem" }, { status: 502 })
  }

  await supabase
    .from(campaignTable)
    .update({ whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString() })
    .eq("id", leadId)

  try {
    const chatHistory = new TenantChatHistoryService(unitPrefix)
    await chatHistory.persistMessage({
      sessionId: lead.phone,
      role: "assistant",
      type: "assistant",
      content: message,
      source: "meta-lead-welcome-resend",
    })
  } catch (err) {
    console.warn("[captacao/resend] Failed to persist to chat history:", err)
  }

  return NextResponse.json({ ok: true })
}
