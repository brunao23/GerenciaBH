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

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ""
  const digits = String(phone).replace(/\D/g, "")
  if (!digits) return ""
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if (digits.length === 12 && digits.startsWith("55")) return digits
  if (digits.length === 13 && digits.startsWith("55")) return digits
  return digits
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (!items.length) return []
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
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

  const byChannel: Record<string, { total: number; sent: number }> = {}
  for (const r of rows) {
    const ch = r.source || "outros"
    if (!byChannel[ch]) byChannel[ch] = { total: 0, sent: 0 }
    byChannel[ch].total++
    if (r.whatsapp_sent) byChannel[ch].sent++
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
    byChannel: Object.entries(byChannel)
      .map(([channel, data]) => ({ channel, ...data }))
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

export async function DELETE(req: Request) {
  let unitPrefix: string
  try {
    const result = await getTenantFromRequest()
    unitPrefix = result.tenant
  } catch {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  const { leadId } = await req.json().catch(() => ({}))
  if (!leadId) {
    return NextResponse.json({ error: "leadId obrigatorio" }, { status: 400 })
  }

  const supabase = createBiaSupabaseServerClient()
  const campaignTable = `${unitPrefix}_lead_campaigns`

  const { error } = await supabase.from(campaignTable).delete().eq("id", leadId)
  if (error) {
    console.error("[captacao/delete] Error deleting lead:", error)
    return NextResponse.json({ error: "Erro ao excluir lead" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted: 1 })
}

export async function POST(req: Request) {
  let unitPrefix: string
  try {
    const result = await getTenantFromRequest()
    unitPrefix = result.tenant
  } catch {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  const { action } = await req.json().catch(() => ({}))
  if (action !== "dedupe") {
    return NextResponse.json({ error: "Acao invalida" }, { status: 400 })
  }

  const supabase = createBiaSupabaseServerClient()
  const campaignTable = `${unitPrefix}_lead_campaigns`

  const { data: rows, error: fetchError } = await supabase
    .from(campaignTable)
    .select("id, phone, whatsapp_sent, whatsapp_sent_at, created_at")

  if (fetchError) {
    console.error("[captacao/dedupe] Error fetching leads:", fetchError)
    return NextResponse.json({ error: "Erro ao buscar leads para deduplicacao" }, { status: 500 })
  }

  const grouped = new Map<
    string,
    Array<{
      id: string
      phone: string | null
      whatsapp_sent: boolean | null
      whatsapp_sent_at: string | null
      created_at: string
    }>
  >()

  for (const row of rows ?? []) {
    const key = normalizePhone(row.phone)
    if (!key) continue
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(row)
  }

  const idsToDelete: string[] = []
  let groupsWithDuplicates = 0
  let keepUpdated = 0

  for (const groupRows of grouped.values()) {
    if (groupRows.length <= 1) continue
    groupsWithDuplicates++

    const sorted = [...groupRows].sort((a, b) => {
      const sentA = a.whatsapp_sent ? 1 : 0
      const sentB = b.whatsapp_sent ? 1 : 0
      if (sentB !== sentA) return sentB - sentA

      const tsA = Date.parse(a.whatsapp_sent_at || a.created_at || "") || 0
      const tsB = Date.parse(b.whatsapp_sent_at || b.created_at || "") || 0
      return tsB - tsA
    })

    const keeper = sorted[0]
    const duplicates = sorted.slice(1)

    const anySent = sorted.some((x) => x.whatsapp_sent === true)
    if (anySent && keeper.whatsapp_sent !== true) {
      const latestSentAt = sorted
        .map((x) => x.whatsapp_sent_at)
        .filter((x): x is string => Boolean(x))
        .sort((a, b) => (Date.parse(b) || 0) - (Date.parse(a) || 0))[0] ?? new Date().toISOString()

      const { error: updateError } = await supabase
        .from(campaignTable)
        .update({ whatsapp_sent: true, whatsapp_sent_at: latestSentAt })
        .eq("id", keeper.id)

      if (!updateError) keepUpdated++
    }

    for (const row of duplicates) idsToDelete.push(row.id)
  }

  for (const chunk of chunkArray(idsToDelete, 200)) {
    const { error: deleteError } = await supabase.from(campaignTable).delete().in("id", chunk)
    if (deleteError) {
      console.error("[captacao/dedupe] Error deleting duplicates:", deleteError)
      return NextResponse.json({ error: "Erro ao remover duplicados" }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    groupsWithDuplicates,
    deleted: idsToDelete.length,
    keepUpdated,
  })
}
