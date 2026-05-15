import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { getTablesForTenant } from "@/lib/helpers/tenant"

type InternalItemType = "note" | "task" | "reminder"
type InternalItemStatus = "open" | "done" | "archived"

const VALID_TYPES = new Set<InternalItemType>(["note", "task", "reminder"])
const VALID_STATUSES = new Set<InternalItemStatus>(["open", "done", "archived"])

function isMissingTableError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  return code === "42P01" || message.includes("does not exist") || message.includes("relation")
}

function normalizePhone(value: unknown): string {
  const digits = String(value || "").replace(/\D/g, "")
  if (!digits) return ""
  return digits.startsWith("55") ? digits : `55${digits}`
}

function normalizeText(value: unknown, maxLength: number): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength)
}

async function resolveTenantContext(req: Request) {
  const tenantInfo = await getTenantFromRequest().catch(() => null)
  const tenant = tenantInfo?.tenant || (await resolveTenant(req))
  return {
    tenant,
    userId: tenantInfo?.session?.userId || "operador",
  }
}

function buildIdentityFilters(params: {
  leadId?: string
  sessionId?: string
  phone?: string
}): string {
  const filters: string[] = []
  const leadId = normalizeText(params.leadId, 220)
  const sessionId = normalizeText(params.sessionId, 220)
  const phone = normalizePhone(params.phone)

  if (leadId) filters.push(`lead_id.eq.${leadId}`)
  if (sessionId && sessionId !== leadId) filters.push(`session_id.eq.${sessionId}`)
  if (phone) {
    const without55 = phone.startsWith("55") ? phone.slice(2) : phone
    filters.push(`phone.eq.${phone}`)
    if (without55 && without55 !== phone) filters.push(`phone.eq.${without55}`)
  }

  return filters.join(",")
}

export async function GET(req: Request) {
  try {
    const { tenant } = await resolveTenantContext(req)
    const tables = getTablesForTenant(tenant)
    const table = tables.leadInternalItems
    const supabase = createBiaSupabaseServerClient()
    const url = new URL(req.url)
    const filters = buildIdentityFilters({
      leadId: url.searchParams.get("leadId") || "",
      sessionId: url.searchParams.get("sessionId") || "",
      phone: url.searchParams.get("phone") || "",
    })

    if (!filters) {
      return NextResponse.json({ error: "leadId, sessionId ou phone e obrigatorio" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from(table)
      .select("*")
      .or(filters)
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ items: [], missingTable: true })
      }
      throw error
    }

    return NextResponse.json({ items: data || [] })
  } catch (error: any) {
    console.error("[LeadWorkspace] GET error:", error)
    return NextResponse.json(
      { error: error?.message || "Erro ao buscar notas do lead" },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const { tenant, userId } = await resolveTenantContext(req)
    const tables = getTablesForTenant(tenant)
    const table = tables.leadInternalItems
    const supabase = createBiaSupabaseServerClient()
    const body = await req.json().catch(() => ({}))

    const itemType = normalizeText(body?.itemType || body?.item_type || "note", 20) as InternalItemType
    const content = normalizeText(body?.content, 3000)
    const leadId = normalizeText(body?.leadId || body?.lead_id, 220)
    const sessionId = normalizeText(body?.sessionId || body?.session_id || leadId, 220)
    const phone = normalizePhone(body?.phone)
    const dueAtRaw = String(body?.dueAt || body?.due_at || "").trim()
    const dueAtDate = dueAtRaw ? new Date(dueAtRaw) : null

    if (!VALID_TYPES.has(itemType)) {
      return NextResponse.json({ error: "Tipo invalido" }, { status: 400 })
    }
    if (!content) {
      return NextResponse.json({ error: "Conteudo e obrigatorio" }, { status: 400 })
    }
    if (!leadId && !sessionId && !phone) {
      return NextResponse.json({ error: "leadId, sessionId ou phone e obrigatorio" }, { status: 400 })
    }
    if (dueAtRaw && (!dueAtDate || Number.isNaN(dueAtDate.getTime()))) {
      return NextResponse.json({ error: "Data do lembrete invalida" }, { status: 400 })
    }
    const dueAt = dueAtDate ? dueAtDate.toISOString() : null

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from(table)
      .insert({
        lead_id: leadId || sessionId || phone,
        session_id: sessionId || leadId || phone,
        phone,
        item_type: itemType,
        content,
        status: "open",
        due_at: dueAt,
        created_by: userId,
        metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : {},
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single()

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          { error: "Tabela de notas internas ainda nao criada para esta unidade" },
          { status: 503 },
        )
      }
      throw error
    }

    return NextResponse.json({ item: data })
  } catch (error: any) {
    console.error("[LeadWorkspace] POST error:", error)
    return NextResponse.json(
      { error: error?.message || "Erro ao salvar item interno do lead" },
      { status: 500 },
    )
  }
}

export async function PATCH(req: Request) {
  try {
    const { tenant } = await resolveTenantContext(req)
    const tables = getTablesForTenant(tenant)
    const table = tables.leadInternalItems
    const supabase = createBiaSupabaseServerClient()
    const body = await req.json().catch(() => ({}))
    const id = normalizeText(body?.id, 80)
    if (!id) return NextResponse.json({ error: "id e obrigatorio" }, { status: 400 })

    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body?.content !== undefined) {
      const content = normalizeText(body.content, 3000)
      if (!content) return NextResponse.json({ error: "Conteudo invalido" }, { status: 400 })
      updatePayload.content = content
    }
    if (body?.status !== undefined) {
      const status = normalizeText(body.status, 20) as InternalItemStatus
      if (!VALID_STATUSES.has(status)) return NextResponse.json({ error: "Status invalido" }, { status: 400 })
      updatePayload.status = status
      if (status === "done") updatePayload.completed_at = new Date().toISOString()
    }
    if (body?.dueAt !== undefined || body?.due_at !== undefined) {
      const dueAtRaw = String(body?.dueAt || body?.due_at || "").trim()
      const dueAtDate = dueAtRaw ? new Date(dueAtRaw) : null
      if (dueAtRaw && (!dueAtDate || Number.isNaN(dueAtDate.getTime()))) {
        return NextResponse.json({ error: "Data do lembrete invalida" }, { status: 400 })
      }
      updatePayload.due_at = dueAtDate ? dueAtDate.toISOString() : null
    }

    const { data, error } = await supabase
      .from(table)
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single()

    if (error) throw error
    return NextResponse.json({ item: data })
  } catch (error: any) {
    console.error("[LeadWorkspace] PATCH error:", error)
    return NextResponse.json(
      { error: error?.message || "Erro ao atualizar item interno do lead" },
      { status: 500 },
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const { tenant } = await resolveTenantContext(req)
    const tables = getTablesForTenant(tenant)
    const table = tables.leadInternalItems
    const supabase = createBiaSupabaseServerClient()
    const body = await req.json().catch(() => ({}))
    const id = normalizeText(body?.id, 80)
    if (!id) return NextResponse.json({ error: "id e obrigatorio" }, { status: 400 })

    const { error } = await supabase.from(table).delete().eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error("[LeadWorkspace] DELETE error:", error)
    return NextResponse.json(
      { error: error?.message || "Erro ao remover item interno do lead" },
      { status: 500 },
    )
  }
}
