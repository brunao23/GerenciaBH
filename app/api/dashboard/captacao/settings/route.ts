import { NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

const MIN_DELAY_MINUTES = 0
const MAX_DELAY_MINUTES = 24 * 60

function normalizeDelayMinutes(input: any): number {
  const numeric = Number(input)
  if (!Number.isFinite(numeric)) return MIN_DELAY_MINUTES
  const rounded = Math.floor(numeric)
  if (rounded < MIN_DELAY_MINUTES) return MIN_DELAY_MINUTES
  if (rounded > MAX_DELAY_MINUTES) return MAX_DELAY_MINUTES
  return rounded
}

function normalizeAutoWelcomeEnabled(input: any): boolean | null {
  if (typeof input === "boolean") return input
  if (typeof input === "number") return input !== 0
  if (typeof input === "string") {
    const normalized = input.trim().toLowerCase()
    if (["true", "1", "on", "yes", "sim", "ligado"].includes(normalized)) return true
    if (["false", "0", "off", "no", "nao", "não", "desligado"].includes(normalized)) return false
  }
  return null
}

export async function GET() {
  let unitPrefix: string
  try {
    const tenantResult = await getTenantFromRequest()
    unitPrefix = tenantResult.tenant
  } catch {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  const supabase = createBiaSupabaseServerClient()

  const { data, error } = await supabase
    .from("meta_lead_pages")
    .select("*")
    .eq("unit_prefix", unitPrefix)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = data ?? []
  const activeRows = rows.filter((row) => row.is_active)
  const activeDelays = Array.from(
    new Set(activeRows.map((row) => Number(row.delay_minutes) || 0)),
  )
  const activeAutoWelcome = Array.from(new Set(activeRows.map((row) => row.auto_welcome_enabled !== false)))

  return NextResponse.json(
    {
      data: rows,
      settings: {
        activeConfigs: activeRows.length,
        totalConfigs: rows.length,
        delayMinutes: activeDelays.length === 1 ? activeDelays[0] : null,
        autoWelcomeEnabled: activeAutoWelcome.length === 1 ? activeAutoWelcome[0] : null,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  )
}

export async function PATCH(req: Request) {
  let unitPrefix: string
  try {
    const tenantResult = await getTenantFromRequest()
    unitPrefix = tenantResult.tenant
  } catch {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const hasDelay = Object.prototype.hasOwnProperty.call(body || {}, "delayMinutes")
  const hasAutoWelcome = Object.prototype.hasOwnProperty.call(body || {}, "autoWelcomeEnabled")

  if (!hasDelay && !hasAutoWelcome) {
    return NextResponse.json({ error: "Nenhuma alteracao enviada" }, { status: 400 })
  }

  const supabase = createBiaSupabaseServerClient()

  const updatePayload: Record<string, any> = {}
  if (hasDelay) {
    updatePayload.delay_minutes = normalizeDelayMinutes(body?.delayMinutes)
  }
  if (hasAutoWelcome) {
    const autoWelcomeEnabled = normalizeAutoWelcomeEnabled(body?.autoWelcomeEnabled)
    if (autoWelcomeEnabled === null) {
      return NextResponse.json({ error: "Valor invalido para autoWelcomeEnabled" }, { status: 400 })
    }
    updatePayload.auto_welcome_enabled = autoWelcomeEnabled
  }

  const activeOnly = body?.activeOnly !== false

  let query = supabase
    .from("meta_lead_pages")
    .update(updatePayload)
    .eq("unit_prefix", unitPrefix)

  if (activeOnly) {
    query = query.eq("is_active", true)
  }

  let { data, error } = await query.select("id")
  if (error) {
    const msg = String(error.message || "")
    if (msg.toLowerCase().includes("auto_welcome_enabled") && msg.toLowerCase().includes("column")) {
      return NextResponse.json(
        { error: "Atualize o banco para habilitar o controle de disparo automatico" },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Fallback: se não houver campanhas ativas, salva para todas as campanhas do tenant.
  if ((data?.length ?? 0) === 0 && activeOnly) {
    const fallback = await supabase
      .from("meta_lead_pages")
      .update(updatePayload)
      .eq("unit_prefix", unitPrefix)
      .select("id")

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 })
    }

    data = fallback.data ?? []
  }

  return NextResponse.json(
    {
      ok: true,
      delayMinutes: updatePayload.delay_minutes ?? null,
      autoWelcomeEnabled: updatePayload.auto_welcome_enabled ?? null,
      updated: data?.length ?? 0,
      activeOnly,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  )
}
