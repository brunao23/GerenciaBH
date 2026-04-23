/**
 * Smart Appointment Reminder Scheduler
 *
 * Scans upcoming appointments and creates reminder tasks in the agent_task_queue.
 * Reminders: 3 days before, 1 day before, 4 hours before.
 * Always respects business hours — never sends outside configured window.
 */

import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { resolveTenantRegistryPrefix } from "@/lib/helpers/tenant-resolution"

// ── Types ────────────────────────────────────────────────────────────────

export interface ReminderConfig {
  enabled: boolean
  reminder3days: boolean
  reminder1day: boolean
  reminder4hours: boolean
  businessStart: string // "08:00"
  businessEnd: string   // "20:00"
  businessDays: number[] // [1,2,3,4,5] = seg-sex
  timezone: string
  templates: {
    "3days": string
    "1day": string
    "4hours": string
  }
}

const LEGACY_REMINDER_TEMPLATES: ReminderConfig["templates"] = {
  "3days": "Ola {nome}! Passando para lembrar que seu agendamento esta marcado para {data} as {horario}. Faltam 3 dias! Qualquer duvida, estamos a disposicao.",
  "1day": "Oi {nome}! Amanha e o dia do seu agendamento as {horario}. Estamos te esperando! Se precisar reagendar, e so avisar.",
  "4hours": "{nome}, seu agendamento e HOJE as {horario}! Nos vemos em breve. Qualquer imprevisto, nos avise o quanto antes.",
}

const DEFAULT_REMINDER_TEMPLATES: ReminderConfig["templates"] = {
  "3days":
    "{saudacao_ola_tudo_bem}\n\nPassando para confirmar nosso Diagnostico Estrategico de Comunicacao, que acontecera em {dia_semana}, {data}, as {horario}.\n\nQuero que seja um encontro bem direcionado aos seus objetivos, entao, se possivel, ja va refletindo sobre quais situacoes de comunicacao voce quer evoluir neste momento.\n\nQualquer duvida, estou a disposicao. Te aguardamos!",
  "1day":
    "{saudacao_oi_tudo_bem}\n\nPassando para confirmar nossa consultoria amanha as {horario}.\n\nNosso consultor especialista preparou esse horario exclusivamente para voce e vai te explicar com clareza:\n\n✔️ Como funciona a metodologia Vox\n✔️ Qual formato e mais indicado para o seu perfil e momento atual\n✔️ Dias e horarios disponiveis\n✔️ Investimento e condicoes\n\nSepare 30 minutos para essa conversa, pois sera um atendimento individual e personalizado.\n\nComo a agenda e limitada e trabalhamos com horarios reservados, caso surja qualquer imprevisto, nos avise com antecedencia.\n\nConto com sua presenca amanha!",
  "4hours":
    "{saudacao_reforco_hoje}\n\nPassando para reforcar nossa consultoria hoje as {horario}.\n\nO horario segue reservado exclusivamente para o seu Diagnostico de comunicacao, onde nosso consultor especialista vai te direcionar sobre a metodologia, formatos e investimento.\n\nComo e um atendimento personalizado, peco apenas que nos avise caso surja qualquer imprevisto.\n\nTe espero no horario combinado!",
}

export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  enabled: true,
  reminder3days: true,
  reminder1day: true,
  reminder4hours: true,
  businessStart: "08:00",
  businessEnd: "20:00",
  businessDays: [1, 2, 3, 4, 5, 6], // seg a sab
  timezone: "America/Sao_Paulo",
  templates: DEFAULT_REMINDER_TEMPLATES,
}

// Available template variables
export const TEMPLATE_VARIABLES = [
  { key: "{nome}", description: "Primeiro nome do lead" },
  { key: "{nome_completo}", description: "Nome completo do lead" },
  { key: "{saudacao_ola_tudo_bem}", description: "Saudacao com nome quando disponivel para o lembrete de 3 dias" },
  { key: "{saudacao_oi_tudo_bem}", description: "Saudacao com nome quando disponivel para o lembrete de 1 dia" },
  { key: "{saudacao_reforco_hoje}", description: "Saudacao contextual para o lembrete do dia" },
  { key: "{data}", description: "Data do agendamento (DD/MM/YYYY)" },
  { key: "{horario}", description: "Horario do agendamento (HH:MM)" },
  { key: "{dia_semana}", description: "Dia da semana (ex: Segunda-feira)" },
  { key: "{servico}", description: "Observacoes/servico do agendamento" },
]

interface Appointment {
  id: string
  contato?: string | null
  nome_aluno?: string | null
  dia?: string | null
  horario?: string | null
  status?: string | null
  observacoes?: string | null
  session_id?: string | null
  numero?: string | null
}

type ZonedDateInfo = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  dayOfWeek: number
}

export interface ReminderScheduleResult {
  success: boolean
  tenant: string
  scanned: number
  scheduled: number
  skipped: number
  errors: string[]
}

export const OFFICIAL_REMINDER_TYPES = ["3days", "1day", "4hours"] as const
export type OfficialReminderType = (typeof OFFICIAL_REMINDER_TYPES)[number]
const MINIMUM_LEAD_BEFORE_SEND_MS = 2 * 60 * 1000
const APPOINTMENT_SELECT_COLUMNS = [
  "id",
  "contato",
  "nome_aluno",
  "dia",
  "horario",
  "status",
  "observacoes",
  "session_id",
  "numero",
]

function extractMissingColumnName(error: any): string | null {
  const message = String(error?.message || "")
  if (!message) return null

  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column "([^"]+)" of relation .* does not exist/i,
    /column "([^"]+)" does not exist/i,
    /column ([a-zA-Z0-9_.]+) does not exist/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match?.[1]) {
      const raw = String(match[1]).trim()
      return raw.includes(".") ? raw.split(".").pop() || raw : raw
    }
  }
  return null
}

function isMissingTableMessage(error: any): boolean {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "").toUpperCase()
  return (
    code === "42P01" ||
    (message.includes("relation") && message.includes("does not exist")) ||
    (message.includes("table") && message.includes("does not exist"))
  )
}

async function fetchAppointmentsWithColumnFallback(input: {
  supabase: ReturnType<typeof createBiaSupabaseServerClient>
  table: string
}): Promise<{ data: Appointment[] | null; error: any }> {
  const columns = [...APPOINTMENT_SELECT_COLUMNS]
  let attempts = 0

  while (attempts < 20 && columns.length > 0) {
    attempts += 1
    const query = await input.supabase
      .from(input.table)
      .select(columns.join(","))
      .in("status", ["agendado", "confirmado"])
      .order("created_at", { ascending: false })
      .limit(5000)

    if (!query.error) {
      return {
        data: (Array.isArray(query.data) ? query.data : []) as Appointment[],
        error: null,
      }
    }

    if (isMissingTableMessage(query.error)) {
      return { data: null, error: query.error }
    }

    const missingColumn = extractMissingColumnName(query.error)
    if (missingColumn && columns.includes(missingColumn)) {
      const index = columns.indexOf(missingColumn)
      columns.splice(index, 1)
      continue
    }

    return { data: null, error: query.error }
  }

  return {
    data: null,
    error: new Error(`Failed to query ${input.table}: all select columns removed by fallback`),
  }
}

function normalizeReminderKeyPart(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_:/-]/g, "")
}

function buildReminderKey(input: {
  tenant: string
  appointmentId: string
  type: OfficialReminderType
  appointmentDate: string
  appointmentTime: string
}): string {
  return [
    normalizeReminderKeyPart(input.tenant),
    normalizeReminderKeyPart(input.appointmentId),
    normalizeReminderKeyPart(input.type),
    normalizeReminderKeyPart(input.appointmentDate),
    normalizeReminderKeyPart(input.appointmentTime),
  ].join("_")
}

// ── Config helpers ───────────────────────────────────────────────────────

function safeMetadata(input: any): Record<string, any> {
  if (input && typeof input === "object" && !Array.isArray(input)) return input
  return {}
}

function normalizeReminderTemplates(input: any): ReminderConfig["templates"] {
  const provided = safeMetadata(input)
  const normalized: ReminderConfig["templates"] = { ...DEFAULT_REMINDER_TEMPLATES }
  const keys: Array<keyof ReminderConfig["templates"]> = ["3days", "1day", "4hours"]

  for (const key of keys) {
    const candidate = typeof provided[key] === "string" ? provided[key].trim() : ""
    if (!candidate) continue
    normalized[key] =
      candidate === LEGACY_REMINDER_TEMPLATES[key]
        ? DEFAULT_REMINDER_TEMPLATES[key]
        : candidate
  }

  return normalized
}

export async function getReminderConfigForTenant(tenant: string): Promise<ReminderConfig> {
  try {
    const supabase = createBiaSupabaseServerClient()
    const registryTenant = await resolveTenantRegistryPrefix(tenant)
    const { data } = await supabase
      .from("units_registry")
      .select("metadata")
      .eq("unit_prefix", registryTenant)
      .maybeSingle()

    const metadata = safeMetadata(data?.metadata)
    const config = metadata.reminders
    if (config && typeof config === "object") {
      return {
        ...DEFAULT_REMINDER_CONFIG,
        ...config,
        templates: normalizeReminderTemplates(config.templates),
      }
    }
  } catch (e) {
    console.error("[Reminders] Failed to load config:", e)
  }
  return DEFAULT_REMINDER_CONFIG
}

export async function saveReminderConfigForTenant(
  tenant: string,
  config: ReminderConfig,
): Promise<void> {
  const supabase = createBiaSupabaseServerClient()
  const registryTenant = await resolveTenantRegistryPrefix(tenant)
  const { data, error } = await supabase
    .from("units_registry")
    .select("id, metadata")
    .eq("unit_prefix", registryTenant)
    .single()

  if (error || !data) throw new Error("Unit not found")

  const metadata = safeMetadata(data.metadata)
  const next = {
    ...metadata,
    reminders: {
      ...config,
      templates: normalizeReminderTemplates(config.templates),
    },
  }

  const { error: updateError } = await supabase
    .from("units_registry")
    .update({ metadata: next })
    .eq("id", data.id)

  if (updateError) throw updateError
}

// ── Date/time helpers ────────────────────────────────────────────────────

const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terca-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sabado"]

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function getTimeZoneOffsetStringAt(date: Date, timezone: string): string {
  try {
    const utcMs = date.getTime()
    const localParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date)
    const readPart = (type: string) => Number(localParts.find((p) => p.type === type)?.value ?? 0)
    const localMs = Date.UTC(
      readPart("year"),
      readPart("month") - 1,
      readPart("day"),
      readPart("hour"),
      readPart("minute"),
      readPart("second"),
    )
    const offsetMinutes = Math.round((localMs - utcMs) / 60000)
    const sign = offsetMinutes >= 0 ? "+" : "-"
    const absMinutes = Math.abs(offsetMinutes)
    const hh = String(Math.floor(absMinutes / 60)).padStart(2, "0")
    const mm = String(absMinutes % 60).padStart(2, "0")
    return `${sign}${hh}:${mm}`
  } catch {
    return "-03:00"
  }
}

function buildDateInTimezone(input: {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second?: number
  timezone: string
}): Date | null {
  const isoDate = `${String(input.year).padStart(4, "0")}-${String(input.month).padStart(2, "0")}-${String(input.day).padStart(2, "0")}`
  const isoTime = `${String(input.hour).padStart(2, "0")}:${String(input.minute).padStart(2, "0")}:${String(
    input.second ?? 0,
  ).padStart(2, "0")}`
  const utcGuess = new Date(`${isoDate}T${isoTime}Z`)
  const offset = getTimeZoneOffsetStringAt(utcGuess, input.timezone)
  const zoned = new Date(`${isoDate}T${isoTime}${offset}`)
  return Number.isNaN(zoned.getTime()) ? null : zoned
}

function getDateInfoInTimezone(date: Date, timezone: string): ZonedDateInfo | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hour12: false,
    }).formatToParts(date)
    const read = (type: string): number => Number(parts.find((p) => p.type === type)?.value || 0)
    const weekdayText = String(parts.find((p) => p.type === "weekday")?.value || "Sun")
    return {
      year: read("year"),
      month: read("month"),
      day: read("day"),
      hour: read("hour"),
      minute: read("minute"),
      second: read("second"),
      dayOfWeek: WEEKDAY_MAP[weekdayText] ?? date.getUTCDay(),
    }
  } catch {
    return null
  }
}

function addDaysToLocalDate(year: number, month: number, day: number, daysToAdd: number): {
  year: number
  month: number
  day: number
} {
  const base = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  base.setUTCDate(base.getUTCDate() + daysToAdd)
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  }
}

function parseAppointmentDateTime(dia: string, horario: string, timezone: string): Date | null {
  if (!dia || !horario) return null
  if (dia.toLowerCase().includes("definir") || horario.toLowerCase().includes("definir")) return null

  // dia format: "DD/MM/YYYY" or "YYYY-MM-DD"
  let year: number, month: number, day: number
  if (dia.includes("/")) {
    const parts = dia.split("/")
    if (parts.length !== 3) return null
    day = Number(parts[0])
    month = Number(parts[1])
    year = Number(parts[2])
  } else if (dia.includes("-")) {
    const parts = dia.split("-")
    if (parts.length !== 3) return null
    year = Number(parts[0])
    month = Number(parts[1])
    day = Number(parts[2])
  } else {
    return null
  }

  // horario format: "HH:MM" or "HH:MM:SS"
  const timeParts = horario.split(":")
  const hours = Number(timeParts[0] || 0)
  const minutes = Number(timeParts[1] || 0)
  const seconds = Number(timeParts[2] || 0)

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  if (!Number.isFinite(hours) || hours < 0 || hours > 23) return null
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 59) return null
  if (year < 2020 || year > 2030) return null

  return buildDateInTimezone({
    year,
    month,
    day,
    hour: hours,
    minute: minutes,
    second: seconds,
    timezone: timezone || "America/Sao_Paulo",
  })
}

function adjustToBusinessHours(
  targetDate: Date,
  config: ReminderConfig,
): Date {
  const timezone = String(config.timezone || "America/Sao_Paulo").trim() || "America/Sao_Paulo"
  const info = getDateInfoInTimezone(targetDate, timezone)
  if (!info) return new Date(targetDate)

  const businessDaysRaw = Array.isArray(config.businessDays) ? config.businessDays : []
  const businessDays = Array.from(
    new Set(
      businessDaysRaw.filter((value): value is number => Number.isInteger(value) && value >= 0 && value <= 6),
    ),
  )
  if (businessDays.length === 0) {
    businessDays.push(...DEFAULT_REMINDER_CONFIG.businessDays)
  }

  const [startH, startM] = config.businessStart.split(":").map(Number)
  const [endH, endM] = config.businessEnd.split(":").map(Number)
  const safeStartH = Number.isFinite(startH) ? startH : 8
  const safeStartM = Number.isFinite(startM) ? startM : 0
  const safeEndH = Number.isFinite(endH) ? endH : 20
  const safeEndM = Number.isFinite(endM) ? endM : 0
  let startMinutes = safeStartH * 60 + safeStartM
  let endMinutes = safeEndH * 60 + safeEndM
  if (endMinutes <= startMinutes) {
    startMinutes = 8 * 60
    endMinutes = 20 * 60
  }
  const currentMinutes = info.hour * 60 + info.minute

  const isBusinessDay = businessDays.includes(info.dayOfWeek)
  const isWithinBusinessTime = currentMinutes >= startMinutes && currentMinutes < endMinutes

  if (isBusinessDay && isWithinBusinessTime) {
    return new Date(targetDate)
  }

  if (isBusinessDay && currentMinutes < startMinutes) {
    return (
      buildDateInTimezone({
        year: info.year,
        month: info.month,
        day: info.day,
        hour: Math.floor(startMinutes / 60),
        minute: startMinutes % 60,
        second: 0,
        timezone,
      }) || new Date(targetDate)
    )
  }

  const firstDayOffset = isBusinessDay ? 1 : 0
  for (let offset = firstDayOffset; offset <= 8; offset += 1) {
    const dayParts = addDaysToLocalDate(info.year, info.month, info.day, offset)
    const noon = buildDateInTimezone({
      ...dayParts,
      hour: 12,
      minute: 0,
      second: 0,
      timezone,
    })
    const weekdayInfo = noon ? getDateInfoInTimezone(noon, timezone) : null
    if (!weekdayInfo || !businessDays.includes(weekdayInfo.dayOfWeek)) continue

    const nextBusiness = buildDateInTimezone({
      ...dayParts,
      hour: Math.floor(startMinutes / 60),
      minute: startMinutes % 60,
      second: 0,
      timezone,
    })
    if (nextBusiness) return nextBusiness
  }

  return new Date(targetDate)
}

export function renderReminderTemplate(
  template: string,
  appointment: Appointment,
  appointmentDate: Date,
  timezone: string,
): string {
  const nome = appointment.nome_aluno || "voce"
  const primeiroNome = nome.split(" ")[0]
  const appointmentDateInfo = getDateInfoInTimezone(appointmentDate, timezone)
  const diaSemana = DIAS_SEMANA[appointmentDateInfo?.dayOfWeek ?? appointmentDate.getDay()] || ""
  const hasLeadName = Boolean(primeiroNome && primeiroNome.toLowerCase() !== "voce")
  const saudacaoOlaTudoBem = hasLeadName
    ? `Ola, ${primeiroNome}! Tudo bem? 😊`
    : "Ola! Tudo bem? 😊"
  const saudacaoOiTudoBem = hasLeadName
    ? `Oi, ${primeiroNome}! Tudo bem? 👋`
    : "Oi! Tudo bem? 👋"
  const saudacaoReforcoHoje = hasLeadName
    ? `Ola novamente, ${primeiroNome}!`
    : "Ola novamente!"

  return template
    .replace(/\{saudacao_ola_tudo_bem\}/gi, saudacaoOlaTudoBem)
    .replace(/\{saudacao_oi_tudo_bem\}/gi, saudacaoOiTudoBem)
    .replace(/\{saudacao_reforco_hoje\}/gi, saudacaoReforcoHoje)
    .replace(/\{nome\}/gi, primeiroNome)
    .replace(/\{nome_completo\}/gi, nome)
    .replace(/\{data\}/gi, appointment.dia)
    .replace(/\{horario\}/gi, appointment.horario?.replace(/:00$/, "") || "")
    .replace(/\{dia_semana\}/gi, diaSemana)
    .replace(/\{servico\}/gi, appointment.observacoes || "atendimento")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function renderOfficialReminderMessageFromConfig(input: {
  config: ReminderConfig
  reminderType: OfficialReminderType
  appointment: Pick<Appointment, "nome_aluno" | "dia" | "horario" | "observacoes">
}): string {
  const appointmentDate = parseAppointmentDateTime(
    input.appointment.dia,
    input.appointment.horario,
    input.config.timezone,
  )

  if (!appointmentDate) return ""

  const template =
    input.config.templates[input.reminderType] || DEFAULT_REMINDER_CONFIG.templates[input.reminderType]

  return renderReminderTemplate(template, input.appointment as Appointment, appointmentDate, input.config.timezone)
}

// ── Main scheduler ───────────────────────────────────────────────────────

export async function scheduleRemindersForTenant(
  tenant: string,
  options?: { dryRun?: boolean; force?: boolean },
): Promise<ReminderScheduleResult> {
  const result: ReminderScheduleResult = {
    success: false,
    tenant,
    scanned: 0,
    scheduled: 0,
    skipped: 0,
    errors: [],
  }

  try {
    const config = await getReminderConfigForTenant(tenant)
    const supabase = createBiaSupabaseServerClient()
    const agendamentosTable = `${tenant}_agendamentos`
    const taskQueueTable = "agent_task_queue"

    // Force mode: cancel pending official reminders to resync templates/timing from current config
    if (options?.force && !options?.dryRun) {
      try {
        const { data: pendingRows } = await supabase
          .from(taskQueueTable)
          .select("id, payload")
          .eq("tenant", tenant)
          .eq("task_type", "reminder")
          .eq("status", "pending")
          .limit(5000)

        const idsToCancel = (pendingRows || [])
          .filter((row: any) =>
            OFFICIAL_REMINDER_TYPES.includes(
              String(row?.payload?.reminder_type || "").trim().toLowerCase() as OfficialReminderType,
            ),
          )
          .map((row: any) => String(row?.id || "").trim())
          .filter(Boolean)

        if (idsToCancel.length > 0) {
          await supabase
            .from(taskQueueTable)
            .update({
              status: "cancelled",
              last_error: "cancelled_by_reminder_config_resync",
            })
            .in("id", idsToCancel)
        }
      } catch (forceError: any) {
        result.errors.push(`Force resync warning: ${String(forceError?.message || forceError)}`)
      }
    }

    if (!config.enabled) {
      result.success = true
      return result
    }

    // Fetch upcoming appointments (next 4 days) that are confirmed/agendado
    const { data: appointments, error } = await fetchAppointmentsWithColumnFallback({
      supabase,
      table: agendamentosTable,
    })

    if (error) {
      if (isMissingTableMessage(error)) {
        result.errors.push(`Table ${agendamentosTable} not found`)
        return result
      }
      result.errors.push(`Failed to query appointments from ${agendamentosTable}: ${String(error?.message || error)}`)
      return result
    }

    if (!appointments || appointments.length === 0) {
      result.success = true
      return result
    }

    const now = new Date()

    // Load already-scheduled reminders to avoid duplicates
    const existingReminders = new Set<string>()
    try {
      const { data: existing } = await supabase
        .from(taskQueueTable)
        .select("payload")
        .eq("tenant", tenant)
        .eq("task_type", "reminder")
        .in("status", ["pending", "done"])
        .limit(2000)

      for (const row of existing || []) {
        const payload = row?.payload && typeof row.payload === "object" ? row.payload : {}
        const key = String(payload?.reminder_key || "").trim()
        if (key) {
          existingReminders.add(key)
          continue
        }

        const legacyAppointmentId = String(payload?.appointment_id || "").trim()
        const legacyReminderType = String(payload?.reminder_type || "").trim().toLowerCase() as OfficialReminderType
        const legacyAppointmentDate = String(payload?.appointment_date || "").trim()
        const legacyAppointmentTime = String(payload?.appointment_time || "").trim()

        if (
          legacyAppointmentId &&
          OFFICIAL_REMINDER_TYPES.includes(legacyReminderType) &&
          legacyAppointmentDate &&
          legacyAppointmentTime
        ) {
          existingReminders.add(
            buildReminderKey({
              tenant,
              appointmentId: legacyAppointmentId,
              type: legacyReminderType,
              appointmentDate: legacyAppointmentDate,
              appointmentTime: legacyAppointmentTime,
            }),
          )
        }
      }
    } catch {}

    const reminderTypes: Array<{
      type: "3days" | "1day" | "4hours"
      enabled: boolean
      offsetMs: number
    }> = [
      { type: "3days", enabled: config.reminder3days, offsetMs: 3 * 24 * 60 * 60 * 1000 },
      { type: "1day", enabled: config.reminder1day, offsetMs: 1 * 24 * 60 * 60 * 1000 },
      { type: "4hours", enabled: config.reminder4hours, offsetMs: 4 * 60 * 60 * 1000 },
    ]

    for (const appointment of appointments) {
      result.scanned++

      const appointmentDate = parseAppointmentDateTime(
        appointment.dia,
        appointment.horario,
        config.timezone,
      )

      if (!appointmentDate) {
        result.skipped++
        continue
      }

      // Skip past appointments
      if (appointmentDate.getTime() < now.getTime()) {
        result.skipped++
        continue
      }

      const phone = String(appointment.contato || appointment.numero || "").replace(/\D/g, "")
      if (!phone || phone.length < 8) {
        result.skipped++
        continue
      }

      const sessionId = appointment.session_id || appointment.numero || phone

      for (const rt of reminderTypes) {
        if (!rt.enabled) continue

        const reminderKey = buildReminderKey({
          tenant,
          appointmentId: String(appointment.id || "").trim(),
          type: rt.type,
          appointmentDate: String(appointment.dia || "").trim(),
          appointmentTime: String(appointment.horario || "").trim(),
        })

        // Skip if already scheduled
        if (existingReminders.has(reminderKey)) continue

        // Calculate when to send
        let sendAt = new Date(appointmentDate.getTime() - rt.offsetMs)

        // If send time is in the past, skip
        if (sendAt.getTime() < now.getTime()) continue

        // Adjust to business hours
        sendAt = adjustToBusinessHours(sendAt, config)

        // If adjusted time is AFTER the appointment, skip
        if (sendAt.getTime() >= appointmentDate.getTime()) continue

        // Still in the past after adjustment? Skip
        if (sendAt.getTime() < now.getTime()) continue

        // Avoid instant triggers right after scheduling sync.
        if (sendAt.getTime() - now.getTime() < MINIMUM_LEAD_BEFORE_SEND_MS) continue

        // Render message
        const template = config.templates[rt.type] || DEFAULT_REMINDER_CONFIG.templates[rt.type]
        const message = renderReminderTemplate(template, appointment, appointmentDate, config.timezone)
        if (!message) continue

        if (options?.dryRun) {
          result.scheduled++
          continue
        }

        // Insert into task queue
        const { error: insertError } = await supabase.from(taskQueueTable).insert({
          tenant,
          session_id: sessionId,
          phone_number: phone,
          task_type: "reminder",
          payload: {
            message,
            reminder_key: reminderKey,
            reminder_type: rt.type,
            official_reminder: true,
            appointment_id: appointment.id,
            appointment_date: appointment.dia,
            appointment_time: appointment.horario,
            lead_name: appointment.nome_aluno,
          },
          run_at: sendAt.toISOString(),
          status: "pending",
        })

        if (insertError) {
          result.errors.push(`Failed to schedule ${rt.type} for appointment ${appointment.id}: ${insertError.message}`)
        } else {
          result.scheduled++
          existingReminders.add(reminderKey)
        }
      }
    }

    result.success = result.errors.length === 0
    return result
  } catch (e: any) {
    result.errors.push(e.message)
    return result
  }
}

// ── Dispatch for all tenants ─────────────────────────────────────────────

export async function scheduleRemindersForAllTenants(
  options?: { dryRun?: boolean },
): Promise<{ total: number; results: ReminderScheduleResult[] }> {
  const supabase = createBiaSupabaseServerClient()
  const { data: units } = await supabase
    .from("units_registry")
    .select("unit_prefix, metadata")
    .eq("is_active", true)

  const results: ReminderScheduleResult[] = []

  for (const unit of units || []) {
    const metadata = safeMetadata(unit.metadata)
    const remindersConfig = metadata.reminders
    if (remindersConfig && remindersConfig.enabled === false) continue

    const tenant = unit.unit_prefix
    if (!tenant) continue

    try {
      const result = await scheduleRemindersForTenant(tenant, options)
      results.push(result)
    } catch (e: any) {
      results.push({
        success: false,
        tenant,
        scanned: 0,
        scheduled: 0,
        skipped: 0,
        errors: [e.message],
      })
    }
  }

  return { total: results.length, results }
}
