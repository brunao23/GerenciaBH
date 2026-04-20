import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"
import { MetaInstagramService } from "@/lib/services/meta-instagram.service"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"

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

async function resolveUnitRef(req: NextRequest, context: { params?: RouteParams }): Promise<string> {
  const paramsValue: any = context?.params
  const params = paramsValue && typeof paramsValue.then === "function"
    ? await paramsValue
    : paramsValue

  const fromParams = cleanRouteValue(params?.id)
  if (fromParams) return fromParams

  const fromPathMatch = req.nextUrl.pathname.match(
    /\/api\/admin\/units\/([^/]+)\/instagram\/media\/?$/i,
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
    return normalizeTenant(fromQuery) || fromQuery
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
      .select("id, unit_name, unit_prefix")
      .eq("id", value)
      .maybeSingle()
    if (!byId.error && byId.data?.unit_prefix) return byId.data
  }

  const byPrefix = await supabase
    .from("units_registry")
    .select("id, unit_name, unit_prefix")
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
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const session = await verifyToken(token)
    if (!session || !session.isAdmin) {
      return NextResponse.json({ success: false, error: "Access denied" }, { status: 403 })
    }

    const unitRef = await resolveUnitRef(req, context)
    const unit = await findUnitByIdOrPrefix(unitRef)
    if (!unit?.unit_prefix) {
      return NextResponse.json({ success: false, error: "Unit not found" }, { status: 404 })
    }

    const messaging = await getMessagingConfigForTenant(unit.unit_prefix)
    const accessToken = String(messaging?.metaAccessToken || "").trim()
    const instagramAccountId = String(messaging?.metaInstagramAccountId || "").trim()
    const apiVersion = String(messaging?.metaApiVersion || "v21.0").trim()

    if (!accessToken || !instagramAccountId) {
      return NextResponse.json(
        {
          success: false,
          error: "Conta do Instagram nao conectada para esta unidade.",
        },
        { status: 400 },
      )
    }

    const limitParam = req.nextUrl.searchParams.get("limit")
    const parsedLimit = Number(limitParam)
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, Math.floor(parsedLimit))) : 50

    const meta = new MetaInstagramService({
      accessToken,
      apiVersion,
      instagramAccountId,
    })

    const result = await meta.listMedia(limit)
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Falha ao listar posts." },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      media: result.media,
      count: result.media.length,
    })
  } catch (error: any) {
    const message = String(error?.message || "Falha ao listar posts do Instagram")
    const status = /sessao|token|autenticad|login/i.test(message) ? 401 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}

