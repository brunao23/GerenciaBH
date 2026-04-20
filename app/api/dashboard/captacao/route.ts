import { NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

function parsePeriod(searchParams: URLSearchParams): { start: string; end: string } {
  const period = searchParams.get("period") || "30d"
  const now = new Date()

  if (period === "custom") {
    const s = searchParams.get("startDate")
    const e = searchParams.get("endDate")
    if (s && e) return { start: new Date(s).toISOString(), end: new Date(e).toISOString() }
  }

  const daysMap: Record<string, number> = { "7d": 7, "15d": 15, "30d": 30, "90d": 90 }
  const days = daysMap[period] || 30
  const start = new Date(now)
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)
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
  const { start, end } = parsePeriod(url.searchParams)

  const supabase = createBiaSupabaseServerClient()
  const campaignTable = `${unitPrefix}_lead_campaigns`

  const { data: leads, error: leadsError } = await supabase
    .from(campaignTable)
    .select("id, phone, name, email, source, campaign_name, whatsapp_sent, created_at, form_data")
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: false })

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
    const day = r.created_at.slice(0, 10)
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
