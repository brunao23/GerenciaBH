import { getNativeAgentConfigForTenant } from "@/lib/helpers/native-agent-config"
import { REGISTERED_TENANTS, getTablesForTenant } from "@/lib/helpers/tenant"
import { getTableColumns } from "@/lib/helpers/supabase-table-columns"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { GoogleCalendarService } from "@/lib/services/google-calendar.service"

type SupabaseClient = ReturnType<typeof createBiaSupabaseServerClient>

type RepairResult = {
  tenant: string
  scanned: number
  synced: number
  skipped: number
  failed: number
  errors: Array<{ appointmentId?: string; error: string }>
}

function normalizeDate(value: any): string {
  const raw = String(value ?? "").trim()
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return raw
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (br) {
    return `${br[3]}-${String(Number(br[2])).padStart(2, "0")}-${String(Number(br[1])).padStart(2, "0")}`
  }
  return raw
}

function normalizeTime(value: any): string {
  const raw = String(value ?? "").trim()
  const match = raw.match(/^([01]?\d|2[0-3])(?::([0-5]\d))?(?::[0-5]\d)?$/)
  if (!match) return raw
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2] || "00"}`
}

function isValidAppointmentDateTime(date: any, time: any): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeDate(date)) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalizeTime(time))
}

function isActiveScheduleStatus(status: any): boolean {
  const normalized = String(status || "").trim().toLowerCase()
  return normalized === "agendado" || normalized === "confirmado"
}

function getTimeZoneOffsetMinutes(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  )
  return Math.round((asUtc - date.getTime()) / 60000)
}

function formatTimezoneOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-"
  const absolute = Math.abs(minutes)
  const hours = Math.floor(absolute / 60)
  const mins = absolute % 60
  return `${sign}${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
}

function buildCalendarIso(dateIso: string, time: string, timezone = "America/Sao_Paulo"): string {
  const date = normalizeDate(dateIso)
  const normalizedTime = normalizeTime(time)
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute] = normalizedTime.split(":").map(Number)
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  const firstOffset = getTimeZoneOffsetMinutes(new Date(utcGuess), timezone)
  const actualUtc = utcGuess - firstOffset * 60 * 1000
  const finalOffset = getTimeZoneOffsetMinutes(new Date(actualUtc), timezone)
  return `${date}T${normalizedTime}:00${formatTimezoneOffset(finalOffset)}`
}

function addMinutesToLocalIso(dateIso: string, time: string, minutes: number, timezone = "America/Sao_Paulo"): string {
  const date = normalizeDate(dateIso)
  const normalizedTime = normalizeTime(time)
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute] = normalizedTime.split(":").map(Number)
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0))
  local.setUTCMinutes(local.getUTCMinutes() + Math.max(5, Math.min(240, minutes || 50)))
  const endDate = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`
  const endTime = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`
  return buildCalendarIso(endDate, endTime, timezone)
}

function pickName(row: any): string {
  return String(row?.nome || row?.nome_responsavel || row?.nome_aluno || "Lead").trim() || "Lead"
}

function pickPhone(row: any): string {
  return String(row?.contato || row?.numero || row?.session_id || "").replace(/\D/g, "")
}

function buildDescription(input: { tenant: string; row: any; phone: string }): string {
  return [
    String(input.row?.observacoes || input.row?.observacao || "Agendamento sincronizado pelo GerencIA").trim(),
    input.phone ? `Contato do lead: wa.me/${input.phone}` : "",
    `Tenant: ${input.tenant}`,
    input.row?.id ? `ID local: ${input.row.id}` : "",
  ].filter(Boolean).join("\n")
}

async function repairTenantCalendarSync(params: {
  supabase: SupabaseClient
  tenant: string
  limit: number
}): Promise<RepairResult> {
  const result: RepairResult = {
    tenant: params.tenant,
    scanned: 0,
    synced: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }

  const config = await getNativeAgentConfigForTenant(params.tenant).catch(() => null)
  if (!config?.googleCalendarEnabled) {
    result.skipped += 1
    return result
  }

  const table = getTablesForTenant(params.tenant).agendamentos
  const columns = await getTableColumns(params.supabase as any, table)
  if (!columns.has("google_event_id")) {
    result.failed += 1
    result.errors.push({ error: "google_event_id_column_missing" })
    return result
  }

  const selectedColumns = Array.from(
    new Set([
      "id",
      "status",
      "dia",
      "horario",
      "contato",
      "numero",
      "session_id",
      "nome",
      "nome_responsavel",
      "nome_aluno",
      "observacoes",
      "google_event_id",
      "google_event_link",
      "google_meet_link",
      "updated_at",
    ].filter((column) => columns.has(column))),
  ).join(",")

  const { data, error } = await params.supabase
    .from(table)
    .select(selectedColumns || "*")
    .in("status", ["agendado", "confirmado"])
    .or("google_event_id.is.null,google_event_id.eq.")
    .order("dia", { ascending: true })
    .limit(params.limit)

  if (error) {
    result.failed += 1
    result.errors.push({ error: error.message || "appointments_query_failed" })
    return result
  }

  const rows: any[] = Array.isArray(data) ? (data as any[]) : []
  result.scanned = rows.length

  const calendar = new GoogleCalendarService({
    calendarId: config.googleCalendarId || "primary",
    authMode: config.googleAuthMode || "service_account",
    serviceAccountEmail: config.googleServiceAccountEmail,
    serviceAccountPrivateKey: config.googleServiceAccountPrivateKey,
    delegatedUser: config.googleDelegatedUser,
    oauthClientId: config.googleOAuthClientId,
    oauthClientSecret: config.googleOAuthClientSecret,
    oauthRefreshToken: config.googleOAuthRefreshToken,
  })

  const timezone = config.timezone || "America/Sao_Paulo"
  const durationMinutes = Math.max(5, Math.min(240, Number(config.calendarEventDurationMinutes || 50)))

  for (const row of rows) {
    const appointmentId = String(row?.id || "").trim()
    try {
      if (!isActiveScheduleStatus(row?.status) || !isValidAppointmentDateTime(row?.dia, row?.horario)) {
        result.skipped += 1
        continue
      }

      const date = normalizeDate(row.dia)
      const time = normalizeTime(row.horario)
      const phone = pickPhone(row)
      const name = pickName(row)
      const event = await calendar.createEvent({
        summary: `Atendimento - ${name}`,
        description: buildDescription({ tenant: params.tenant, row, phone }),
        startIso: buildCalendarIso(date, time, timezone),
        endIso: addMinutesToLocalIso(date, time, durationMinutes, timezone),
        timezone,
        eventIdHint: `${params.tenant}:${appointmentId || phone}:${date}:${time}`,
      })

      const updatePayload: Record<string, any> = {}
      if (columns.has("google_event_id")) updatePayload.google_event_id = event.eventId
      if (columns.has("google_event_link")) updatePayload.google_event_link = event.htmlLink || null
      if (columns.has("google_meet_link")) updatePayload.google_meet_link = event.meetLink || null
      if (columns.has("updated_at")) updatePayload.updated_at = new Date().toISOString()

      if (Object.keys(updatePayload).length && appointmentId) {
        const update = await params.supabase.from(table).update(updatePayload).eq("id", appointmentId)
        if (update.error) {
          throw new Error(update.error.message || "google_event_id_update_failed")
        }
      }

      result.synced += 1
    } catch (error: any) {
      result.failed += 1
      result.errors.push({
        appointmentId: appointmentId || undefined,
        error: String(error?.message || error || "calendar_sync_failed").slice(0, 500),
      })
    }
  }

  return result
}

export async function repairGoogleCalendarSync(input?: {
  tenants?: string[]
  limitPerTenant?: number
}): Promise<{ ok: boolean; results: RepairResult[]; totals: Omit<RepairResult, "tenant" | "errors"> }> {
  const supabase = createBiaSupabaseServerClient()
  const tenants = (input?.tenants?.length ? input.tenants : Array.from(REGISTERED_TENANTS))
    .map((tenant) => String(tenant || "").trim())
    .filter((tenant) => /^[a-z0-9_]+$/.test(tenant))
  const limit = Math.max(1, Math.min(500, Number(input?.limitPerTenant || 100)))
  const results: RepairResult[] = []

  for (const tenant of tenants) {
    results.push(await repairTenantCalendarSync({ supabase, tenant, limit }))
  }

  const totals = results.reduce(
    (acc, item) => {
      acc.scanned += item.scanned
      acc.synced += item.synced
      acc.skipped += item.skipped
      acc.failed += item.failed
      return acc
    },
    { scanned: 0, synced: 0, skipped: 0, failed: 0 },
  )

  return {
    ok: totals.failed === 0,
    results,
    totals,
  }
}
