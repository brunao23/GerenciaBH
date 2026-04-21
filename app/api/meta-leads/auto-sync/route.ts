import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"
import { createZApiServiceFromMessagingConfig } from "@/lib/helpers/zapi-messaging"
import { generatePersonalizedWelcome, sanitizeName } from "@/lib/helpers/lead-welcome"
import { TenantChatHistoryService } from "@/lib/services/tenant-chat-history.service"

export const runtime = "nodejs"
export const maxDuration = 60

const META_GRAPH_API = "https://graph.facebook.com/v20.0"
const PAGE_LIMIT = 100
const MAX_PAGES_PER_FORM = 5

type MetaLeadPageConfig = {
  unit_prefix: string
  page_id: string
  form_id: string | null
  page_access_token: string
  campaign_name: string | null
  delay_minutes: number | null
}

type MetaLead = {
  id: string
  created_time?: string
  field_data?: Array<{ name: string; values: string[] }>
}

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ""
  const digits = String(phone).replace(/\D/g, "")
  if (!digits) return ""
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if (digits.length === 12 && digits.startsWith("55")) return digits
  if (digits.length === 13 && digits.startsWith("55")) return digits
  return digits
}

function extractField(fieldData: Array<{ name: string; values: string[] }> | undefined, keys: string[]): string {
  if (!fieldData?.length) return ""
  for (const key of keys) {
    const found = fieldData.find((x) => x.name.toLowerCase() === key.toLowerCase())
    if (found?.values?.[0]) return found.values[0]
  }
  return ""
}

async function fetchLeadsPage(url: string): Promise<{ data: MetaLead[]; next?: string }> {
  const res = await fetch(url)
  if (!res.ok) {
    const txt = await res.text().catch(() => "unknown error")
    throw new Error(`Meta API error: ${txt}`)
  }

  const json = await res.json()
  return {
    data: (json?.data ?? []) as MetaLead[],
    next: json?.paging?.next ?? undefined,
  }
}

async function fetchRecentLeads(formId: string, accessToken: string, minDateIso: string): Promise<MetaLead[]> {
  const out: MetaLead[] = []
  let url = `${META_GRAPH_API}/${formId}/leads?fields=id,created_time,field_data&limit=${PAGE_LIMIT}&access_token=${encodeURIComponent(accessToken)}`
  let pages = 0
  const minTs = Date.parse(minDateIso) || 0

  while (url && pages < MAX_PAGES_PER_FORM) {
    pages++
    const page = await fetchLeadsPage(url)
    if (!page.data.length) break

    let reachedOldLead = false
    for (const lead of page.data) {
      const createdTs = Date.parse(lead.created_time || "") || Date.now()
      if (createdTs < minTs) {
        reachedOldLead = true
        continue
      }
      out.push(lead)
    }

    if (reachedOldLead) break
    url = page.next ?? ""
  }

  return out
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createBiaSupabaseServerClient()
  const lookbackMinutes = Number(process.env.META_AUTO_SYNC_LOOKBACK_MINUTES || "240")
  const minDateIso = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString()

  const { data: configs, error: cfgError } = await supabase
    .from("meta_lead_pages")
    .select("unit_prefix, page_id, form_id, page_access_token, campaign_name, delay_minutes")
    .eq("is_active", true)

  if (cfgError) {
    console.error("[meta-leads/auto-sync] Error loading configs:", cfgError)
    return NextResponse.json({ error: "Erro ao carregar configuracoes do Meta" }, { status: 500 })
  }

  const validConfigs = (configs ?? []).filter((cfg: MetaLeadPageConfig) => cfg.form_id && cfg.page_access_token)
  if (!validConfigs.length) {
    return NextResponse.json({ ok: true, processedForms: 0, imported: 0, skipped: 0, sent: 0, queued: 0, failed: 0 })
  }

  let processedForms = 0
  let imported = 0
  let skipped = 0
  let sent = 0
  let queued = 0
  let failed = 0

  for (const cfg of validConfigs as MetaLeadPageConfig[]) {
    processedForms++
    const campaignTable = `${cfg.unit_prefix}_lead_campaigns`
    const formId = cfg.form_id as string

    let recentLeads: MetaLead[] = []
    try {
      recentLeads = await fetchRecentLeads(formId, cfg.page_access_token, minDateIso)
    } catch (error) {
      failed++
      console.error(`[meta-leads/auto-sync] Failed fetch for ${cfg.unit_prefix} form ${formId}:`, error)
      continue
    }

    if (!recentLeads.length) continue

    for (const lead of recentLeads) {
      try {
        const fieldData = lead.field_data ?? []
        const phoneRaw = extractField(fieldData, ["phone_number", "phone", "telefone", "celular"])
        const phone = normalizePhone(phoneRaw)
        if (!phone) {
          skipped++
          continue
        }

        const nameRaw = extractField(fieldData, ["full_name", "name", "nome", "first_name"])
        const email = extractField(fieldData, ["email", "e-mail"])
        const name = sanitizeName(nameRaw)

        const payload = {
          leadgen_id: lead.id,
          phone,
          name: name || null,
          email: email || null,
          source: "meta_lead",
          campaign_name: cfg.campaign_name || null,
          page_id: cfg.page_id || null,
          form_id: cfg.form_id || null,
          form_data: { field_data: fieldData },
          whatsapp_sent: false,
          created_at: lead.created_time ?? new Date().toISOString(),
        }

        const { data: insertedLead, error: insertError } = await supabase
          .from(campaignTable)
          .insert(payload, { onConflict: "leadgen_id", ignoreDuplicates: true })
          .select("id")
          .maybeSingle()

        if (insertError) {
          failed++
          console.error(`[meta-leads/auto-sync] Failed insert for ${cfg.unit_prefix}:`, insertError)
          continue
        }

        if (!insertedLead?.id) {
          skipped++
          continue
        }

        imported++

        const message = await generatePersonalizedWelcome({
          name: name || null,
          campaignName: cfg.campaign_name || null,
          formFields: fieldData,
        })

        const delayMins = Number(cfg.delay_minutes) || 0
        if (delayMins > 0) {
          const sendAt = new Date(Date.now() + delayMins * 60 * 1000).toISOString()
          const { error: queueError } = await supabase.from("meta_welcome_queue").insert({
            unit_prefix: cfg.unit_prefix,
            phone,
            message,
            campaign_table: campaignTable,
            lead_record_id: insertedLead.id,
            send_at: sendAt,
          })

          if (queueError) {
            failed++
            console.error(`[meta-leads/auto-sync] Failed queue for ${cfg.unit_prefix}:`, queueError)
          } else {
            queued++
          }
          continue
        }

        const messagingConfig = await getMessagingConfigForTenant(cfg.unit_prefix)
        const { service, error: zapiError } = createZApiServiceFromMessagingConfig(messagingConfig)
        if (!service) {
          failed++
          console.error(`[meta-leads/auto-sync] Z-API not configured for ${cfg.unit_prefix}:`, zapiError)
          continue
        }

        const sentResult = await service.sendTextMessage({
          phone,
          message,
          delayMessage: 1,
          delayTyping: 2,
        })

        if (!sentResult.success) {
          failed++
          continue
        }

        sent++
        await supabase
          .from(campaignTable)
          .update({ whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString() })
          .eq("id", insertedLead.id)

        try {
          const chatHistory = new TenantChatHistoryService(cfg.unit_prefix)
          await chatHistory.persistMessage({
            sessionId: phone,
            role: "assistant",
            type: "assistant",
            content: message,
            source: "meta-lead-welcome",
          })
        } catch (error) {
          console.warn("[meta-leads/auto-sync] Failed persist to chat history:", error)
        }
      } catch (error) {
        failed++
        console.error("[meta-leads/auto-sync] Lead processing error:", error)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    processedForms,
    imported,
    skipped,
    sent,
    queued,
    failed,
    lookbackMinutes,
  })
}
