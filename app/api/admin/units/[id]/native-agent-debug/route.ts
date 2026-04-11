import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"

type RouteParams = { id?: string } | Promise<{ id?: string }>

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

function normalizeSeverity(value: any): "info" | "error" {
  const text = String(value || "").trim().toLowerCase()
  return text === "error" ? "error" : "info"
}

function parseLimit(input: any): number {
  const value = Number(input)
  if (!Number.isFinite(value)) return 80
  if (value < 1) return 1
  if (value > 300) return 300
  return Math.floor(value)
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
    /\/api\/admin\/units\/([^/]+)\/native-agent-debug\/?$/i,
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

    const limit = parseLimit(req.nextUrl.searchParams.get("limit"))
    const supabase = createBiaSupabaseServerClient()
    const chatTable = await resolveChatHistoriesTable(supabase as any, unit.unit_prefix)
    const rawLimit = Math.min(limit * 5, 1200)

    const { data, error } = await supabase
      .from(chatTable)
      .select("id, session_id, created_at, message")
      .order("created_at", { ascending: false })
      .limit(rawLimit)

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({
          success: true,
          unit: unit.unit_prefix,
          table: chatTable,
          items: [],
        })
      }
      return NextResponse.json({ error: error.message || "failed_to_load_debug" }, { status: 500 })
    }

    const rows = Array.isArray(data) ? data : []
    const items = rows
      .map((row: any) => {
        const message = safeObject(row?.message)
        const role = String(message.role || "").trim().toLowerCase()
        const type = String(message.type || "").trim().toLowerCase()
        const source = String(message.source || "").trim().toLowerCase()
        const content = String(message.content || "").trim()
        const event = String(message.debug_event || "").trim() || content || "native_agent_status"
        const errorText = String(message.error || message.debug_error || "").trim()
        const severity = normalizeSeverity(message.debug_severity || (errorText ? "error" : "info"))

        const isNativeAgentLog =
          source.startsWith("native-agent") ||
          content.startsWith("native_agent_") ||
          Boolean(message.debug_event)

        if (!isNativeAgentLog) return null
        if (role !== "system" && type !== "status") return null

        return {
          id: String(row?.id || ""),
          sessionId: String(row?.session_id || ""),
          createdAt: String(row?.created_at || message.created_at || new Date().toISOString()),
          event,
          severity,
          content,
          source: source || "native-agent",
          error: errorText || undefined,
        }
      })
      .filter(Boolean)
      .slice(0, limit)

    return NextResponse.json({
      success: true,
      unit: unit.unit_prefix,
      table: chatTable,
      items,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
  }
}

