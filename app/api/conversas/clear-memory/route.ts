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

function addPhoneIdentityVariants(result: Set<string>, input: string) {
  const digits = onlyDigits(input)
  if (digits.length < 8) return

  const normalized = normalizePhoneNumber(digits)
  if (!normalized) return

  const without55 = normalized.startsWith("55") && normalized.length > 10 ? normalized.slice(2) : ""

  result.add(digits)
  result.add(normalized)
  if (without55) result.add(without55)

  result.add(`${normalized}@s.whatsapp.net`)
  result.add(`${normalized}@c.us`)
  result.add(`lid_${normalized}`)
  result.add(`${normalized}@lid`)

  if (without55) {
    result.add(`${without55}@s.whatsapp.net`)
    result.add(`${without55}@c.us`)
    result.add(`lid_${without55}`)
    result.add(`${without55}@lid`)
  }
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

  try {
    let query: any = supabase.from(params.table).delete({ count: "exact" }).in(params.column, values)
    if (params.tenant && params.tenantColumnExists) {
      query = query.eq("tenant", params.tenant)
    }

    const { error, count } = await query
    if (error) {
      if (isMissingTableError(error) || isMissingColumnError(error)) return 0
      console.warn(`[clear-memory] deleteByIn failed table=${params.table} column=${params.column}:`, error.message)
      return 0
    }
    return count || 0
  } catch (e: any) {
    console.warn(`[clear-memory] deleteByIn exception table=${params.table}:`, e.message)
    return 0
  }
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

  try {
    let query: any = supabase.from(params.table).delete({ count: "exact" }).eq(params.column, value)
    if (params.tenant && params.tenantColumnExists) {
      query = query.eq("tenant", params.tenant)
    }

    const { error, count } = await query
    if (error) {
      if (isMissingTableError(error) || isMissingColumnError(error)) return 0
      console.warn(`[clear-memory] deleteByEq failed table=${params.table} column=${params.column}:`, error.message)
      return 0
    }
    return count || 0
  } catch (e: any) {
    console.warn(`[clear-memory] deleteByEq exception table=${params.table}:`, e.message)
    return 0
  }
}

function buildSessionVariants(input: string): string[] {
  const result = new Set<string>()
  const raw = String(input || "").trim()
  if (!raw) return []

  const normalizedSession = normalizeSessionId(raw)
  if (normalizedSession) result.add(normalizedSession)
  result.add(raw)

  addPhoneIdentityVariants(result, raw)
  if (normalizedSession && normalizedSession !== raw) addPhoneIdentityVariants(result, normalizedSession)

  if (normalizedSession.startsWith("lid_")) {
    addPhoneIdentityVariants(result, normalizedSession.slice(4))
  }

  return Array.from(result).filter(Boolean).slice(0, 40)
}

function buildPhoneVariants(input: string): string[] {
  const result = new Set<string>()
  addPhoneIdentityVariants(result, input)
  return Array.from(result).filter(Boolean).slice(0, 40)
}

function buildChatLidVariants(input: string, sessionVariants: string[], phoneVariants: string[]): string[] {
  const result = new Set<string>()
  const raw = String(input || "").trim()
  if (raw) result.add(raw)

  const sources = [...sessionVariants, ...phoneVariants]
  for (const source of sources) {
    const value = String(source || "").trim()
    if (!value) continue
    if (/@lid$/i.test(value)) result.add(value)
    if (/^lid_/i.test(value)) {
      const digits = onlyDigits(value)
      if (digits) result.add(`${digits}@lid`)
    }

    const digits = onlyDigits(value)
    if (digits.length >= 8) {
      const normalized = normalizePhoneNumber(digits)
      if (normalized) result.add(`${normalized}@lid`)
      if (normalized.startsWith("55") && normalized.length > 10) {
        result.add(`${normalized.slice(2)}@lid`)
      }
    }
  }

  return Array.from(result).filter(Boolean).slice(0, 40)
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
    const chatLidVariants = buildChatLidVariants(chatLidRaw, sessionVariants, phoneVariants)

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
      const hasColumnMetadata = Boolean(columns && columns.size > 0)
      const canUseColumn = (column: string) => !hasColumnMetadata || columns.has(column)

      let deletedInTable = 0

      if (sessionVariants.length > 0 && canUseColumn("session_id")) {
        deletedInTable += await deleteByIn(supabase, {
          table,
          column: "session_id",
          values: sessionVariants,
        })
      }

      if (phoneVariants.length > 0) {
        const phoneColumns = ["numero", "contato", "phone_number", "phone", "lead_phone", "whatsapp", "lead_id"]
        for (const column of phoneColumns) {
          if (!canUseColumn(column)) continue
          deletedInTable += await deleteByIn(supabase, {
            table,
            column,
            values: phoneVariants,
          })
        }
      }

      if (chatLidVariants.length > 0 && canUseColumn("chat_lid")) {
        deletedInTable += await deleteByIn(supabase, {
          table,
          column: "chat_lid",
          values: chatLidVariants,
        })
      }

      if (table === chatTable && canUseColumn("message")) {
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
      const hasColumnMetadata = Boolean(columns && columns.size > 0)
      const canUseColumn = (column: string) => !hasColumnMetadata || columns.has(column)
      const tenantScoped = canUseColumn("tenant")
      let deletedInTable = 0

      if (sessionVariants.length > 0 && canUseColumn("session_id")) {
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
          if (!canUseColumn(column)) continue
          deletedInTable += await deleteByIn(supabase, {
            table,
            column,
            values: phoneVariants,
            tenant,
            tenantColumnExists: tenantScoped,
          })
        }
      }

      if (chatLidVariants.length > 0 && canUseColumn("chat_lid")) {
        deletedInTable += await deleteByIn(supabase, {
          table,
          column: "chat_lid",
          values: chatLidVariants,
          tenant,
          tenantColumnExists: tenantScoped,
        })
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
