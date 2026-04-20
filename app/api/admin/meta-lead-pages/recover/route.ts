import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

const META_GRAPH_API = "https://graph.facebook.com/v20.0"
const PAGE_SIZE = 100

async function requireAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) return null
  const session = await verifyToken(token)
  if (!session?.isAdmin) return null
  return session
}

function extractField(fieldData: Array<{ name: string; values: string[] }>, keys: string[]): string {
  for (const key of keys) {
    const f = fieldData.find((x) => x.name.toLowerCase() === key.toLowerCase())
    if (f?.values?.[0]) return f.values[0]
  }
  return ""
}

async function fetchAllLeads(formId: string, accessToken: string): Promise<any[]> {
  const leads: any[] = []
  let url = `${META_GRAPH_API}/${formId}/leads?fields=id,created_time,field_data&limit=${PAGE_SIZE}&access_token=${encodeURIComponent(accessToken)}`
  while (url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Meta API: ${await res.text()}`)
    const json = await res.json()
    leads.push(...(json.data ?? []))
    url = json.paging?.next ?? ""
  }
  return leads
}

/**
 * POST /api/admin/meta-lead-pages/recover
 * Recupera leads históricos do Meta e importa para o tenant.
 * Body: { unit_prefix, page_id, page_access_token, form_id, campaign_name }
 * Não requer que meta_lead_pages já exista — importação direta via parâmetros.
 */
export async function POST(req: Request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { unit_prefix, page_id, page_access_token, form_id, campaign_name } = body

  if (!unit_prefix || !page_access_token || !campaign_name) {
    return NextResponse.json(
      { error: "Campos obrigatórios: unit_prefix, page_access_token, campaign_name" },
      { status: 400 }
    )
  }

  if (!form_id && !page_id) {
    return NextResponse.json(
      { error: "Informe form_id (preferencial) ou page_id" },
      { status: 400 }
    )
  }

  const supabase = createBiaSupabaseServerClient()
  const campaignTable = `${unit_prefix}_lead_campaigns`

  // Se não foi passado form_id, tenta buscar da config salva
  let targetFormId = form_id
  if (!targetFormId && page_id) {
    const { data: config } = await supabase
      .from("meta_lead_pages")
      .select("form_id")
      .eq("unit_prefix", unit_prefix)
      .eq("page_id", page_id)
      .eq("is_active", true)
      .maybeSingle()
    targetFormId = config?.form_id ?? null
  }

  if (!targetFormId) {
    return NextResponse.json(
      { error: "form_id não encontrado. Informe-o diretamente no body." },
      { status: 400 }
    )
  }

  let metaLeads: any[]
  try {
    metaLeads = await fetchAllLeads(targetFormId, page_access_token)
  } catch (err: any) {
    return NextResponse.json({ error: `Falha ao buscar leads do Meta: ${err.message}` }, { status: 502 })
  }

  let imported = 0
  let skipped = 0

  for (const lead of metaLeads) {
    const fieldData: Array<{ name: string; values: string[] }> = lead.field_data ?? []
    const phone = extractField(fieldData, ["phone_number", "phone", "telefone", "celular"])
    if (!phone) { skipped++; continue }

    const clean = phone.replace(/\D/g, "")
    const formatted = clean.length >= 10 && clean.length <= 11 ? `55${clean}` : clean
    const name = extractField(fieldData, ["full_name", "name", "nome", "first_name"])
    const email = extractField(fieldData, ["email", "e-mail"])

    const { error } = await supabase
      .from(campaignTable)
      .upsert(
        {
          leadgen_id: lead.id,
          phone: formatted,
          name: name || null,
          email: email || null,
          source: "meta_lead",
          campaign_name,
          page_id: page_id ?? null,
          form_id: targetFormId,
          form_data: { field_data: fieldData },
          whatsapp_sent: false,
          created_at: lead.created_time ?? new Date().toISOString(),
        },
        { onConflict: "leadgen_id", ignoreDuplicates: true }
      )

    if (!error) imported++
    else skipped++
  }

  return NextResponse.json({
    ok: true,
    unit_prefix,
    campaign_name,
    total_meta: metaLeads.length,
    imported,
    skipped,
  })
}
