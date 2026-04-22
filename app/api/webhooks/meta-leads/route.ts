import { NextRequest, NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"
import { createZApiServiceFromMessagingConfig } from "@/lib/helpers/zapi-messaging"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { getNativeAgentConfigForTenant } from "@/lib/helpers/native-agent-config"
import { generatePersonalizedWelcome, sanitizeName } from "@/lib/helpers/lead-welcome"
import { AgentTaskQueueService } from "@/lib/services/agent-task-queue.service"
import {
  normalizePhoneNumber,
  normalizeSessionId,
  TenantChatHistoryService,
} from "@/lib/services/tenant-chat-history.service"
import { sendCAPIEvent, getCAPIConfig } from "@/lib/services/meta-capi.service"

const META_GRAPH_API = "https://graph.facebook.com/v20.0"

function buildFormContextSnippet(fieldData: Array<{ name: string; values: string[] }> | undefined): string {
  if (!Array.isArray(fieldData) || fieldData.length === 0) return ""
  const blocked = new Set(["phone_number", "phone", "telefone", "celular", "email", "e-mail"])
  const parts: string[] = []
  for (const field of fieldData) {
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

async function enqueueLeadFollowups(input: {
  tenant: string
  phone: string
  leadName?: string | null
  welcomeMessage: string
  formFields?: Array<{ name: string; values: string[] }>
}) {
  const phone = normalizePhoneNumber(input.phone)
  const sessionId = normalizeSessionId(input.phone)
  if (!phone || !sessionId) return

  const queue = new AgentTaskQueueService()
  const lastUserMessage = buildFormContextSnippet(input.formFields)

  const enqueue = await queue.enqueueFollowupSequence({
    tenant: input.tenant,
    sessionId,
    phone,
    leadName: input.leadName || undefined,
    lastUserMessage: lastUserMessage || undefined,
    lastAgentMessage: String(input.welcomeMessage || "").trim(),
  })

  if (!enqueue.ok) {
    console.warn("[meta-leads] failed to enqueue followup sequence:", enqueue.error)
  }
}

// Meta webhook verification
export async function GET(req: NextRequest) {
  const verifyToken = (process.env.META_WEBHOOK_VERIFY_TOKEN || "gerencia_meta_webhook_2026").trim()
  const mode = req.nextUrl.searchParams.get("hub.mode")
  const token = req.nextUrl.searchParams.get("hub.verify_token")
  const challenge = req.nextUrl.searchParams.get("hub.challenge")

  console.log("[meta-leads verify]", { mode, token, verifyToken, match: token === verifyToken })

  if (mode === "subscribe" && token === verifyToken) {
    return new Response(challenge ?? "", { status: 200 })
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 })
}

// Receive leads from Meta Lead Ads
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))

    if (body.object !== "page") {
      return NextResponse.json({ status: "ignored" })
    }

    const entries: any[] = body.entry ?? []
    for (const entry of entries) {
      const changes: any[] = entry.changes ?? []
      for (const change of changes) {
        if (change.field !== "leadgen") continue
        const { leadgen_id, page_id, form_id, ad_id } = change.value ?? {}
        if (leadgen_id && page_id) {
          processLead({ leadgen_id, page_id, form_id: form_id ?? null, ad_id: ad_id ?? null }).catch((err) =>
            console.error("[meta-leads] processLead error:", err)
          )
        }
      }
    }

    return NextResponse.json({ status: "ok" })
  } catch (error: any) {
    console.error("[meta-leads webhook] Error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

async function processLead({
  leadgen_id,
  page_id,
  form_id,
  ad_id,
}: {
  leadgen_id: string
  page_id: string
  form_id: string | null
  ad_id: string | null
}) {
  const supabase = createBiaSupabaseServerClient()

  // 1. Find tenant config for this page_id
  const { data: configs } = await supabase
    .from("meta_lead_pages")
    .select("*")
    .eq("page_id", page_id)
    .eq("is_active", true)

  if (!configs?.length) {
    console.warn(`[meta-leads] No active config for page_id=${page_id}`)
    return
  }

  // Match by form_id if specified
  const config =
    (form_id ? configs.find((c) => c.form_id === form_id) : null) ?? configs[0]

  const { unit_prefix, page_access_token, campaign_name, welcome_message, delay_minutes, pixel_id, pixel_access_token, auto_welcome_enabled } = config as any

  // 2. Fetch full lead data from Meta Graph API
  const leadData = await fetchMetaLead(leadgen_id, page_access_token)
  if (!leadData) {
    console.error(`[meta-leads] Failed to fetch leadgen_id=${leadgen_id}`)
    return
  }

  // 3. Extract fields
  const phone = extractField(leadData.field_data, ["phone_number", "phone", "telefone", "celular"])
  const rawName = extractField(leadData.field_data, ["full_name", "name", "nome", "first_name"])
  const name = sanitizeName(rawName)
  const email = extractField(leadData.field_data, ["email", "e-mail"])
  const profilePic = extractField(leadData.field_data, ["profile_pic", "profile_picture", "foto", "avatar", "picture"])

  if (!phone) {
    console.warn(`[meta-leads] Lead ${leadgen_id} has no phone number`)
    return
  }

  const cleanPhone = phone.replace(/\D/g, "")
  const formattedPhone =
    cleanPhone.length >= 10 && cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone

  const tables = getTablesForTenant(unit_prefix)
  const campaignTable = `${unit_prefix}_lead_campaigns`

  // 4. Insert into lead_campaigns (idempotent by leadgen_id)
  const { data: leadRecord } = await supabase
    .from(campaignTable)
    .upsert(
      {
        leadgen_id,
        phone: formattedPhone,
        name: name || null,
        email: email || null,
        source: "meta_lead",
        campaign_name,
        page_id,
        form_id,
        ad_id,
        form_data: { field_data: leadData.field_data ?? [] },
        whatsapp_sent: false,
      },
      { onConflict: "leadgen_id" }
    )
    .select("id")
    .maybeSingle()

  // 5. Upsert CRM lead status (entrada)
  const leadId = `${formattedPhone}@s.whatsapp.net`
  await supabase.from(tables.crmLeadStatus).upsert(
    { lead_id: leadId, status: "entrada" },
    { onConflict: "lead_id", ignoreDuplicates: true }
  )

  // 5b. Disparar evento Lead para Meta CAPI (non-blocking)
  const capiConfig = pixel_id
    ? { pixelId: pixel_id, accessToken: pixel_access_token || page_access_token }
    : await getCAPIConfig(unit_prefix)

  if (capiConfig) {
    sendCAPIEvent({
      ...capiConfig,
      eventName: "Lead",
      eventId: `lead_${leadgen_id}`,
      leadId,
      userData: { phone: formattedPhone, email: email || undefined, firstName: name || undefined },
      customData: { campaign_name: campaign_name || undefined },
      unitPrefix: unit_prefix,
    }).catch((err) => console.warn("[meta-leads] CAPI Lead error:", err))
  }

  if (auto_welcome_enabled === false) {
    console.log(`[meta-leads] auto welcome disabled for ${unit_prefix} (${page_id})`)
    return
  }

  // 6a. Phone-level dedup: skip if this phone already received a broadcast or has an existing conversation
  const { data: alreadySentRecord } = await supabase
    .from(campaignTable)
    .select("id")
    .eq("phone", formattedPhone)
    .eq("whatsapp_sent", true)
    .limit(1)
    .maybeSingle()

  if (alreadySentRecord) {
    console.log(`[meta-leads] ⏭️ Skip broadcast ${formattedPhone} — already sent (phone dedup)`)
    return
  }

  try {
    const chatHistory = new TenantChatHistoryService(unit_prefix)
    const existingMessages = await chatHistory.loadConversation(normalizeSessionId(formattedPhone), 1)
    if (existingMessages && existingMessages.length > 0) {
      console.log(`[meta-leads] ⏭️ Skip broadcast ${formattedPhone} — existing conversation found`)
      return
    }
  } catch (err) {
    console.warn("[meta-leads] Failed to check chat history for phone dedup:", err)
  }

  // 6. Generate welcome message
  const nativeAgentConfig = await getNativeAgentConfigForTenant(unit_prefix)
  const message = await generatePersonalizedWelcome({
    name: name || null,
    campaignName: campaign_name || null,
    formFields: (leadData.field_data ?? []) as Array<{ name: string; values: string[] }>,
    companyName: nativeAgentConfig?.unitName || null,
    promptBase: nativeAgentConfig?.promptBase,
    geminiApiKey: nativeAgentConfig?.geminiApiKey,
    geminiModel: nativeAgentConfig?.geminiModel,
    samplingTemperature: nativeAgentConfig?.samplingTemperature,
    samplingTopP: nativeAgentConfig?.samplingTopP,
    samplingTopK: nativeAgentConfig?.samplingTopK,
  })

  if (!message) {
    console.warn(`[meta-leads] ⏭️ Skip broadcast ${formattedPhone} — LLM não gerou mensagem`)
    return
  }

  const delayMins = Number(delay_minutes) || 0

  // 7a. Delay configurado → enfileirar para envio posterior
  if (delayMins > 0) {
    const sendAt = new Date(Date.now() + delayMins * 60 * 1000).toISOString()
    const { error: queueError } = await supabase.from("meta_welcome_queue").insert({
      unit_prefix,
      phone: formattedPhone,
      message,
      campaign_table: campaignTable,
      lead_record_id: leadRecord?.id ?? null,
      send_at: sendAt,
    })
    if (queueError) {
      console.error(`[meta-leads] Erro ao enfileirar mensagem:`, queueError)
    } else {
      console.log(`[meta-leads] ⏰ ${unit_prefix} | ${formattedPhone} | delay=${delayMins}min | sendAt=${sendAt}`)
    }
    return
  }

  // 7b. Sem delay → enviar imediatamente
  const messagingConfig = await getMessagingConfigForTenant(unit_prefix)
  const { service, error: zapiError } = createZApiServiceFromMessagingConfig(messagingConfig)

  if (!service) {
    console.error(`[meta-leads] Zapi not configured for ${unit_prefix}:`, zapiError)
    return
  }

  const zapiResult = await service.sendTextMessage({
    phone: formattedPhone,
    message,
    delayMessage: 1,
    delayTyping: 2,
  })

  if (zapiResult.success) {
    if (leadRecord?.id) {
      await supabase
        .from(campaignTable)
        .update({ whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString() })
        .eq("id", leadRecord.id)
    }

    try {
      const chatHistory = new TenantChatHistoryService(unit_prefix)
      await chatHistory.persistMessage({
        sessionId: normalizeSessionId(formattedPhone),
        role: "assistant",
        type: "assistant",
        content: message,
        source: "meta-lead-welcome",
        additional: {
          sender_type: "ia",
          channel: "whatsapp",
          lead_origin: "meta_lead",
          lead_name: name || null,
          contact_name: name || null,
          lead_profile_pic: profilePic || null,
          form_data: { field_data: leadData.field_data ?? [] },
        },
      })
    } catch (err) {
      console.warn("[meta-leads] Failed to persist welcome to chat history:", err)
    }

    await enqueueLeadFollowups({
      tenant: unit_prefix,
      phone: formattedPhone,
      leadName: name || null,
      welcomeMessage: message,
      formFields: (leadData.field_data ?? []) as Array<{ name: string; values: string[] }>,
    }).catch((err) => {
      console.warn("[meta-leads] Failed to enqueue followup sequence:", err)
    })
  }

  console.log(
    `[meta-leads] ✅ ${unit_prefix} | ${formattedPhone} | ${campaign_name} | zapi=${zapiResult.success}`
  )
}

async function fetchMetaLead(leadgenId: string, accessToken: string) {
  try {
    const res = await fetch(
      `${META_GRAPH_API}/${leadgenId}?fields=id,created_time,field_data&access_token=${accessToken}`
    )
    if (!res.ok) {
      const err = await res.text()
      console.error("[meta-leads] Graph API error:", err)
      return null
    }
    return res.json()
  } catch {
    return null
  }
}

function extractField(
  fieldData: Array<{ name: string; values: string[] }> | undefined,
  keys: string[]
): string {
  if (!fieldData) return ""
  for (const key of keys) {
    const field = fieldData.find((f) => f.name.toLowerCase() === key.toLowerCase())
    if (field?.values?.[0]) return field.values[0]
  }
  return ""
}
