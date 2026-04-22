import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"
import { createZApiServiceFromMessagingConfig } from "@/lib/helpers/zapi-messaging"
import { AgentTaskQueueService } from "@/lib/services/agent-task-queue.service"
import {
  normalizePhoneNumber,
  normalizeSessionId,
  TenantChatHistoryService,
} from "@/lib/services/tenant-chat-history.service"

export const runtime = "nodejs"
export const maxDuration = 60

function extractFieldFromFormData(formData: any, keys: string[]): string {
  const fieldData = Array.isArray(formData?.field_data) ? formData.field_data : []
  for (const key of keys) {
    const found = fieldData.find((field: any) => String(field?.name || "").toLowerCase() === key.toLowerCase())
    const value = String(found?.values?.[0] || "").trim()
    if (value) return value
  }
  return ""
}

function buildFormContextSnippet(formData: any): string {
  const fieldData = Array.isArray(formData?.field_data) ? formData.field_data : []
  if (!fieldData.length) return ""

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

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createBiaSupabaseServerClient()

  const { data: pending, error } = await supabase
    .from("meta_welcome_queue")
    .select("*")
    .is("sent_at", null)
    .is("failed_at", null)
    .lte("send_at", new Date().toISOString())
    .order("send_at", { ascending: true })
    .limit(30)

  if (error) {
    console.error("[meta-welcome-cron] Erro ao buscar fila:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!pending?.length) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0 })
  }

  let sent = 0
  let failed = 0

  for (const item of pending) {
    try {
      // Dedup: skip if lead already started a conversation during the delay window
      try {
        const chatHistory = new TenantChatHistoryService(item.unit_prefix)
        const existingMessages = await chatHistory.loadConversation(normalizeSessionId(item.phone), 1)
        if (existingMessages && existingMessages.length > 0) {
          await supabase
            .from("meta_welcome_queue")
            .update({ sent_at: new Date().toISOString(), error: "skipped:existing_conversation" })
            .eq("id", item.id)
          console.log(`[meta-welcome-cron] ⏭️ Skip ${item.phone} — conversa existente`)
          sent++
          continue
        }
      } catch (dedupErr) {
        console.warn("[meta-welcome-cron] Falha ao verificar dedup:", dedupErr)
      }

      const messagingConfig = await getMessagingConfigForTenant(item.unit_prefix)
      const { service, error: zapiError } = createZApiServiceFromMessagingConfig(messagingConfig)

      if (!service) {
        await supabase
          .from("meta_welcome_queue")
          .update({ failed_at: new Date().toISOString(), error: zapiError || "ZApi nao configurado" })
          .eq("id", item.id)
        failed++
        continue
      }

      const zapiResult = await service.sendTextMessage({
        phone: item.phone,
        message: item.message,
        delayMessage: 3,
        delayTyping: 5,
      })

      if (zapiResult.success) {
        let leadName: string | null = null
        let leadProfilePic: string | null = null
        let leadFormData: any = null

        if (item.lead_record_id && item.campaign_table) {
          const { data: leadRow } = await supabase
            .from(item.campaign_table)
            .select("name, form_data")
            .eq("id", item.lead_record_id)
            .maybeSingle()

          leadName = String(leadRow?.name || "").trim() || null
          leadFormData = leadRow?.form_data || null
          leadProfilePic =
            extractFieldFromFormData(leadRow?.form_data, [
              "profile_pic",
              "profile_picture",
              "foto",
              "avatar",
              "picture",
            ]) || null
        }

        await supabase.from("meta_welcome_queue").update({ sent_at: new Date().toISOString() }).eq("id", item.id)

        if (item.lead_record_id && item.campaign_table) {
          await supabase
            .from(item.campaign_table)
            .update({ whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString() })
            .eq("id", item.lead_record_id)
        }

        try {
          const normalizedSessionId = normalizeSessionId(item.phone)
          const normalizedPhone = normalizePhoneNumber(item.phone)

          const chatHistory = new TenantChatHistoryService(item.unit_prefix)
          await chatHistory.persistMessage({
            sessionId: normalizedSessionId,
            role: "assistant",
            type: "assistant",
            content: item.message,
            source: "meta-lead-welcome",
            additional: {
              sender_type: "ia",
              channel: "whatsapp",
              lead_origin: "meta_lead",
              lead_name: leadName,
              contact_name: leadName,
              lead_profile_pic: leadProfilePic,
            },
          })

          if (normalizedSessionId && normalizedPhone) {
            const enqueue = await new AgentTaskQueueService().enqueueFollowupSequence({
              tenant: item.unit_prefix,
              sessionId: normalizedSessionId,
              phone: normalizedPhone,
              leadName: leadName || undefined,
              lastUserMessage: buildFormContextSnippet(leadFormData) || undefined,
              lastAgentMessage: String(item.message || "").trim() || undefined,
            })
            if (!enqueue.ok) {
              console.warn("[meta-welcome-cron] Falha ao enfileirar followups:", enqueue.error)
            }
          }
        } catch (err) {
          console.warn("[meta-welcome-cron] Falha ao persistir historico:", err)
        }

        sent++
      } else {
        await supabase
          .from("meta_welcome_queue")
          .update({ failed_at: new Date().toISOString(), error: "ZApi send retornou erro" })
          .eq("id", item.id)
        failed++
      }
    } catch (err: any) {
      console.error("[meta-welcome-cron] Erro ao processar item:", item.id, err)
      await supabase
        .from("meta_welcome_queue")
        .update({ failed_at: new Date().toISOString(), error: String(err?.message || err) })
        .eq("id", item.id)
      failed++
    }
  }

  console.log(`[meta-welcome-cron] sent=${sent} failed=${failed}`)
  return NextResponse.json({ processed: pending.length, sent, failed })
}

