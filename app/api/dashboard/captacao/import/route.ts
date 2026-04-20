import { NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

const META_GRAPH_API = "https://graph.facebook.com/v20.0"
const PAGE_SIZE = 100

async function fetchLeadsPage(url: string): Promise<{ data: any[]; next?: string }> {
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Meta API error: ${err}`)
  }
  const json = await res.json()
  return {
    data: json.data ?? [],
    next: json.paging?.next ?? undefined,
  }
}

async function fetchAllLeads(formId: string, accessToken: string): Promise<any[]> {
  const leads: any[] = []
  let url = `${META_GRAPH_API}/${formId}/leads?fields=id,created_time,field_data&limit=${PAGE_SIZE}&access_token=${encodeURIComponent(accessToken)}`

  while (url) {
    const page = await fetchLeadsPage(url)
    leads.push(...page.data)
    url = page.next ?? ""
  }

  return leads
}

function extractField(fieldData: Array<{ name: string; values: string[] }>, keys: string[]): string {
  for (const key of keys) {
    const f = fieldData.find((x) => x.name.toLowerCase() === key.toLowerCase())
    if (f?.values?.[0]) return f.values[0]
  }
  return ""
}

export async function POST(req: Request) {
  let unitPrefix: string
  try {
    const result = await getTenantFromRequest()
    unitPrefix = result.tenant
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const supabase = createBiaSupabaseServerClient()

  const { data: configs, error: cfgErr } = await supabase
    .from("meta_lead_pages")
    .select("form_id, page_id, page_access_token, campaign_name")
    .eq("unit_prefix", unitPrefix)
    .eq("is_active", true)

  if (cfgErr || !configs?.length) {
    return NextResponse.json({ error: "Nenhuma página Meta configurada para este tenant" }, { status: 404 })
  }

  const campaignTable = `${unitPrefix}_lead_campaigns`
  let totalImported = 0
  let totalSkipped = 0

  for (const config of configs) {
    const { form_id, page_id, page_access_token, campaign_name } = config
    if (!form_id || !page_access_token) continue

    let metaLeads: any[]
    try {
      metaLeads = await fetchAllLeads(form_id, page_access_token)
    } catch (err) {
      console.error(`[captacao/import] Failed to fetch leads for form ${form_id}:`, err)
      continue
    }

    for (const lead of metaLeads) {
      const fieldData: Array<{ name: string; values: string[] }> = lead.field_data ?? []
      const phone = extractField(fieldData, ["phone_number", "phone", "telefone", "celular"])
      const name = extractField(fieldData, ["full_name", "name", "nome", "first_name"])
      const email = extractField(fieldData, ["email", "e-mail"])

      if (!phone) { totalSkipped++; continue }

      const cleanPhone = phone.replace(/\D/g, "")
      const formattedPhone =
        cleanPhone.length >= 10 && cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone

      const { error: upsertErr } = await supabase
        .from(campaignTable)
        .upsert(
          {
            leadgen_id: lead.id,
            phone: formattedPhone,
            name: name || null,
            email: email || null,
            source: "meta_lead",
            campaign_name,
            page_id,
            form_id,
            form_data: { field_data: fieldData },
            whatsapp_sent: false,
            created_at: lead.created_time ?? new Date().toISOString(),
          },
          { onConflict: "leadgen_id", ignoreDuplicates: true }
        )

      if (!upsertErr) totalImported++
      else totalSkipped++
    }
  }

  return NextResponse.json({ ok: true, imported: totalImported, skipped: totalSkipped })
}
