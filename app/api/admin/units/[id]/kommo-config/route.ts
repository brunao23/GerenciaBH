import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import {
  type KommoConfig,
  validateKommoConfig,
  sanitizeKommoConfig,
  DEFAULT_KOMMO_CONFIG,
} from "@/lib/helpers/kommo-config"
import { KommoService } from "@/lib/services/kommo.service"
import { notifyAdminUpdate } from "@/lib/services/tenant-notifications"

export const runtime = "nodejs"
export const maxDuration = 30

function safeMetadata(input: any): Record<string, any> {
  if (input && typeof input === "object" && !Array.isArray(input)) return input
  return {}
}

type RouteParams = { id?: string } | Promise<{ id?: string }>

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  )
}

async function resolveParamId(context: { params?: RouteParams }): Promise<string> {
  const paramsValue: any = context?.params
  const params =
    paramsValue && typeof paramsValue.then === "function" ? await paramsValue : paramsValue
  const raw = String(params?.id ?? "").trim()
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
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

async function requireAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) return null
  const session = await verifyToken(token)
  if (!session?.isAdmin) return null
  return session
}

// ── GET — Fetch Kommo config for a unit ──────────────────────────────────

export async function GET(_req: NextRequest, context: { params: RouteParams }) {
  try {
    const session = await requireAdmin()
    if (!session) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const unitRef = await resolveParamId(context)
    const data = await findUnitByIdOrPrefix(unitRef)
    if (!data?.id) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 })
    }

    const metadata = safeMetadata(data.metadata)
    const config: KommoConfig = metadata.kommo
      ? sanitizeKommoConfig(metadata.kommo)
      : DEFAULT_KOMMO_CONFIG

    // Never leak the full token to the frontend
    const safeConfig = {
      ...config,
      apiToken: config.apiToken ? `${config.apiToken.slice(0, 8)}...` : "",
    }

    return NextResponse.json({ config: safeConfig })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
  }
}

// ── PATCH — Update Kommo config for a unit ───────────────────────────────

export async function PATCH(req: NextRequest, context: { params: RouteParams }) {
  try {
    const session = await requireAdmin()
    if (!session) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const body = await req.json()
    const input = body?.config
    if (!input || typeof input !== "object") {
      return NextResponse.json({ error: "config object is required" }, { status: 400 })
    }

    const unitRef = await resolveParamId(context)
    const data = await findUnitByIdOrPrefix(unitRef)
    if (!data?.id) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 })
    }

    // Merge with existing config (preserve token if not provided)
    const existingMetadata = safeMetadata(data.metadata)
    const existingKommo = existingMetadata.kommo || {}

    // If token is masked (ends with ...), keep the existing one
    if (input.apiToken && input.apiToken.endsWith("...")) {
      input.apiToken = existingKommo.apiToken || ""
    }

    const merged = { ...DEFAULT_KOMMO_CONFIG, ...existingKommo, ...input }
    const config = sanitizeKommoConfig(merged)

    const validationError = validateKommoConfig(config)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Test connection if enabling
    if (config.enabled && config.subdomain && config.apiToken) {
      const kommo = new KommoService({
        subdomain: config.subdomain,
        apiToken: config.apiToken,
      })
      const test = await kommo.testConnection()
      if (!test.ok) {
        return NextResponse.json(
          {
            error: `Falha ao conectar ao Kommo: ${test.error}. Verifique o subdominio e token.`,
          },
          { status: 400 },
        )
      }
    }

    // Save
    const supabase = createBiaSupabaseServerClient()
    const next = { ...existingMetadata, kommo: config }

    const { error: updateError } = await supabase
      .from("units_registry")
      .update({ metadata: next })
      .eq("id", data.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Notify
    if (data.unit_prefix) {
      await notifyAdminUpdate({
        tenant: data.unit_prefix,
        title: "Integracao Kommo CRM atualizada",
        message: config.enabled
          ? `Integracao com Kommo CRM ativada (${config.subdomain}.kommo.com).`
          : "Integracao com Kommo CRM desativada.",
        sourceId: String(data.id),
      }).catch((err) => {
        console.error("[admin][kommo-config] erro ao notificar:", err)
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
  }
}

// ── POST — Test connection / trigger sync ────────────────────────────────

export async function POST(req: NextRequest, context: { params: RouteParams }) {
  try {
    const session = await requireAdmin()
    if (!session) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const body = await req.json()
    const action = body?.action

    const unitRef = await resolveParamId(context)
    const data = await findUnitByIdOrPrefix(unitRef)
    if (!data?.id) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 })
    }

    const metadata = safeMetadata(data.metadata)
    const kommoConfig = metadata.kommo as KommoConfig | undefined

    if (!kommoConfig?.subdomain || !kommoConfig?.apiToken) {
      return NextResponse.json(
        { error: "Kommo nao configurado para esta unidade" },
        { status: 400 },
      )
    }

    const kommo = new KommoService({
      subdomain: kommoConfig.subdomain,
      apiToken: kommoConfig.apiToken,
    })

    if (action === "test") {
      const test = await kommo.testConnection()
      return NextResponse.json(test)
    }

    if (action === "preview") {
      const [pipelines, tags] = await Promise.all([
        kommo.listPipelines(),
        kommo.listLeadTags({ limit: 50 }),
      ])
      return NextResponse.json({
        pipelines: pipelines.map((p) => ({
          id: p.id,
          name: p.name,
          statuses: p._embedded?.statuses?.map((s) => ({
            id: s.id,
            name: s.name,
            color: s.color,
          })),
        })),
        tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
  }
}
