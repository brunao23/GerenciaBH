import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"

export const runtime = "nodejs"
export const maxDuration = 60

function toNumber(value: any): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return numeric
}

function toIsoStart(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function toIsoEnd(date: Date): string {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

type UsageRow = {
  id: number
  tenant: string
  session_id: string
  message_id?: string | null
  source?: string | null
  channel?: string | null
  provider: string
  model: string
  cache_hit?: boolean | null
  input_tokens?: number | null
  output_tokens?: number | null
  total_tokens?: number | null
  cached_input_tokens?: number | null
  input_cost_brl?: number | null
  output_cost_brl?: number | null
  tools_cost_brl?: number | null
  total_cost_brl?: number | null
  tools_breakdown?: Array<{
    tool?: string
    actionType?: string
    count?: number
    unitCostBrl?: number
    totalCostBrl?: number
  }> | null
  created_at: string
}

type TenantOption = {
  tenant: string
  unitName: string
}

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth-token")?.value
    if (!token) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })

    const session = await verifyToken(token)
    if (!session?.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 })

    const url = new URL(req.url)
    const tenantParam = String(url.searchParams.get("tenant") || "").trim()
    const tenant = tenantParam ? normalizeTenant(tenantParam) : ""
    const daysParam = Number(url.searchParams.get("days") || "30")
    const days = Number.isFinite(daysParam) ? Math.max(1, Math.min(365, Math.floor(daysParam))) : 30
    const limitParam = Number(url.searchParams.get("limit") || "4000")
    const limit = Number.isFinite(limitParam) ? Math.max(100, Math.min(20000, Math.floor(limitParam))) : 4000

    const fromParam = String(url.searchParams.get("from") || "").trim()
    const toParam = String(url.searchParams.get("to") || "").trim()

    const now = new Date()
    const defaultFrom = new Date(now)
    defaultFrom.setDate(defaultFrom.getDate() - (days - 1))

    const fromDate = fromParam ? new Date(fromParam) : defaultFrom
    const toDate = toParam ? new Date(toParam) : now

    const fromIso = toIsoStart(Number.isNaN(fromDate.getTime()) ? defaultFrom : fromDate)
    const toIso = toIsoEnd(Number.isNaN(toDate.getTime()) ? now : toDate)

    const supabase = createBiaSupabaseServerClient()
    let query = supabase
      .from("llm_usage_events")
      .select("*")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (tenant) {
      query = query.eq("tenant", tenant)
    }

    const [{ data: rows, error }, { data: units }] = await Promise.all([
      query,
      supabase.from("units_registry").select("unit_prefix, unit_name"),
    ])

    if (error) {
      console.error("[admin][llm-costs] erro consulta:", error)
      return NextResponse.json({ error: "Falha ao carregar custos de IA" }, { status: 500 })
    }

    const unitNames = new Map<string, string>()
    for (const unit of units || []) {
      const prefix = String(unit?.unit_prefix || "").trim()
      if (!prefix) continue
      unitNames.set(prefix, String(unit?.unit_name || prefix))
    }

    const records = (rows || []) as UsageRow[]

    const totals = {
      events: 0,
      cacheHits: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
      inputCostBrl: 0,
      outputCostBrl: 0,
      toolsCostBrl: 0,
      totalCostBrl: 0,
    }

    const byTenant = new Map<string, any>()
    const byProvider = new Map<string, any>()
    const byModel = new Map<string, any>()
    const byTool = new Map<string, any>()

    const recentMessages: Array<Record<string, any>> = []

    for (const row of records) {
      const rowInputTokens = toNumber(row.input_tokens)
      const rowOutputTokens = toNumber(row.output_tokens)
      const rowTotalTokens = toNumber(row.total_tokens)
      const rowCachedInputTokens = toNumber(row.cached_input_tokens)
      const rowInputCostBrl = toNumber(row.input_cost_brl)
      const rowOutputCostBrl = toNumber(row.output_cost_brl)
      const rowToolsCostBrl = toNumber(row.tools_cost_brl)
      const rowTotalCostBrl = toNumber(row.total_cost_brl)

      totals.events += 1
      totals.cacheHits += row.cache_hit ? 1 : 0
      totals.inputTokens += rowInputTokens
      totals.outputTokens += rowOutputTokens
      totals.totalTokens += rowTotalTokens
      totals.cachedInputTokens += rowCachedInputTokens
      totals.inputCostBrl += rowInputCostBrl
      totals.outputCostBrl += rowOutputCostBrl
      totals.toolsCostBrl += rowToolsCostBrl
      totals.totalCostBrl += rowTotalCostBrl

      const tenantKey = String(row.tenant || "").trim() || "unknown"
      if (!byTenant.has(tenantKey)) {
        byTenant.set(tenantKey, {
          tenant: tenantKey,
          unitName: unitNames.get(tenantKey) || tenantKey,
          events: 0,
          cacheHits: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          inputCostBrl: 0,
          outputCostBrl: 0,
          toolsCostBrl: 0,
          totalCostBrl: 0,
        })
      }
      const tenantBucket = byTenant.get(tenantKey)
      tenantBucket.events += 1
      tenantBucket.cacheHits += row.cache_hit ? 1 : 0
      tenantBucket.inputTokens += rowInputTokens
      tenantBucket.outputTokens += rowOutputTokens
      tenantBucket.totalTokens += rowTotalTokens
      tenantBucket.inputCostBrl += rowInputCostBrl
      tenantBucket.outputCostBrl += rowOutputCostBrl
      tenantBucket.toolsCostBrl += rowToolsCostBrl
      tenantBucket.totalCostBrl += rowTotalCostBrl

      const providerKey = String(row.provider || "unknown").trim().toLowerCase() || "unknown"
      if (!byProvider.has(providerKey)) {
        byProvider.set(providerKey, {
          provider: providerKey,
          events: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          inputCostBrl: 0,
          outputCostBrl: 0,
          toolsCostBrl: 0,
          totalCostBrl: 0,
        })
      }
      const providerBucket = byProvider.get(providerKey)
      providerBucket.events += 1
      providerBucket.inputTokens += rowInputTokens
      providerBucket.outputTokens += rowOutputTokens
      providerBucket.totalTokens += rowTotalTokens
      providerBucket.inputCostBrl += rowInputCostBrl
      providerBucket.outputCostBrl += rowOutputCostBrl
      providerBucket.toolsCostBrl += rowToolsCostBrl
      providerBucket.totalCostBrl += rowTotalCostBrl

      const modelKey = `${providerKey}:${String(row.model || "unknown").trim().toLowerCase()}`
      if (!byModel.has(modelKey)) {
        byModel.set(modelKey, {
          provider: providerKey,
          model: String(row.model || "unknown"),
          events: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          inputCostBrl: 0,
          outputCostBrl: 0,
          toolsCostBrl: 0,
          totalCostBrl: 0,
        })
      }
      const modelBucket = byModel.get(modelKey)
      modelBucket.events += 1
      modelBucket.inputTokens += rowInputTokens
      modelBucket.outputTokens += rowOutputTokens
      modelBucket.totalTokens += rowTotalTokens
      modelBucket.inputCostBrl += rowInputCostBrl
      modelBucket.outputCostBrl += rowOutputCostBrl
      modelBucket.toolsCostBrl += rowToolsCostBrl
      modelBucket.totalCostBrl += rowTotalCostBrl

      for (const toolEntry of Array.isArray(row.tools_breakdown) ? row.tools_breakdown : []) {
        const toolName = String(toolEntry?.tool || "").trim().toLowerCase() || "unknown_tool"
        const actionType = String(toolEntry?.actionType || "").trim().toLowerCase() || ""
        const key = `${toolName}::${actionType}`
        if (!byTool.has(key)) {
          byTool.set(key, {
            tool: toolName,
            actionType: actionType || null,
            count: 0,
            totalCostBrl: 0,
          })
        }
        const toolBucket = byTool.get(key)
        toolBucket.count += Math.max(0, Math.floor(toNumber(toolEntry?.count)))
        toolBucket.totalCostBrl += toNumber(toolEntry?.totalCostBrl)
      }

      if (recentMessages.length < 300) {
        recentMessages.push({
          createdAt: row.created_at,
          tenant: tenantKey,
          unitName: unitNames.get(tenantKey) || tenantKey,
          sessionId: row.session_id,
          messageId: row.message_id || null,
          provider: providerKey,
          model: row.model,
          inputTokens: rowInputTokens,
          outputTokens: rowOutputTokens,
          totalTokens: rowTotalTokens,
          inputCostBrl: rowInputCostBrl,
          outputCostBrl: rowOutputCostBrl,
          toolsCostBrl: rowToolsCostBrl,
          totalCostBrl: rowTotalCostBrl,
          cacheHit: row.cache_hit === true,
        })
      }
    }

    const normalizeMoney = (value: number) => Math.round(value * 1_000_000) / 1_000_000

    const tenantOptionsMap = new Map<string, string>()
    for (const [unitPrefix, unitName] of unitNames.entries()) {
      if (!unitPrefix) continue
      tenantOptionsMap.set(unitPrefix, unitName || unitPrefix)
    }
    for (const tenantKey of byTenant.keys()) {
      if (!tenantKey) continue
      if (!tenantOptionsMap.has(tenantKey)) {
        tenantOptionsMap.set(tenantKey, unitNames.get(tenantKey) || tenantKey)
      }
    }

    const tenants: TenantOption[] = Array.from(tenantOptionsMap.entries())
      .map(([tenantKey, unitName]) => ({
        tenant: tenantKey,
        unitName: unitName || tenantKey,
      }))
      .sort((a, b) => a.unitName.localeCompare(b.unitName, "pt-BR"))

    const response = {
      success: true,
      period: {
        from: fromIso,
        to: toIso,
        timezone: "America/Sao_Paulo",
      },
      tenants,
      totals: {
        ...totals,
        inputCostBrl: normalizeMoney(totals.inputCostBrl),
        outputCostBrl: normalizeMoney(totals.outputCostBrl),
        toolsCostBrl: normalizeMoney(totals.toolsCostBrl),
        totalCostBrl: normalizeMoney(totals.totalCostBrl),
      },
      byTenant: Array.from(byTenant.values())
        .map((item) => ({
          ...item,
          inputCostBrl: normalizeMoney(item.inputCostBrl),
          outputCostBrl: normalizeMoney(item.outputCostBrl),
          toolsCostBrl: normalizeMoney(item.toolsCostBrl),
          totalCostBrl: normalizeMoney(item.totalCostBrl),
        }))
        .sort((a, b) => b.totalCostBrl - a.totalCostBrl),
      byProvider: Array.from(byProvider.values())
        .map((item) => ({
          ...item,
          inputCostBrl: normalizeMoney(item.inputCostBrl),
          outputCostBrl: normalizeMoney(item.outputCostBrl),
          toolsCostBrl: normalizeMoney(item.toolsCostBrl),
          totalCostBrl: normalizeMoney(item.totalCostBrl),
        }))
        .sort((a, b) => b.totalCostBrl - a.totalCostBrl),
      byModel: Array.from(byModel.values())
        .map((item) => ({
          ...item,
          inputCostBrl: normalizeMoney(item.inputCostBrl),
          outputCostBrl: normalizeMoney(item.outputCostBrl),
          toolsCostBrl: normalizeMoney(item.toolsCostBrl),
          totalCostBrl: normalizeMoney(item.totalCostBrl),
        }))
        .sort((a, b) => b.totalCostBrl - a.totalCostBrl),
      byTool: Array.from(byTool.values())
        .map((item) => ({
          ...item,
          totalCostBrl: normalizeMoney(item.totalCostBrl),
        }))
        .sort((a, b) => b.totalCostBrl - a.totalCostBrl),
      recentMessages,
      rowCount: records.length,
      limitApplied: limit,
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error("[admin][llm-costs] erro geral:", error)
    return NextResponse.json(
      { error: error?.message || "Falha ao obter custos de IA" },
      { status: 500 },
    )
  }
}
