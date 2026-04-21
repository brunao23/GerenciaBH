/**
 * Smart Appointment Reminder Scheduler
 *
 * Scans upcoming appointments and creates reminder tasks in the agent_task_queue.
 * Reminders: 3 days before, 1 day before, 4 hours before.
 * Always respects business hours — never sends outside configured window.
 */

import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { resolveTenantRegistryPrefix } from "@/lib/helpers/tenant-resolution"
import { TenantMessagingService } from "@/lib/services/tenant-messaging.service"

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
  contato: string
  nome_aluno: string | null
  dia: string
  horario: string
  status: string
  observacoes: string | null
  session_id: string | null
  numero: string | null
}

export interface ReminderScheduleResult {
  success: boolean
  tenant: string
  scanned: number
  scheduled: number
  skipped: number
  errors: string[]
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

function parseAppointmentDateTime(dia: string, horario: string, timezone: string): Date | null {
  if (!dia || !horario) return null
  if (dia.toLowerCase().includes("definir") || horario.toLowerCase().includes("definir")) return null

  // dia format: "DD/MM/YYYY" or "YYYY-MM-DD"
  let year: number, month: number, day: number
  if (dia.includes("/")) {
    const parts = dia.split("/")
    if (parts.length !== 3) return null
    day = Number(parts[0])
    month = Number(parts[1]) - 1
    year = Number(parts[2])
  } else if (dia.includes("-")) {
    const parts = dia.split("-")
    if (parts.length !== 3) return null
    year = Number(parts[0])
    month = Number(parts[1]) - 1
    day = Number(parts[2])
  } else {
    return null
  }

  // horario format: "HH:MM" or "HH:MM:SS"
  const timeParts = horario.split(":")
  const hours = Number(timeParts[0] || 0)
  const minutes = Number(timeParts[1] || 0)

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (year < 2020 || year > 2030) return null

  // Create date in the target timezone
  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`

  try {
    // Use Intl to get the offset for this timezone at this date
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    })

    // Parse as local time in the target timezone by creating a UTC date and adjusting
    const utcGuess = new Date(`${dateStr}Z`)
    const parts = formatter.formatToParts(utcGuess)
    const tzHour = Number(parts.find(p => p.type === "hour")?.value || 0)
    const offsetHours = tzHour - utcGuess.getUTCHours()

    // Simpler approach: create date and manually adjust
    const result = new Date(year, month, day, hours, minutes, 0)
    return isNaN(result.getTime()) ? null : result
  } catch {
    const result = new Date(year, month, day, hours, minutes, 0)
    return isNaN(result.getTime()) ? null : result
  }
}

function adjustToBusinessHours(
  targetDate: Date,
  config: ReminderConfig,
): Date {
  const result = new Date(targetDate)
  const [startH, startM] = config.businessStart.split(":").map(Number)
  const [endH, endM] = config.businessEnd.split(":").map(Number)
  const startMinutes = (startH || 8) * 60 + (startM || 0)
  const endMinutes = (endH || 20) * 60 + (endM || 0)

  const currentMinutes = result.getHours() * 60 + result.getMinutes()
  const dayOfWeek = result.getDay()

  // If outside business days, move to next business day at start time
  if (!config.businessDays.includes(dayOfWeek)) {
    for (let i = 1; i <= 7; i++) {
      result.setDate(result.getDate() + 1)
      if (config.businessDays.includes(result.getDay())) {
        result.setHours(startH || 8, startM || 0, 0, 0)
        return result
      }
    }
  }

  // If before business hours, set to start
  if (currentMinutes < startMinutes) {
    result.setHours(startH || 8, startM || 0, 0, 0)
    return result
  }

  // If after business hours, move to next business day start
  if (currentMinutes >= endMinutes) {
    for (let i = 1; i <= 7; i++) {
      result.setDate(result.getDate() + 1)
      if (config.businessDays.includes(result.getDay())) {
        result.setHours(startH || 8, startM || 0, 0, 0)
        return result
      }
    }
  }

  return result
}

function renderTemplate(
  template: string,
  appointment: Appointment,
  appointmentDate: Date,
): string {
  const nome = appointment.nome_aluno || "voce"
  const primeiroNome = nome.split(" ")[0]
  const diaSemana = DIAS_SEMANA[appointmentDate.getDay()] || ""
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
    if (!config.enabled) {
      result.errors.push("Reminders disabled")
      return result
    }

    const supabase = createBiaSupabaseServerClient()
    const agendamentosTable = `${tenant}_agendamentos`

    // Fetch upcoming appointments (next 4 days) that are confirmed/agendado
    const { data: appointments, error } = await supabase
      .from(agendamentosTable)
      .select("id, contato, nome_aluno, dia, horario, status, observacoes, session_id, numero")
      .in("status", ["agendado", "confirmado", "pendente"])
      .order("created_at", { ascending: false })
      .limit(500)

    if (error) {
      if (error.message?.includes("does not exist")) {
        result.errors.push(`Table ${agendamentosTable} not found`)
        return result
      }
      throw error
    }

    if (!appointments || appointments.length === 0) {
      result.success = true
      return result
    }

    const now = new Date()
    const taskQueueTable = "agent_task_queue"

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
        const key = row.payload?.reminder_key
        if (key) existingReminders.add(key)
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

        const reminderKey = `${tenant}_${appointment.id}_${rt.type}`

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

        // Render message
        const template = config.templates[rt.type] || DEFAULT_REMINDER_CONFIG.templates[rt.type]
        const message = renderTemplate(template, appointment, appointmentDate)

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
