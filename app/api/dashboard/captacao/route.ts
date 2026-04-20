import { NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

// Mapa de fusos horários por tenant (offset em horas em relação a UTC, sem DST desde 2019)
// UTC-3: maioria do Brasil (SP, MG, RJ, etc.)
// UTC-4: Cuiabá/MT (bia_vox), Campo Grande/MS, Manaus/AM
const TENANT_UTC_OFFSET: Record<string, number> = {
  bia_vox: 4,  // Cuiabá — UTC-4
}
const DEFAULT_UTC_OFFSET = 3 // UTC-3 para todos os outros

function getTenantOffset(unitPrefix: string): number {
  return TENANT_UTC_OFFSET[unitPrefix] ?? DEFAULT_UTC_OFFSET
}

function toLocalDate(isoString: string, offsetHours: number): string {
  return new Date(new Date(isoString).getTime() - offsetHours * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
}

function parsePeriod(
  searchParams: URLSearchParams,
  offsetHours: number
): { start: string | null; end: string } {
  const period = searchParams.get("period") || "30d"
  const now = new Date()
  const sign = `-0${offsetHours}:00`

  if (period === "all") return { start: null, end: now.toISOString() }

  if (period === "custom") {
    const s = searchParams.get("startDate")
    const e = searchParams.get("endDate")
    if (s && e) return {
      start: new Date(`${s}T00:00:00${sign}`).toISOString(),
      end: new Date(`${e}T23:59:59${sign}`).toISOString(),
    }
  }

  const daysMap: Record<string, number> = { "7d": 7, "15d": 15, "30d": 30, "90d": 90 }
  const days = daysMap[period] || 30
  const offsetMs = offsetHours * 60 * 60 * 1000
  const localNowMs = now.getTime() - offsetMs
  const start = new Date(localNowMs - (days - 1) * 24 * 60 * 60 * 1000)
  // Meia-noite local = offsetHours UTC
  start.setUTCHours(offsetHours, 0, 0, 0)
  return { start: start.toISOString(), end: now.toISOString() }
}

export async function GET(req: Request) {
  let unitPrefix: string
  try {
    const result = await getTenantFromRequest()
    unitPrefix = result.tenant
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const url = new URL(req.url)
  const offset = getTenantOffset(unitPrefix)
  const { start, end } = parsePeriod(url.searchParams, offset)

  const supabase = createBiaSupabaseServerClient()
  const campaignTable = `${unitPrefix}_lead_campaigns`

  let query = supabase
    .from(campaignTable)
    .select("id, phone, name, email, source, campaign_name, whatsapp_sent, created_at, form_data")
    .lte("created_at", end)
    .order("created_at", { ascending: false })

  if (start) query = query.gte("created_at", start)

  const { data: leads, error: leadsError } = await query

  if (leadsError) {
    console.error("[captacao] Error fetching leads:", leadsError)
    return NextResponse.json({ error: "Erro ao buscar dados" }, { status: 500 })
  }

  const rows = leads ?? []

  const totalLeads = rows.length
  const totalMeta = rows.filter((r) => r.source === "meta_lead").length
  const totalWhatsapp = rows.filter((r) => r.source === "whatsapp_direct").length
  const totalOrganic = rows.filter((r) => r.source === "organic").length
  const totalSent = rows.filter((r) => r.whatsapp_sent).length

  const byCampaign: Record<string, { total: number; sent: number }> = {}
  for (const r of rows) {
    const key = r.campaign_name || "Sem campanha"
    if (!byCampaign[key]) byCampaign[key] = { total: 0, sent: 0 }
    byCampaign[key].total++
    if (r.whatsapp_sent) byCampaign[key].sent++
  }

  const byDay: Record<string, number> = {}
  for (const r of rows) {
    const day = toLocalDate(r.created_at, offset)
    byDay[day] = (byDay[day] || 0) + 1
  }

  return NextResponse.json({
    periodo: { start, end },
    totals: {
      leads: totalLeads,
      meta: totalMeta,
      whatsapp: totalWhatsapp,
      organic: totalOrganic,
      whatsappSent: totalSent,
      sendRate: totalLeads > 0 ? Math.round((totalSent / totalLeads) * 100) : 0,
    },
    byCampaign: Object.entries(byCampaign)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total),
    byDay: Object.entries(byDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    leads: rows.map((r) => ({
      id: r.id,
      name: r.name ?? null,
      phone: r.phone ? r.phone.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") : null,
      email: r.email ?? null,
      source: r.source,
      campaign_name: r.campaign_name ?? null,
      whatsapp_sent: r.whatsapp_sent,
      created_at: r.created_at,
      form_fields: (r.form_data?.field_data ?? []) as Array<{ name: string; values: string[] }>,
    })),
  })
}
