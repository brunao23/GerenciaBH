import { createHmac, randomBytes } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getNativeAgentConfigForTenant } from "@/lib/helpers/native-agent-config"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  )
}

type RouteParams = { id?: string } | Promise<{ id?: string }>

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
    /\/api\/admin\/units\/([^/]+)\/google-calendar\/oauth\/start\/?$/i,
  )
  if (fromPathMatch?.[1]) {
    const fromPath = cleanRouteValue(fromPathMatch[1])
    if (fromPath) return fromPath
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

function getStateSecret(): string {
  return (
    process.env.GOOGLE_OAUTH_STATE_SECRET ||
    process.env.NATIVE_AGENT_WEBHOOK_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "native-agent-google-oauth-state"
  )
}

function signStatePayload(payloadJson: string): string {
  const signature = createHmac("sha256", getStateSecret()).update(payloadJson).digest("hex")
  return `${Buffer.from(payloadJson).toString("base64url")}.${signature}`
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
    const url = new URL(req.url)
    const tenantFromQuery = normalizeTenant(url.searchParams.get("tenant") || "")
    const unit = tenantFromQuery
      ? { id: unitRef || tenantFromQuery, unit_prefix: tenantFromQuery, unit_name: tenantFromQuery }
      : await findUnitByIdOrPrefix(unitRef)

    if (!unit?.unit_prefix) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 })
    }

    const current = await getNativeAgentConfigForTenant(unit.unit_prefix)

    const clientIdOverride = String(url.searchParams.get("clientId") || "").trim()
    const calendarIdOverride = String(url.searchParams.get("calendarId") || "").trim()

    const oauthClientId =
      clientIdOverride || current?.googleOAuthClientId || process.env.GOOGLE_OAUTH_CLIENT_ID || ""
    if (!oauthClientId) {
      return NextResponse.json(
        {
          error:
            "Google OAuth Client ID ausente. Configure GOOGLE_OAUTH_CLIENT_ID no ambiente ou salve no tenant.",
        },
        { status: 400 },
      )
    }

    const callbackPath = "/api/admin/google-calendar/oauth/callback"
    const callbackUrl = `${url.origin}${callbackPath}`

    const statePayload = JSON.stringify({
      unitPrefix: unit.unit_prefix,
      unitRef: String(unit.id || unitRef || "").trim(),
      nonce: randomBytes(12).toString("hex"),
      issuedAt: Date.now(),
      clientId: clientIdOverride || undefined,
      calendarId: calendarIdOverride || undefined,
    })
    const state = signStatePayload(statePayload)

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    authUrl.searchParams.set("client_id", oauthClientId)
    authUrl.searchParams.set("redirect_uri", callbackUrl)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set(
      "scope",
      "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
    )
    authUrl.searchParams.set("access_type", "offline")
    authUrl.searchParams.set("prompt", "consent")
    authUrl.searchParams.set("include_granted_scopes", "true")
    authUrl.searchParams.set("state", state)

    return NextResponse.json({
      success: true,
      url: authUrl.toString(),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to start OAuth flow" }, { status: 500 })
  }
}
