import { NextRequest, NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth/utils"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { buildBrazilianPhoneVariants, normalizeBrazilianWhatsappPhone } from "@/lib/helpers/phone-normalization"
import { AgentTaskQueueService } from "@/lib/services/agent-task-queue.service"
import {
  buildPauseActorPayload,
  isPauseActorColumnError,
  stripPauseActorPayload,
} from "@/lib/helpers/pause-actor"

async function verifyAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) return null
  const session = await verifyToken(token)
  if (!session || !session.isAdmin) return null
  return session
}

function validateTenant(tenant: string): boolean {
  return /^[a-z0-9_]+$/.test(tenant) && tenant.length > 0 && tenant.length <= 64
}

function parsePausePhone(numero: unknown): { phone: string; error?: string } {
  const parsed = normalizeBrazilianWhatsappPhone(numero)
  if (!parsed.valid) {
    return { phone: "", error: parsed.error || "Número inválido" }
  }
  return { phone: parsed.normalized }
}

async function cancelPendingTasks(tenant: string, phone: string) {
  try {
    await new AgentTaskQueueService().cancelPendingFollowups({ tenant, sessionId: phone, phone })
  } catch (error: any) {
    console.warn("[Admin Pausas] Falha ao cancelar follow-ups pendentes:", error?.message)
  }
}

async function cleanupPhoneVariants(tenant: string, phone: string, source: unknown) {
  const variants = buildBrazilianPhoneVariants(source).filter((variant) => variant && variant !== phone)
  if (variants.length === 0) return

  const tables = getTablesForTenant(tenant)
  const supabase = createBiaSupabaseServerClient()
  const { error } = await supabase.from(tables.pausar).delete().in("numero", variants).neq("numero", phone)
  if (error) {
    console.warn("[Admin Pausas] Falha ao limpar variantes antigas:", error.message)
  }
}

// GET /api/admin/pausas?tenant=vox_sp_berini
export async function GET(req: NextRequest) {
  try {
    const session = await verifyAdmin()
    if (!session) return NextResponse.json({ error: "Acesso negado" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const tenant = searchParams.get("tenant")

    if (!tenant || !validateTenant(tenant)) {
      return NextResponse.json({ error: "Tenant inválido" }, { status: 400 })
    }

    const tables = getTablesForTenant(tenant)
    const supabase = createBiaSupabaseServerClient()

    const { data, error } = await supabase
      .from(tables.pausar)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)

    if (error) {
      console.error("[Admin Pausas GET]", error)
      return NextResponse.json({ error: "Erro ao buscar pausas", details: error.message }, { status: 500 })
    }

    return NextResponse.json({ pauses: data || [] })
  } catch (err) {
    console.error("[Admin Pausas GET] exception:", err)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

// POST /api/admin/pausas
export async function POST(req: NextRequest) {
  try {
    const session = await verifyAdmin()
    if (!session) return NextResponse.json({ error: "Acesso negado" }, { status: 403 })

    const body = await req.json()
    const { tenant, numero } = body

    if (!tenant || !validateTenant(tenant)) {
      return NextResponse.json({ error: "Tenant inválido" }, { status: 400 })
    }

    const parsed = parsePausePhone(numero)
    if (!parsed.phone) {
      return NextResponse.json({ error: parsed.error || "Número inválido" }, { status: 400 })
    }

    const tables = getTablesForTenant(tenant)
    const supabase = createBiaSupabaseServerClient()
    const nowIso = new Date().toISOString()
    const actorPayload = buildPauseActorPayload({
      session,
      source: "admin_pause_panel",
    })
    const payload: Record<string, any> = {
      numero: parsed.phone,
      pausar: true,
      vaga: true,
      agendamento: false,
      updated_at: nowIso,
      pausado_em: nowIso,
      paused_until: null,
      pause_reason: "manual_human_panel",
      ...actorPayload,
    }

    let { data, error } = await supabase
      .from(tables.pausar)
      .upsert(payload, { onConflict: "numero", ignoreDuplicates: false })
      .select()
      .single()

    if (
      error &&
      (error.message?.includes("pausado_em") ||
        error.message?.includes("paused_until") ||
        error.message?.includes("pause_reason") ||
        isPauseActorColumnError(error))
    ) {
      const fallback = { ...payload }
      delete fallback.pausado_em
      delete fallback.paused_until
      delete fallback.pause_reason
      stripPauseActorPayload(fallback)
      const retry = await supabase
        .from(tables.pausar)
        .upsert(fallback, { onConflict: "numero", ignoreDuplicates: false })
        .select()
        .single()
      data = retry.data
      error = retry.error
    }

    if (error) {
      console.error("[Admin Pausas POST]", error)
      return NextResponse.json({ error: "Erro ao pausar número", details: error.message }, { status: 500 })
    }

    await cleanupPhoneVariants(tenant, parsed.phone, numero)
    await cancelPendingTasks(tenant, parsed.phone)

    return NextResponse.json({ success: true, pause: data, normalizedPhone: parsed.phone })
  } catch (err) {
    console.error("[Admin Pausas POST] exception:", err)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

// PATCH /api/admin/pausas
export async function PATCH(req: NextRequest) {
  try {
    const session = await verifyAdmin()
    if (!session) return NextResponse.json({ error: "Acesso negado" }, { status: 403 })

    const body = await req.json()
    const { tenant, numero, pausar } = body

    if (!tenant || !validateTenant(tenant)) {
      return NextResponse.json({ error: "Tenant inválido" }, { status: 400 })
    }

    const parsed = parsePausePhone(numero)
    if (!parsed.phone) {
      return NextResponse.json({ error: parsed.error || "Número inválido" }, { status: 400 })
    }

    if (typeof pausar !== "boolean") {
      return NextResponse.json({ error: "Campo pausar deve ser boolean" }, { status: 400 })
    }

    const tables = getTablesForTenant(tenant)
    const supabase = createBiaSupabaseServerClient()
    const nowIso = new Date().toISOString()
    const actorPayload = buildPauseActorPayload({
      session,
      source: "admin_pause_panel",
    })
    const payload: Record<string, any> = {
      numero: parsed.phone,
      pausar,
      updated_at: nowIso,
      paused_until: null,
      pause_reason: pausar ? "manual_human_panel" : null,
    }

    if (pausar) {
      payload.pausado_em = nowIso
      Object.assign(payload, actorPayload)
    }

    let { data, error } = await supabase
      .from(tables.pausar)
      .upsert(payload, { onConflict: "numero", ignoreDuplicates: false })
      .select()
      .single()

    if (
      error &&
      (error.message?.includes("pausado_em") ||
        error.message?.includes("paused_until") ||
        error.message?.includes("pause_reason") ||
        isPauseActorColumnError(error))
    ) {
      const fallback = { ...payload }
      delete fallback.pausado_em
      delete fallback.paused_until
      delete fallback.pause_reason
      stripPauseActorPayload(fallback)
      const retry = await supabase
        .from(tables.pausar)
        .upsert(fallback, { onConflict: "numero", ignoreDuplicates: false })
        .select()
        .single()
      data = retry.data
      error = retry.error
    }

    if (error) {
      console.error("[Admin Pausas PATCH]", error)
      return NextResponse.json({ error: "Erro ao atualizar pausa", details: error.message }, { status: 500 })
    }

    await cleanupPhoneVariants(tenant, parsed.phone, numero)
    if (pausar) await cancelPendingTasks(tenant, parsed.phone)

    return NextResponse.json({ success: true, pause: data, normalizedPhone: parsed.phone })
  } catch (err) {
    console.error("[Admin Pausas PATCH] exception:", err)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

// DELETE /api/admin/pausas
export async function DELETE(req: NextRequest) {
  try {
    const session = await verifyAdmin()
    if (!session) return NextResponse.json({ error: "Acesso negado" }, { status: 403 })

    const body = await req.json()
    const { tenant, numero } = body

    if (!tenant || !validateTenant(tenant)) {
      return NextResponse.json({ error: "Tenant inválido" }, { status: 400 })
    }

    const parsed = parsePausePhone(numero)
    if (!parsed.phone) {
      return NextResponse.json({ error: parsed.error || "Número inválido" }, { status: 400 })
    }

    const tables = getTablesForTenant(tenant)
    const supabase = createBiaSupabaseServerClient()
    const variants = buildBrazilianPhoneVariants(numero)

    const { error } = await supabase.from(tables.pausar).delete().in("numero", variants)

    if (error) {
      console.error("[Admin Pausas DELETE]", error)
      return NextResponse.json({ error: "Erro ao remover pausa", details: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, normalizedPhone: parsed.phone })
  } catch (err) {
    console.error("[Admin Pausas DELETE] exception:", err)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}
