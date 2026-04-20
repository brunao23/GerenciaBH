import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"
import { createZApiServiceFromMessagingConfig } from "@/lib/helpers/zapi-messaging"
import { TenantChatHistoryService } from "@/lib/services/tenant-chat-history.service"

export const runtime = "nodejs"
export const maxDuration = 60

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
      const messagingConfig = await getMessagingConfigForTenant(item.unit_prefix)
      const { service, error: zapiError } = createZApiServiceFromMessagingConfig(messagingConfig)

      if (!service) {
        await supabase
          .from("meta_welcome_queue")
          .update({ failed_at: new Date().toISOString(), error: zapiError || "ZApi não configurado" })
          .eq("id", item.id)
        failed++
        continue
      }

      const zapiResult = await service.sendTextMessage({
        phone: item.phone,
        message: item.message,
        delayMessage: 1,
        delayTyping: 2,
      })

      if (zapiResult.success) {
        await supabase
          .from("meta_welcome_queue")
          .update({ sent_at: new Date().toISOString() })
          .eq("id", item.id)

        if (item.lead_record_id && item.campaign_table) {
          await supabase
            .from(item.campaign_table)
            .update({ whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString() })
            .eq("id", item.lead_record_id)
        }

        try {
          const chatHistory = new TenantChatHistoryService(item.unit_prefix)
          await chatHistory.persistMessage({
            sessionId: item.phone,
            role: "assistant",
            type: "assistant",
            content: item.message,
            source: "meta-lead-welcome",
          })
        } catch (err) {
          console.warn("[meta-welcome-cron] Falha ao persistir histórico:", err)
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
