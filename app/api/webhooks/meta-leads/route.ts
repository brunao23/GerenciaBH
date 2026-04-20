import { NextRequest, NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"
import { createZApiServiceFromMessagingConfig } from "@/lib/helpers/zapi-messaging"
import { getTablesForTenant } from "@/lib/helpers/tenant"

const META_GRAPH_API = "https://graph.facebook.com/v20.0"

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

  const { unit_prefix, page_access_token, campaign_name, welcome_message } = config

  // 2. Fetch full lead data from Meta Graph API
  const leadData = await fetchMetaLead(leadgen_id, page_access_token)
  if (!leadData) {
    console.error(`[meta-leads] Failed to fetch leadgen_id=${leadgen_id}`)
    return
  }

  // 3. Extract fields
  const phone = extractField(leadData.field_data, ["phone_number", "phone", "telefone", "celular"])
  const name = extractField(leadData.field_data, ["full_name", "name", "nome", "first_name"])
  const email = extractField(leadData.field_data, ["email", "e-mail"])

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

  // 6. Send Zapi welcome message
  const messagingConfig = await getMessagingConfigForTenant(unit_prefix)
  const { service, error: zapiError } = createZApiServiceFromMessagingConfig(messagingConfig)

  if (!service) {
    console.error(`[meta-leads] Zapi not configured for ${unit_prefix}:`, zapiError)
    return
  }

  const message = buildMessage(welcome_message, { nome: name || "você", campanha: campaign_name })
  const zapiResult = await service.sendTextMessage({
    phone: formattedPhone,
    message,
    delayMessage: 1,
    delayTyping: 2,
  })

  // 7. Update sent status
  if (zapiResult.success && leadRecord?.id) {
    await supabase
      .from(campaignTable)
      .update({ whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString() })
      .eq("id", leadRecord.id)
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

function buildMessage(template: string, vars: Record<string, string>): string {
  let msg = template || "Oi {nome}! Vi que você se interessou. Como posso te ajudar?"
  for (const [key, val] of Object.entries(vars)) {
    msg = msg.replace(new RegExp(`\\{${key}\\}`, "g"), val)
  }
  return msg
}
