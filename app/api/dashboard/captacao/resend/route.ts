import { NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"
import { createZApiServiceFromMessagingConfig } from "@/lib/helpers/zapi-messaging"
import { getNativeAgentConfigForTenant } from "@/lib/helpers/native-agent-config"
import { generatePersonalizedWelcome } from "@/lib/helpers/lead-welcome"
import { AgentTaskQueueService } from "@/lib/services/agent-task-queue.service"
import {
  normalizePhoneNumber,
  normalizeSessionId,
  TenantChatHistoryService,
} from "@/lib/services/tenant-chat-history.service"

function buildFormContextSnippet(formFields: Array<{ name: string; values: string[] }>): string {
  if (!Array.isArray(formFields) || formFields.length === 0) return ""
  const blocked = new Set(["phone_number", "phone", "telefone", "celular", "email", "e-mail"])
  const parts: string[] = []
  for (const field of formFields) {
    const key = String(field?.name || "").trim()
    const keyNormalized = key.toLowerCase()
    if (!key || blocked.has(keyNormalized)) continue
    const value = String(field?.values?.[0] || "").replace(/\s+/g, " ").trim()
    if (!value) continue
    parts.push(`${key}: ${value}`)
    if (parts.length >= 4) break
  }
  return parts.join(" | ").slice(0, 320)
}

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

  const nativeAgentConfig = await getNativeAgentConfigForTenant(unitPrefix)
  const message = await generatePersonalizedWelcome({
    name: lead.name ?? null,
    campaignName: lead.campaign_name ?? null,
    formFields,
    companyName: nativeAgentConfig?.unitName || null,
    promptBase: nativeAgentConfig?.promptBase,
    geminiApiKey: nativeAgentConfig?.geminiApiKey,
    geminiModel: nativeAgentConfig?.geminiModel,
    samplingTemperature: nativeAgentConfig?.samplingTemperature,
    samplingTopP: nativeAgentConfig?.samplingTopP,
    samplingTopK: nativeAgentConfig?.samplingTopK,
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
    const normalizedSessionId = normalizeSessionId(lead.phone)
    const normalizedPhone = normalizePhoneNumber(lead.phone)
    const profilePicField =
      formFields.find((field) =>
        ["profile_pic", "profile_picture", "foto", "avatar", "picture"].includes(String(field?.name || "").toLowerCase()),
      )?.values?.[0] ?? null

    const chatHistory = new TenantChatHistoryService(unitPrefix)
    await chatHistory.persistMessage({
      sessionId: normalizedSessionId,
      role: "assistant",
      type: "assistant",
      content: message,
      source: "meta-lead-welcome-resend",
      additional: {
        sender_type: "ia",
        channel: "whatsapp",
        lead_origin: "meta_lead",
        lead_name: lead.name ?? null,
        contact_name: lead.name ?? null,
        lead_profile_pic: profilePicField || null,
        form_data: { field_data: formFields },
      },
    })

    if (normalizedSessionId && normalizedPhone) {
      const enqueue = await new AgentTaskQueueService().enqueueFollowupSequence({
        tenant: unitPrefix,
        sessionId: normalizedSessionId,
        phone: normalizedPhone,
        leadName: lead.name ?? undefined,
        lastUserMessage: buildFormContextSnippet(formFields) || undefined,
        lastAgentMessage: String(message || "").trim() || undefined,
      })
      if (!enqueue.ok) {
        console.warn("[captacao/resend] Failed to enqueue followup sequence:", enqueue.error)
      }
    }
  } catch (err) {
    console.warn("[captacao/resend] Failed to persist to chat history:", err)
  }

  return NextResponse.json({ ok: true })
}
