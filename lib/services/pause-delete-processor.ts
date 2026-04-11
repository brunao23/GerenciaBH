import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { resolveChatHistoriesTable } from "@/lib/helpers/resolve-chat-table"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"
import { ZApiService } from "@/lib/services/z-api.service"
import { resolveTenantDataPrefix } from "@/lib/helpers/tenant-resolution"

type PauseDeleteProcessResult = {
  success: boolean
  table?: string
  scanned: number
  processed: number
  paused: number
  deletedSystem: number
  deletedWhatsapp: number
  skipped: number
  errors: number
  error?: string
}

const TABLE_CANDIDATES = [
  "pause_delete",
  "pause_underline_delete",
  "Pause_delete",
  "pauseDelete",
]

const tenantPrefixCache = new Map<string, string[]>()
const tenantByPhoneCache = new Map<string, string | null>()
const chatTableByTenant = new Map<string, string>()

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = String(value).replace(/\D+/g, "")
  return digits.length >= 8 ? digits : null
}

function normalizeMessageId(value: any): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str.length > 0 ? str : null
}

function parseBool(value: any): boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value > 0
  const str = String(value).trim().toLowerCase()
  if (["true", "1", "yes", "y", "sim", "s"].includes(str)) return true
  if (["false", "0", "no", "n", "nao", "não"].includes(str)) return false
  return null
}

function pickValue(row: Record<string, any>, names: string[]): any {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null) return row[name]
  }
  const map = new Map<string, string>()
  Object.keys(row || {}).forEach((key) => map.set(key.toLowerCase(), key))
  for (const name of names) {
    const key = map.get(name.toLowerCase())
    if (key && row[key] !== undefined && row[key] !== null) return row[key]
  }
  return null
}

function extractProviderMessageId(msg: any): string | null {
  if (!msg) return null
  const candidates = [
    msg.messageId,
    msg.message_id,
    msg.id,
    msg.key?.id,
    msg.data?.messageId,
    msg.payload?.messageId,
    msg.message?.id,
    msg.message?.messageId,
  ]
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) return value
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return null
}

async function loadTenantPrefixes(
  supabase: ReturnType<typeof createBiaSupabaseServerClient>,
): Promise<string[]> {
  const cacheKey = "units_registry"
  const cached = tenantPrefixCache.get(cacheKey)
  if (cached) return cached

  const { data, error } = await supabase
    .from("units_registry")
    .select("unit_prefix")

  if (error) {
    console.warn("[PauseDelete] Falha ao carregar tenants:", error)
    return []
  }

  const rawPrefixes = (data || [])
    .map((row) => normalizeTenant(row.unit_prefix || ""))
    .filter((value) => value.length > 0)

  const resolved = await Promise.all(rawPrefixes.map((prefix) => resolveTenantDataPrefix(prefix)))
  const prefixes = Array.from(new Set(resolved.filter((value) => value.length > 0)))

  tenantPrefixCache.set(cacheKey, prefixes)
  return prefixes
}

function inferTenantFromChatLead(chatLead: string | null, prefixes: string[]): string | null {
  if (!chatLead) return null
  const normalized = normalizeTenant(chatLead)

  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) return prefix
  }

  const parts = chatLead.split(/[|:;,@\s]+/).map((part) => normalizeTenant(part))
  for (const part of parts) {
    if (part && prefixes.includes(part)) return part
  }

  for (const prefix of prefixes) {
    const regex = new RegExp(`(^|[^a-z0-9_])${prefix}([^a-z0-9_]|$)`, "i")
    if (regex.test(chatLead)) return prefix
  }

  return null
}

async function resolveChatTableForTenant(
  supabase: ReturnType<typeof createBiaSupabaseServerClient>,
  tenant: string,
) {
  const cached = chatTableByTenant.get(tenant)
  if (cached) return cached
  const table = await resolveChatHistoriesTable(supabase as any, tenant)
  chatTableByTenant.set(tenant, table)
  return table
}

async function tenantHasSession(
  supabase: ReturnType<typeof createBiaSupabaseServerClient>,
  tenant: string,
  sessionCandidates: string[],
): Promise<boolean> {
  if (sessionCandidates.length === 0) return false
  const chatTable = await resolveChatTableForTenant(supabase, tenant)

  const res = await supabase
    .from(chatTable)
    .select("id", { count: "planned", head: true })
    .in("session_id", sessionCandidates)

  if (res.error) return false
  if (typeof res.count === "number") return res.count > 0
  return false
}

async function inferTenantByPhone(
  supabase: ReturnType<typeof createBiaSupabaseServerClient>,
  phone: string | null,
  sessionId: string | null,
  prefixes: string[],
): Promise<string | null> {
  if (!phone && !sessionId) return null
  const cacheKey = `${phone || ""}|${sessionId || ""}`
  if (tenantByPhoneCache.has(cacheKey)) {
    return tenantByPhoneCache.get(cacheKey) || null
  }

  const sessionCandidates = [
    sessionId,
    phone,
    phone ? `${phone}@s.whatsapp.net` : null,
  ].filter((value): value is string => Boolean(value))

  for (const tenant of prefixes) {
    const found = await tenantHasSession(supabase, tenant, sessionCandidates)
    if (found) {
      tenantByPhoneCache.set(cacheKey, tenant)
      return tenant
    }
  }

  tenantByPhoneCache.set(cacheKey, null)
  return null
}

async function resolvePauseDeleteTable(supabase: ReturnType<typeof createBiaSupabaseServerClient>) {
  for (const table of TABLE_CANDIDATES) {
    try {
      const res = await supabase.from(table).select("id", { count: "planned", head: true })
      if (!res.error) return table
      const message = String(res.error?.message || "").toLowerCase()
      if (!message.includes("does not exist") && !message.includes("relation")) {
        return table
      }
    } catch {
      continue
    }
  }
  return null
}

async function loadPendingRows(
  supabase: ReturnType<typeof createBiaSupabaseServerClient>,
  table: string,
  limit: number,
) {
  let res = await supabase.from(table).select("*").is("processed_at", null).limit(limit)
  if (!res.error && res.data) return res.data

  res = await supabase.from(table).select("*").eq("processed", false).limit(limit)
  if (!res.error && res.data) return res.data

  res = await supabase.from(table).select("*").limit(limit)
  if (!res.error && res.data) return res.data

  throw res.error
}

async function markProcessed(
  supabase: ReturnType<typeof createBiaSupabaseServerClient>,
  table: string,
  row: Record<string, any>,
) {
  const rowId = row.id ?? row.uuid ?? row._id
  const nowIso = new Date().toISOString()

  if (rowId !== undefined && rowId !== null) {
    let res = await supabase.from(table).update({ processed_at: nowIso }).eq("id", rowId)
    if (!res.error) return

    res = await supabase.from(table).update({ processed: true }).eq("id", rowId)
    if (!res.error) return

    await supabase.from(table).delete().eq("id", rowId)
    return
  }

  const messageId = normalizeMessageId(pickValue(row, ["message_id", "messageId", "msg_id"]))
  const chatLead = pickValue(row, ["chat_lead", "lead", "session_id", "chat", "numero", "phone", "number"])
  if (messageId || chatLead) {
    let query = supabase.from(table).delete()
    if (messageId) query = query.eq("message_id", messageId)
    if (chatLead) query = query.eq("chat_lead", chatLead)
    await query
  }
}

async function pauseLead(
  supabase: ReturnType<typeof createBiaSupabaseServerClient>,
  tenant: string,
  phone: string,
) {
  const { pausar: pausarTable } = getTablesForTenant(tenant)
  const nowIso = new Date().toISOString()
  const payload = {
    numero: phone,
    pausar: true,
    vaga: true,
    agendamento: true,
    pausado_em: nowIso,
  }

  let res = await supabase.from(pausarTable).upsert(payload, { onConflict: "numero" })
  if (!res.error) return

  if (String(res.error?.message || "").includes("pausado_em")) {
    const { pausado_em, ...retry } = payload
    res = await supabase.from(pausarTable).upsert(retry, { onConflict: "numero" })
    if (!res.error) return
  }

  throw res.error
}

async function deleteMessageFromSystem(
  supabase: ReturnType<typeof createBiaSupabaseServerClient>,
  tenant: string,
  phone: string | null,
  sessionId: string | null,
  providerMessageId: string,
) {
  const chatTable = await resolveChatHistoriesTable(supabase as any, tenant)
  const sessionCandidates = new Set<string>()
  if (sessionId) sessionCandidates.add(sessionId)
  if (phone) {
    sessionCandidates.add(phone)
    sessionCandidates.add(`${phone}@s.whatsapp.net`)
  }

  let rows: any[] = []
  if (sessionCandidates.size > 0) {
    const res = await supabase
      .from(chatTable)
      .select("id, session_id, message")
      .in("session_id", Array.from(sessionCandidates))
      .limit(500)
    if (!res.error && res.data) rows = res.data
  }

  if (rows.length === 0 && phone) {
    const res = await supabase
      .from(chatTable)
      .select("id, session_id, message")
      .ilike("session_id", `%${phone}%`)
      .limit(500)
    if (!res.error && res.data) rows = res.data
  }

  if (rows.length === 0) return 0

  const matches = rows.filter((row) => {
    const msgId = extractProviderMessageId(row.message)
    return msgId === providerMessageId
  })

  if (matches.length === 0) return 0

  const ids = matches.map((row) => row.id).filter((id) => id !== undefined && id !== null)
  if (ids.length === 0) return 0

  const res = await supabase.from(chatTable).delete().in("id", ids).select("id")
  if (res.error) throw res.error
  return res.data?.length || 0
}

async function deleteMessageOnWhatsapp(
  tenant: string,
  phone: string,
  messageId: string,
  owner: boolean,
) {
  const config = await getMessagingConfigForTenant(tenant)
  let zapiConfig: {
    instanceId: string
    token: string
    clientToken: string
    apiUrl?: string
  } | null = null

  if (config && config.provider === "zapi") {
    const hasFullUrl = Boolean(config.sendTextUrl)
    const hasParts = Boolean(config.apiUrl && config.instanceId && config.token)
    if (config.clientToken && (hasFullUrl || hasParts)) {
      zapiConfig = {
        instanceId: config.instanceId || "ZAPI",
        token: config.token || "",
        clientToken: config.clientToken,
        apiUrl: config.sendTextUrl || config.apiUrl,
      }
    }
  }

  if (!zapiConfig) return false

  const zapi = new ZApiService(zapiConfig)
  const res = await zapi.deleteMessage({ messageId, phone, owner })
  return res.success === true
}

export async function processPauseDeleteQueue(
  limit = 200,
): Promise<PauseDeleteProcessResult> {
  const supabase = createBiaSupabaseServerClient()

  const table = await resolvePauseDeleteTable(supabase)
  if (!table) {
    return {
      success: false,
      scanned: 0,
      processed: 0,
      paused: 0,
      deletedSystem: 0,
      deletedWhatsapp: 0,
      skipped: 0,
      errors: 0,
      error: "pause_delete table not found",
    }
  }

  let rows: any[] = []
  try {
    rows = await loadPendingRows(supabase, table, limit)
  } catch (error: any) {
    return {
      success: false,
      table,
      scanned: 0,
      processed: 0,
      paused: 0,
      deletedSystem: 0,
      deletedWhatsapp: 0,
      skipped: 0,
      errors: 1,
      error: error?.message || "Failed to load pause_delete rows",
    }
  }

  let paused = 0
  let deletedSystem = 0
  let deletedWhatsapp = 0
  let processed = 0
  let skipped = 0
  let errors = 0

  for (const row of rows) {
    try {
      const chatLead = pickValue(row, [
        "chat_lead",
        "lead",
        "chat",
        "session_id",
        "sessionId",
        "numero",
        "phone",
        "number",
      ])
      const name = pickValue(row, ["name", "nome", "user_name", "username", "contact_name"])

      const messageId = normalizeMessageId(
        pickValue(row, ["message_id", "messageId", "msg_id", "id_message", "messageid"]),
      )
      const phone = normalizePhone(
        chatLead || pickValue(row, ["phone", "numero", "number"]),
      )

      const tenantRaw = pickValue(row, [
        "tenant",
        "unit_prefix",
        "unit",
        "empresa",
        "schema",
        "client",
        "org",
      ])
      let tenant = normalizeTenant(tenantRaw || "")

      const prefixes = await loadTenantPrefixes(supabase)
      if (!tenant && prefixes.length === 1) {
        tenant = prefixes[0]
      }

      if (!tenant) {
        tenant = inferTenantFromChatLead(
          typeof chatLead === "string" ? chatLead : null,
          prefixes,
        ) || ""
      }

      if (!tenant && prefixes.length > 0) {
        tenant = await inferTenantByPhone(
          supabase,
          phone,
          typeof chatLead === "string" ? chatLead : null,
          prefixes,
        ) || ""
      }

      if (!tenant) {
        skipped += 1
        console.warn("[PauseDelete] Tenant nao identificado para linha:", row)
        continue
      }

      const direction = String(
        pickValue(row, ["direction", "tipo", "type", "sent_or_received", "sent_received"]) || "",
      ).toLowerCase()

      const fromMeValue = pickValue(row, ["fromMe", "from_me", "owner", "is_from_me", "isFromMe", "froming"])
      const fromApiValue = pickValue(row, ["fromApi", "from_api", "isFromApi", "is_from_api", "api", "is_api", "fromAPI"])
      const sentValue = pickValue(row, ["sent", "enviada", "is_sent"])
      const receivedValue = pickValue(row, ["received", "recebida", "is_received"])

      const fromMe = parseBool(fromMeValue)
      const fromApi = parseBool(fromApiValue)
      const isSent = parseBool(sentValue)
      const isReceived = parseBool(receivedValue)

      const directionIsSent =
        fromMe === true ||
        isSent === true ||
        direction.includes("sent") ||
        direction.includes("enviada") ||
        direction.includes("out")

      const directionIsReceived =
        fromMe === false ||
        isReceived === true ||
        direction.includes("receb") ||
        direction.includes("in") ||
        direction.includes("received")

      const humanOutbound = fromMe === true && fromApi !== true
      const shouldPause = humanOutbound || directionIsReceived || (!directionIsSent && !directionIsReceived)

      if (shouldPause && phone) {
        await pauseLead(supabase, tenant, phone)
        paused += 1
      }

      const deleteFlag = (() => {
        const flag = pickValue(row, [
          "delete",
          "excluir",
          "remover",
          "should_delete",
          "delete_message",
          "is_deleted",
          "deleted",
          "action",
          "event",
          "type",
          "status",
          "event_type",
          "action_type",
        ])
        if (typeof flag === "string") {
          const lower = flag.toLowerCase()
          if (
            lower.includes("delete") ||
            lower.includes("deleted") ||
            lower.includes("revoked") ||
            lower.includes("remove") ||
            lower.includes("excluir")
          ) {
            return true
          }
        }
        const parsed = parseBool(flag)
        return parsed === true
      })()

      if (deleteFlag && messageId) {
        const deletedCount = await deleteMessageFromSystem(
          supabase,
          tenant,
          phone,
          typeof chatLead === "string" ? chatLead : null,
          messageId,
        )
        deletedSystem += deletedCount

        const deleteWhatsappFlag = parseBool(
          pickValue(row, ["delete_whatsapp", "whatsapp", "delete_on_whatsapp"]),
        )
        if (deleteWhatsappFlag && phone) {
          const ok = await deleteMessageOnWhatsapp(
            tenant,
            phone,
            messageId,
            directionIsSent,
          )
          if (ok) deletedWhatsapp += 1
        }
      }

      await markProcessed(supabase, table, row)
      processed += 1
    } catch (error) {
      errors += 1
    }
  }

  return {
    success: true,
    table,
    scanned: rows.length,
    processed,
    paused,
    deletedSystem,
    deletedWhatsapp,
    skipped,
    errors,
  }
}
