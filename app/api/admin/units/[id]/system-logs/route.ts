import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"

type RouteParams = { id?: string } | Promise<{ id?: string }>

export interface SystemLogItem {
  id: string
  sessionId: string
  createdAt: string
  event: string
  severity: "info" | "warn" | "error" | "success"
  content: string
  source: string
  statusCode?: number
  duration?: number
  phone?: string
  error?: string
  details?: Record<string, any>
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  )
}

function decodeRouteValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function cleanRouteValue(value: any): string {
  const text = String(value ?? "").trim()
  if (!text || text === "undefined" || text === "null") return ""
  return decodeRouteValue(text)
}

function safeObject(value: any): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value
  return {}
}

function parseLimit(input: any): number {
  const value = Number(input)
  if (!Number.isFinite(value)) return 100
  if (value < 1) return 1
  if (value > 500) return 500
  return Math.floor(value)
}

function resolveSeverity(message: Record<string, any>, contentStr: string): SystemLogItem["severity"] {
  const raw = String(message.debug_severity || message.severity || "").trim().toLowerCase()
  if (raw === "error") return "error"
  if (raw === "warn" || raw === "warning") return "warn"
  if (raw === "success") return "success"

  const errorText = String(message.error || message.debug_error || "").trim()
  if (errorText) return "error"

  // Detect by event name patterns
  const event = String(message.debug_event || contentStr || "").toLowerCase()
  if (event.includes("_error") || event.includes("_failed") || event.includes("_fail")) return "error"
  if (event.includes("_success") || event.includes("_sent") || event.includes("_ok")) return "success"
  if (event.includes("_warn") || event.includes("_skip") || event.includes("_blocked")) return "warn"

  return "info"
}

function resolveStatusCode(message: Record<string, any>): number | undefined {
  const code = Number(message.status_code || message.statusCode || message.http_status)
  return Number.isFinite(code) && code > 0 ? code : undefined
}

function isMissingTableError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  return code === "42P01" || message.includes("does not exist") || message.includes("relation")
}

async function resolveUnitRef(
  req: NextRequest,
  context: { params?: RouteParams },
): Promise<string> {
  const paramsValue: any = context?.params
  const params = paramsValue && typeof paramsValue.then === "function"
    ? await paramsValue
    : paramsValue

  const fromParams = cleanRouteValue(params?.id)
  if (fromParams) return fromParams

  const fromPathMatch = req.nextUrl.pathname.match(
    /\/api\/admin\/units\/([^/]+)\/system-logs\/?$/i,
  )
  if (fromPathMatch?.[1]) {
    const fromPath = cleanRouteValue(fromPathMatch[1])
    if (fromPath) return fromPath
  }

  const query = req.nextUrl.searchParams
  const fromQuery = cleanRouteValue(
    query.get("unit") || query.get("unitId") || query.get("id") || query.get("tenant"),
  )
  if (fromQuery) {
    const maybeTenant = normalizeTenant(fromQuery)
    return maybeTenant || fromQuery
  }

  return ""
}

async function findUnitByIdOrPrefix(input: string) {
  const value = String(input || "").trim()
  if (!value || value === "undefined" || value === "null") return null

  const supabase = createBiaSupabaseServerClient()
  if (isUuid(value)) {
    const byId = await supabase
      .from("units_registry")
      .select("id, unit_prefix, unit_name")
      .eq("id", value)
      .maybeSingle()
    if (!byId.error && byId.data?.unit_prefix) return byId.data
  }

  const byPrefix = await supabase
    .from("units_registry")
    .select("id, unit_prefix, unit_name")
    .eq("unit_prefix", value)
    .maybeSingle()

  if (byPrefix.error || !byPrefix.data?.unit_prefix) return null
  return byPrefix.data
}

export async function GET(req: NextRequest, context: { params: RouteParams }) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth-token")?.value

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const session = await verifyToken(token)
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const unitRef = await resolveUnitRef(req, context)
    const unit = await findUnitByIdOrPrefix(unitRef)
    if (!unit?.unit_prefix) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 })
    }

    const searchParams = req.nextUrl.searchParams
    const limit = parseLimit(searchParams.get("limit"))
    const severityFilter = String(searchParams.get("severity") || "").trim().toLowerCase()
    const sourceFilter = String(searchParams.get("source") || "").trim().toLowerCase()
    const sinceParam = String(searchParams.get("since") || "").trim()

    const supabase = createBiaSupabaseServerClient()
    const chatTable = await resolveChatHistoriesTable(supabase as any, unit.unit_prefix)

    // Fetch raw limit x5 to allow filtering, cap at 2000
    const rawLimit = Math.min(limit * 8, 2000)

    let query = supabase
      .from(chatTable)
      .select("id, session_id, created_at, message")
      .order("created_at", { ascending: false })
      .limit(rawLimit)

    if (sinceParam) {
      query = query.gte("created_at", sinceParam)
    }

    const { data, error } = await query

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({
          success: true,
          unit: unit.unit_prefix,
          table: chatTable,
          items: [],
          total: 0,
        })
      }
      return NextResponse.json({ error: error.message || "failed_to_load_logs" }, { status: 500 })
    }

    const rows = Array.isArray(data) ? data : []
    const items: SystemLogItem[] = []

    for (const row of rows) {
      const message = safeObject(row?.message)
      const role = String(message.role || "").trim().toLowerCase()
      const type = String(message.type || "").trim().toLowerCase()
      const source = String(message.source || "").trim().toLowerCase()
      const content = String(message.content || "").trim()
      const errorText = String(message.error || message.debug_error || "").trim()
      const debugEvent = String(message.debug_event || "").trim()
      const contentStr = debugEvent || content

      // Include: system messages, status messages, and agent-related logs
      const isSystemLog =
        role === "system" ||
        type === "status" ||
        source.startsWith("native-agent") ||
        source.startsWith("webhook") ||
        source.startsWith("followup") ||
        source.startsWith("scanner") ||
        Boolean(debugEvent)

      if (!isSystemLog) continue

      const severity = resolveSeverity(message, contentStr)

      // Apply severity filter
      if (severityFilter && severityFilter !== "all" && severity !== severityFilter) continue

      // Apply source filter
      if (sourceFilter && sourceFilter !== "all" && !source.includes(sourceFilter)) continue

      const statusCode = resolveStatusCode(message)
      const duration = Number(message.duration_ms || message.duration) || undefined
      const phone = String(message.phone || message.numero || "").trim() || undefined

      // Build a clean details object excluding internal fields
      const {
        role: _r, type: _t, source: _s, content: _c,
        error: _e, debug_error: _de, debug_event: _dv,
        debug_severity: _ds, severity: _sv, status_code: _sc,
        statusCode: _sc2, http_status: _hs, duration_ms: _dm,
        duration: _dur, phone: _ph, numero: _nu,
        ...rest
      } = message
      const details = Object.keys(rest).length > 0 ? rest : undefined

      items.push({
        id: String(row?.id || ""),
        sessionId: String(row?.session_id || ""),
        createdAt: String(row?.created_at || message.created_at || new Date().toISOString()),
        event: contentStr || "system_log",
        severity,
        content,
        source: source || "system",
        statusCode,
        duration,
        phone,
        error: errorText || undefined,
        details,
      })

      if (items.length >= limit) break
    }

    return NextResponse.json({
      success: true,
      unit: unit.unit_prefix,
      unitName: unit.unit_name,
      table: chatTable,
      items,
      total: items.length,
      fetchedRows: rows.length,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
  }
}
