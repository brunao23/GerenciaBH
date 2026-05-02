/**
 * Purga memória de um lead (histórico, follow-up, tarefas e pausas) em múltiplos tenants.
 *
 * Uso:
 *   npx tsx scripts/purge-lead-memory.ts 5522992523549
 *   npx tsx scripts/purge-lead-memory.ts 5522992523549 --tenant=vox_maceio
 */

import { config as dotenvConfig } from "dotenv"
import { resolve } from "path"

dotenvConfig({ path: resolve(process.cwd(), ".env.local") })
dotenvConfig({ path: resolve(process.cwd(), ".env") })

import { createBiaSupabaseServerClient } from "../lib/supabase/bia-client"
import { getTablesForTenant } from "../lib/helpers/tenant"
import { resolveChatHistoriesTable } from "../lib/helpers/resolve-chat-table"
import { normalizePhoneNumber, normalizeSessionId } from "../lib/services/tenant-chat-history.service"
import { normalizeTenant } from "../lib/helpers/normalize-tenant"

type SupabaseClient = ReturnType<typeof createBiaSupabaseServerClient>

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

function buildVariants(seed: string) {
  const sessionVariantsSet = new Set<string>()
  const phoneVariantsSet = new Set<string>()
  const chatLidVariantsSet = new Set<string>()

  const raw = String(seed || "").trim()
  const normalizedSession = normalizeSessionId(raw)

  if (raw) {
    sessionVariantsSet.add(raw)
    addPhoneIdentityVariants(sessionVariantsSet, raw)
    addPhoneIdentityVariants(phoneVariantsSet, raw)
  }

  if (normalizedSession) {
    sessionVariantsSet.add(normalizedSession)
    addPhoneIdentityVariants(sessionVariantsSet, normalizedSession)
    addPhoneIdentityVariants(phoneVariantsSet, normalizedSession)
  }

  if (normalizedSession.startsWith("lid_")) {
    const digits = normalizedSession.slice(4)
    addPhoneIdentityVariants(sessionVariantsSet, digits)
    addPhoneIdentityVariants(phoneVariantsSet, digits)
  }

  for (const value of [...sessionVariantsSet, ...phoneVariantsSet]) {
    const str = String(value || "").trim()
    if (!str) continue
    if (/@lid$/i.test(str)) chatLidVariantsSet.add(str)
    if (/^lid_/i.test(str)) {
      const digits = onlyDigits(str)
      if (digits) chatLidVariantsSet.add(`${digits}@lid`)
    }
    const digits = onlyDigits(str)
    if (digits.length >= 8) {
      const normalized = normalizePhoneNumber(digits)
      if (normalized) chatLidVariantsSet.add(`${normalized}@lid`)
      if (normalized.startsWith("55") && normalized.length > 10) {
        chatLidVariantsSet.add(`${normalized.slice(2)}@lid`)
      }
    }
  }

  return {
    sessionVariants: Array.from(sessionVariantsSet).filter(Boolean),
    phoneVariants: Array.from(phoneVariantsSet).filter(Boolean),
    chatLidVariants: Array.from(chatLidVariantsSet).filter(Boolean),
  }
}

async function deleteByIn(
  supabase: SupabaseClient,
  params: { table: string; column: string; values: string[]; tenant?: string; tenantScoped?: boolean },
): Promise<number> {
  const values = Array.from(new Set(params.values.map((v) => String(v || "").trim()).filter(Boolean)))
  if (!params.table || !params.column || values.length === 0) return 0

  let query: any = supabase.from(params.table).delete({ count: "exact" }).in(params.column, values)
  if (params.tenant && params.tenantScoped) query = query.eq("tenant", params.tenant)
  const { error, count } = await query
  if (error) {
    if (isMissingTableError(error) || isMissingColumnError(error)) return 0
    console.warn(`[purge-lead-memory] deleteByIn failed ${params.table}.${params.column}: ${error.message}`)
    return 0
  }
  return count || 0
}

async function deleteByEq(
  supabase: SupabaseClient,
  params: { table: string; column: string; value: string; tenant?: string; tenantScoped?: boolean },
): Promise<number> {
  const value = String(params.value || "").trim()
  if (!params.table || !params.column || !value) return 0
  let query: any = supabase.from(params.table).delete({ count: "exact" }).eq(params.column, value)
  if (params.tenant && params.tenantScoped) query = query.eq("tenant", params.tenant)
  const { error, count } = await query
  if (error) {
    if (isMissingTableError(error) || isMissingColumnError(error)) return 0
    console.warn(`[purge-lead-memory] deleteByEq failed ${params.table}.${params.column}: ${error.message}`)
    return 0
  }
  return count || 0
}

async function purgeTenantLead(params: {
  supabase: SupabaseClient
  tenant: string
  sessionVariants: string[]
  phoneVariants: string[]
  chatLidVariants: string[]
}) {
  const { supabase, tenant, sessionVariants, phoneVariants, chatLidVariants } = params
  const tables = getTablesForTenant(tenant)
  const chatTable = await resolveChatHistoriesTable(supabase as any, tenant)

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

  const breakdown: Record<string, number> = {}
  let totalDeleted = 0

  for (const table of tenantTables) {
    let deletedInTable = 0

    deletedInTable += await deleteByIn(supabase, { table, column: "session_id", values: sessionVariants })

    for (const column of ["numero", "contato", "phone_number", "phone", "lead_phone", "whatsapp", "lead_id"]) {
      deletedInTable += await deleteByIn(supabase, { table, column, values: phoneVariants })
    }

    deletedInTable += await deleteByIn(supabase, { table, column: "chat_lid", values: chatLidVariants })

    if (table === chatTable) {
      for (const value of [...phoneVariants, ...sessionVariants, ...chatLidVariants]) {
        deletedInTable += await deleteByEq(supabase, { table, column: "message->>phone", value })
        deletedInTable += await deleteByEq(supabase, { table, column: "message->>session_id", value })
        deletedInTable += await deleteByEq(supabase, { table, column: "message->>resolved_session_id", value })
        deletedInTable += await deleteByEq(supabase, { table, column: "message->>chat_lid", value })
      }
    }

    if (deletedInTable > 0) {
      breakdown[table] = deletedInTable
      totalDeleted += deletedInTable
    }
  }

  for (const table of ["followup_schedule", "followup_logs", "agent_task_queue"]) {
    let deletedInTable = 0
    deletedInTable += await deleteByIn(supabase, {
      table,
      column: "session_id",
      values: sessionVariants,
      tenant,
      tenantScoped: true,
    })
    for (const column of ["phone_number", "numero", "contato", "phone", "lead_phone"]) {
      deletedInTable += await deleteByIn(supabase, {
        table,
        column,
        values: phoneVariants,
        tenant,
        tenantScoped: true,
      })
    }
    deletedInTable += await deleteByIn(supabase, {
      table,
      column: "chat_lid",
      values: chatLidVariants,
      tenant,
      tenantScoped: true,
    })

    if (deletedInTable > 0) {
      breakdown[table] = (breakdown[table] || 0) + deletedInTable
      totalDeleted += deletedInTable
    }
  }

  return { tenant, totalDeleted, breakdown }
}

async function resolveTenants(supabase: SupabaseClient, tenantArg: string | null): Promise<string[]> {
  if (tenantArg) return [normalizeTenant(tenantArg)]

  const { data } = await supabase
    .from("units_registry")
    .select("unit_prefix")
    .not("unit_prefix", "is", null)
    .limit(500)

  const tenants = Array.from(
    new Set((data || []).map((row: any) => normalizeTenant(String(row?.unit_prefix || ""))).filter(Boolean)),
  )
  return tenants
}

async function main() {
  const args = process.argv.slice(2)
  const seed = String(args[0] || "").trim()
  const tenantArgRaw = args.find((arg) => arg.startsWith("--tenant="))
  const tenantArg = tenantArgRaw ? tenantArgRaw.split("=", 2)[1] : null

  if (!seed) {
    throw new Error("Informe o número/session do lead. Ex: npx tsx scripts/purge-lead-memory.ts 5522992523549")
  }

  const supabase = createBiaSupabaseServerClient()
  const { sessionVariants, phoneVariants, chatLidVariants } = buildVariants(seed)
  const tenants = await resolveTenants(supabase, tenantArg)

  if (!tenants.length) throw new Error("Nenhum tenant encontrado.")

  console.log(`[purge-lead-memory] seed=${seed}`)
  console.log(`[purge-lead-memory] tenants=${tenants.length}`)
  console.log(`[purge-lead-memory] sessionVariants=${JSON.stringify(sessionVariants)}`)
  console.log(`[purge-lead-memory] phoneVariants=${JSON.stringify(phoneVariants)}`)
  console.log(`[purge-lead-memory] chatLidVariants=${JSON.stringify(chatLidVariants)}`)

  let total = 0
  const tenantResults: Array<{ tenant: string; totalDeleted: number; breakdown: Record<string, number> }> = []

  for (const tenant of tenants) {
    const result = await purgeTenantLead({ supabase, tenant, sessionVariants, phoneVariants, chatLidVariants })
    if (result.totalDeleted > 0) {
      tenantResults.push(result)
      total += result.totalDeleted
    }
  }

  console.log(`\n[purge-lead-memory] totalDeleted=${total}`)
  if (!tenantResults.length) {
    console.log("[purge-lead-memory] Nenhum registro encontrado para remover.")
    return
  }

  for (const item of tenantResults) {
    console.log(`\n[tenant=${item.tenant}] removed=${item.totalDeleted}`)
    for (const [table, count] of Object.entries(item.breakdown)) {
      console.log(`  - ${table}: ${count}`)
    }
  }
}

main().catch((error: any) => {
  console.error("[purge-lead-memory] fatal:", error?.message || error)
  process.exit(1)
})

