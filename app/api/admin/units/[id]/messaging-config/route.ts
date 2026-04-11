import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { type MessagingConfig, validateMessagingConfig } from "@/lib/helpers/messaging-config"
import { notifyAdminUpdate } from "@/lib/services/tenant-notifications"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"

function safeMetadata(input: any): Record<string, any> {
  if (input && typeof input === "object" && !Array.isArray(input)) return input
  return {}
}

type WeeklyReportConfigInput = {
  enabled?: boolean
  groups?: string[] | string
  notes?: string
  dayOfWeek?: number | string
  hour?: number | string
  timezone?: string
}

function normalizeGroupId(value: string): string | null {
  const trimmed = String(value || "").trim()
  if (!trimmed) return null
  if (trimmed.includes("@g.us")) return trimmed

  const clean = trimmed.replace(/[^0-9-]/g, "")
  if (clean.includes("-") && clean.length >= 8) {
    return `${clean}@g.us`
  }
  return null
}

function normalizeGroups(input: string[] | string | undefined): string[] {
  if (!input) return []
  if (Array.isArray(input)) {
    return input.map((v) => normalizeGroupId(String(v || ""))).filter((v): v is string => Boolean(v))
  }

  return String(input || "")
    .split(/[\n,;]/g)
    .map((v) => normalizeGroupId(v))
    .filter((v): v is string => Boolean(v))
}

function normalizeDayOfWeek(input: number | string | undefined): number {
  const numeric = Number(input)
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 7) {
    return numeric
  }
  return 1
}

function normalizeHour(input: number | string | undefined): number {
  const numeric = Number(input)
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 23) {
    return numeric
  }

  const text = String(input || "").trim()
  const match = text.match(/^([01]?\d|2[0-3])(?::[0-5]\d)?$/)
  if (match?.[1]) {
    return Number(match[1])
  }

  return 9
}

function normalizeTimezone(input: string | undefined): string {
  const timezone = String(input || "").trim() || "America/Sao_Paulo"
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date())
    return timezone
  } catch {
    return "America/Sao_Paulo"
  }
}

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
    /\/api\/admin\/units\/([^/]+)\/messaging-config\/?$/i,
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
      .select("id, unit_name, unit_prefix, metadata")
      .eq("id", value)
      .maybeSingle()
    if (!byId.error && byId.data?.id) return byId.data
  }

  const byPrefix = await supabase
    .from("units_registry")
    .select("id, unit_name, unit_prefix, metadata")
    .eq("unit_prefix", value)
    .maybeSingle()

  if (byPrefix.error || !byPrefix.data?.id) return null
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
    const data = await findUnitByIdOrPrefix(unitRef)
    if (!data?.id) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 })
    }

    const metadata = safeMetadata(data.metadata)
    return NextResponse.json({
      config: metadata.messaging || null,
      weeklyReport: metadata.weeklyReport || metadata.weekly_report || null,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: { params: RouteParams }) {
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

    const body = (await req.json()) as { config?: MessagingConfig; weeklyReport?: WeeklyReportConfigInput }
    const hasConfig = Boolean(body?.config && typeof body.config === "object")
    const hasWeekly = Boolean(body?.weeklyReport && typeof body.weeklyReport === "object")

    if (!hasConfig && !hasWeekly) {
      return NextResponse.json(
        { error: "At least one of config or weeklyReport is required" },
        { status: 400 },
      )
    }

    const unitRef = await resolveUnitRef(req, context)
    const data = await findUnitByIdOrPrefix(unitRef)
    if (!data?.id) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 })
    }

    const supabase = createBiaSupabaseServerClient()

    const metadata = safeMetadata(data.metadata)
    const weeklyReport = hasWeekly
      ? {
          enabled:
            body.weeklyReport!.enabled === true ||
            String(body.weeklyReport!.enabled).toLowerCase() === "true",
          groups: normalizeGroups(body.weeklyReport!.groups),
          notes: String(body.weeklyReport!.notes || "").trim().slice(0, 800),
          dayOfWeek: normalizeDayOfWeek(body.weeklyReport!.dayOfWeek),
          hour: normalizeHour(body.weeklyReport!.hour),
          timezone: normalizeTimezone(body.weeklyReport!.timezone),
          updatedAt: new Date().toISOString(),
        }
      : undefined

    const existingMessaging = safeMetadata(metadata.messaging)
    const resolvedMessaging = hasConfig ? body.config! : existingMessaging

    if (hasConfig) {
      const error = validateMessagingConfig(resolvedMessaging as MessagingConfig)
      if (error) {
        return NextResponse.json({ error }, { status: 400 })
      }
    }

    const next = {
      ...metadata,
      ...(Object.keys(resolvedMessaging).length > 0 ? { messaging: resolvedMessaging } : {}),
      ...(weeklyReport ? { weeklyReport } : {}),
    }

    const { error: updateError } = await supabase
      .from("units_registry")
      .update({ metadata: next })
      .eq("id", data.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    if (data.unit_prefix && hasConfig) {
      await notifyAdminUpdate({
        tenant: data.unit_prefix,
        title: "Atualizacao da configuracao WhatsApp",
        message: `O administrador atualizou a integracao de WhatsApp para o provedor ${String(resolvedMessaging.provider || "")
          .toUpperCase()
          .trim()}.`,
        sourceId: String(data.id),
      }).catch((error) => {
        console.error("[admin][messaging-config] erro ao notificar unidade:", error)
      })
    }

    if (data.unit_prefix && weeklyReport) {
      await notifyAdminUpdate({
        tenant: data.unit_prefix,
        title: "Atualizacao do relatorio semanal automatico",
        message: weeklyReport.enabled
          ? `Relatorio semanal automatico ativado para ${weeklyReport.groups.length} grupo(s), dia ${weeklyReport.dayOfWeek} as ${String(weeklyReport.hour).padStart(2, "0")}:00 (${weeklyReport.timezone}).`
          : "Relatorio semanal automatico desativado.",
        sourceId: String(data.id),
      }).catch((error) => {
        console.error("[admin][weekly-report] erro ao notificar unidade:", error)
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
  }
}
