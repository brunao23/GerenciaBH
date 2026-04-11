import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"
import { getTableColumns } from "@/lib/helpers/supabase-table-columns"
import { normalizePhoneNumber, normalizeSessionId } from "@/lib/services/tenant-chat-history.service"

function onlyDigits(value: string): string {
  return String(value || "").replace(/\D/g, "")
}

function isMissingTableError(error: any): boolean {
  const code = String(error?.code || "").toUpperCase()
  const message = String(error?.message || "").toLowerCase()
  return code === "42P01" || (message.includes("relation") && message.includes("does not exist"))
}

function isMissingColumnError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase()
  return message.includes("column") && message.includes("does not exist")
}

async function deleteByIn(
  supabase: ReturnType<typeof createBiaSupabaseServerClient>,
  params: {
    table: string
    column: string
    values: string[]
    tenant?: string
    tenantColumnExists?: boolean
  },
): Promise<number> {
  const values = Array.from(new Set(params.values.map((v) => String(v || "").trim()).filter(Boolean)))
  if (!params.table || !params.column || values.length === 0) return 0

  let query: any = supabase.from(params.table).delete().in(params.column, values)
  if (params.tenant && params.tenantColumnExists) {
    query = query.eq("tenant", params.tenant)
  }

  let result = await query.select("id")
  if (result.error && isMissingColumnError(result.error)) {
    query = supabase.from(params.table).delete().in(params.column, values)
    if (params.tenant && params.tenantColumnExists) {
      query = query.eq("tenant", params.tenant)
    }
    result = await query.select()
  }

  if (result.error) {
    if (isMissingTableError(result.error)) return 0
    console.warn(
      `[clear-memory] deleteByIn failed table=${params.table} column=${params.column}:`,
      result.error.message,
    )
    return 0
  }

  return Array.isArray(result.data) ? result.data.length : 0
}

async function deleteByEq(
  supabase: ReturnType<typeof createBiaSupabaseServerClient>,
  params: {
    table: string
    column: string
    value: string
    tenant?: string
    tenantColumnExists?: boolean
  },
): Promise<number> {
  const value = String(params.value || "").trim()
  if (!params.table || !params.column || !value) return 0

  let query: any = supabase.from(params.table).delete().eq(params.column, value)
  if (params.tenant && params.tenantColumnExists) {
    query = query.eq("tenant", params.tenant)
  }

  let result = await query.select("id")
  if (result.error && isMissingColumnError(result.error)) {
    query = supabase.from(params.table).delete().eq(params.column, value)
    if (params.tenant && params.tenantColumnExists) {
      query = query.eq("tenant", params.tenant)
    }
    result = await query.select()
  }

  if (result.error) {
    if (isMissingTableError(result.error)) return 0
    console.warn(
      `[clear-memory] deleteByEq failed table=${params.table} column=${params.column}:`,
      result.error.message,
    )
    return 0
  }

  return Array.isArray(result.data) ? result.data.length : 0
}

function buildSessionVariants(input: string): string[] {
  const result = new Set<string>()
  const raw = String(input || "").trim()
  if (!raw) return []

  const normalizedSession = normalizeSessionId(raw)
  if (normalizedSession) result.add(normalizedSession)
  result.add(raw)

  const digits = onlyDigits(raw)
  if (digits.length >= 8) {
    const phone = normalizePhoneNumber(digits)
    if (phone) result.add(phone)
    if (phone.startsWith("55") && phone.length > 10) result.add(phone.slice(2))
  }

  return Array.from(result)
}

function buildPhoneVariants(input: string): string[] {
  const result = new Set<string>()
  const rawDigits = onlyDigits(input)
  if (rawDigits.length < 8) return []

  const normalized = normalizePhoneNumber(rawDigits)
  if (normalized) {
    result.add(normalized)
    if (normalized.startsWith("55") && normalized.length > 10) {
      result.add(normalized.slice(2))
    }
  }
  result.add(rawDigits)
  return Array.from(result)
}

export async function POST(req: Request) {
  try {
    const tenant = await resolveTenant(req)
    const body = await req.json().catch(() => ({}))

    const sessionRaw = String(body?.sessionId || body?.session_id || "").trim()
    const numberRaw = String(body?.number || body?.phone || body?.numero || "").trim()
    const chatLidRaw = String(body?.chatLid || "").trim()

    const sessionVariants = buildSessionVariants(sessionRaw)
    const phoneVariants = buildPhoneVariants(numberRaw || sessionRaw)
    const chatLidVariants = chatLidRaw ? [chatLidRaw] : []

    if (sessionVariants.length === 0 && phoneVariants.length === 0 && chatLidVariants.length === 0) {
      return NextResponse.json(
        { success: false, error: "sessionId ou numero obrigatorio" },
        { status: 400 },
      )
    }

    const supabase = createBiaSupabaseServerClient()
    const tables = getTablesForTenant(tenant)
    const chatTable = await resolveChatHistoriesTable(supabase as any, tenant)

    let totalDeleted = 0
    const breakdown: Record<string, number> = {}

    const tenantTables = [
      chatTable,
      tables.pausar,
      tables.agendamentos,
      tables.followNormal,
      tables.followup,
      tables.disparo,
      tables.lembretes,
      tables.crmLeadStatus,
      tables.notifications,
      tables.automationLogs,
    ]

    for (const table of tenantTables) {
      const columns = await getTableColumns(supabase as any, table)
      if (!columns || columns.size === 0) continue

      let deletedInTable = 0

      if (sessionVariants.length > 0 && columns.has("session_id")) {
        deletedInTable += await deleteByIn(supabase, {
          table,
          column: "session_id",
          values: sessionVariants,
        })
      }

      if (phoneVariants.length > 0) {
        const phoneColumns = ["numero", "contato", "phone_number", "phone", "lead_phone", "whatsapp", "lead_id"]
        for (const column of phoneColumns) {
          if (!columns.has(column)) continue
          deletedInTable += await deleteByIn(supabase, {
            table,
            column,
            values: phoneVariants,
          })
        }
      }

      if (chatLidVariants.length > 0 && columns.has("chat_lid")) {
        deletedInTable += await deleteByIn(supabase, {
          table,
          column: "chat_lid",
          values: chatLidVariants,
        })
      }

      if (table === chatTable && columns.has("message")) {
        for (const phone of phoneVariants) {
          deletedInTable += await deleteByEq(supabase, {
            table,
            column: "message->>phone",
            value: phone,
          })
          deletedInTable += await deleteByEq(supabase, {
            table,
            column: "message->>session_id",
            value: phone,
          })
          deletedInTable += await deleteByEq(supabase, {
            table,
            column: "message->>resolved_session_id",
            value: phone,
          })
        }

        for (const session of sessionVariants) {
          deletedInTable += await deleteByEq(supabase, {
            table,
            column: "message->>session_id",
            value: session,
          })
          deletedInTable += await deleteByEq(supabase, {
            table,
            column: "message->>resolved_session_id",
            value: session,
          })
        }

        for (const chatLid of chatLidVariants) {
          deletedInTable += await deleteByEq(supabase, {
            table,
            column: "message->>chat_lid",
            value: chatLid,
          })
        }
      }

      if (deletedInTable > 0) {
        breakdown[table] = (breakdown[table] || 0) + deletedInTable
        totalDeleted += deletedInTable
      }
    }

    const globalTables = ["followup_schedule", "followup_logs", "agent_task_queue"]
    for (const table of globalTables) {
      const columns = await getTableColumns(supabase as any, table)
      if (!columns || columns.size === 0) continue

      const tenantScoped = columns.has("tenant")
      let deletedInTable = 0

      if (sessionVariants.length > 0 && columns.has("session_id")) {
        deletedInTable += await deleteByIn(supabase, {
          table,
          column: "session_id",
          values: sessionVariants,
          tenant,
          tenantColumnExists: tenantScoped,
        })
      }

      if (phoneVariants.length > 0) {
        const phoneColumns = ["phone_number", "numero", "contato", "phone", "lead_phone"]
        for (const column of phoneColumns) {
          if (!columns.has(column)) continue
          deletedInTable += await deleteByIn(supabase, {
            table,
            column,
            values: phoneVariants,
            tenant,
            tenantColumnExists: tenantScoped,
          })
        }
      }

      if (deletedInTable > 0) {
        breakdown[table] = (breakdown[table] || 0) + deletedInTable
        totalDeleted += deletedInTable
      }
    }

    return NextResponse.json({
      success: true,
      tenant,
      totalDeleted,
      breakdown,
      sessionVariants,
      phoneVariants,
      rule: "lead_memory_purged",
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "failed_to_clear_memory",
      },
      { status: 500 },
    )
  }
}

