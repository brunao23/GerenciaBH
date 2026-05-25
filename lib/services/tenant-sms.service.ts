import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { getTablesForTenant } from "@/lib/helpers/tenant"

export type SmsSegment = "scheduled" | "no_show" | "manual"

export type SmsRecipient = {
  phone: string
  name?: string | null
  appointmentId?: string | null
  date?: string | null
  time?: string | null
}

export type TenantSmsConfig = {
  tenant: string
  provider: "integrax"
  enabled: boolean
  token?: string | null
  hasToken: boolean
  senderId?: string | null
  autoScheduleEnabled: boolean
  autoNoShowEnabled: boolean
  appointmentRemindersEnabled: boolean
  reminderSequenceMinutes: number[]
  scheduleTemplate: string
  noShowTemplate: string
  reminderTemplate: string
}

type SendResult = {
  ok: boolean
  phone: string
  providerMessageId?: string | null
  providerStatus?: string | null
  error?: string
  raw?: any
}

const INTEGRAX_BASE_URL = "https://sms.aresfun.com"
const DEFAULT_SCHEDULE_TEMPLATE =
  "Oi {{nome}}, seu diagnostico na {{unidade}} ficou agendado para {{data}} as {{hora}}. Qualquer duvida, responda por aqui."
const DEFAULT_NO_SHOW_TEMPLATE =
  "Oi {{nome}}, vimos que voce nao conseguiu comparecer ao diagnostico. Quer que a gente te envie novas opcoes de horario?"
const DEFAULT_REMINDER_TEMPLATE =
  "Oi {{nome}}, lembrete: seu diagnostico na {{unidade}} esta agendado para {{data}} as {{hora}}. Se precisar ajustar, responda por aqui."
const DEFAULT_REMINDER_SEQUENCE_MINUTES = [1440, 180, 60]

function normalizePhone(value: any): string | null {
  const digits = String(value || "").replace(/\D/g, "")
  if (!digits) return null
  if (digits.length < 10 || digits.length > 15) return null
  if (digits.startsWith("55")) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

function normalizeText(value: any, max = 1000): string | null {
  const text = String(value ?? "").trim()
  if (!text) return null
  return text.slice(0, max)
}

function isMissingTableError(error: any): boolean {
  const code = String(error?.code || "")
  const message = String(error?.message || "").toLowerCase()
  return code === "42P01" || message.includes("does not exist") || message.includes("relation")
}

function firstName(name?: string | null): string {
  return String(name || "").trim().split(/\s+/)[0] || ""
}

function formatDateBR(value?: string | null): string {
  const text = String(value || "").trim()
  if (!text || text === "A definir") return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-")
    return `${day}/${month}/${year}`
  }
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return text
  return parsed.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

function formatTime(value?: string | null): string {
  const text = String(value || "").trim()
  if (!text || text === "A definir") return ""
  const match = text.match(/^(\d{1,2}):([0-5]\d)/)
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : text
}

function normalizeReminderSequence(value: any): number[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n;|]+/)
      : DEFAULT_REMINDER_SEQUENCE_MINUTES

  const values = raw
    .map((item: any) => Math.floor(Number(item)))
    .filter((item: number) => Number.isFinite(item) && item > 0 && item <= 43200)

  const deduped = Array.from(new Set(values)).sort((a, b) => b - a)
  return deduped.length > 0 ? deduped.slice(0, 10) : DEFAULT_REMINDER_SEQUENCE_MINUTES
}

function parseAppointmentDateTime(dateValue?: string | null, timeValue?: string | null): Date | null {
  const rawDate = String(dateValue || "").trim()
  const rawTime = String(timeValue || "").trim()
  if (!rawDate || rawDate === "A definir" || !rawTime || rawTime === "A definir") return null

  const timeMatch = rawTime.match(/(\d{1,2}):([0-5]\d)/)
  if (!timeMatch) return null

  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23) return null

  let year = 0
  let month = 0
  let day = 0

  const isoMatch = rawDate.match(/(\d{4})-(\d{2})-(\d{2})/)
  const brMatch = rawDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)

  if (isoMatch) {
    year = Number(isoMatch[1])
    month = Number(isoMatch[2])
    day = Number(isoMatch[3])
  } else if (brMatch) {
    day = Number(brMatch[1])
    month = Number(brMatch[2])
    year = Number(brMatch[3])
    if (year < 100) year += 2000
  } else {
    const parsed = new Date(rawDate)
    if (Number.isNaN(parsed.getTime())) return null
    year = parsed.getFullYear()
    month = parsed.getMonth() + 1
    day = parsed.getDate()
  }

  if (!year || !month || !day) return null
  const appointment = new Date(year, month - 1, day, hour, minute, 0, 0)
  return Number.isNaN(appointment.getTime()) ? null : appointment
}

function formatOffsetLabel(minutes: number): string {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440
    return `${days} dia${days === 1 ? "" : "s"} antes`
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return `${hours} hora${hours === 1 ? "" : "s"} antes`
  }
  return `${minutes} min antes`
}

function renderTemplate(template: string, data: Record<string, string>): string {
  return String(template || "")
    .replace(/\{\{\s*nome\s*\}\}|\{\s*nome\s*\}/gi, data.nome || "Cliente")
    .replace(/\{\{\s*primeiro_nome\s*\}\}|\{\s*primeiro_nome\s*\}/gi, data.primeiro_nome || data.nome || "Cliente")
    .replace(/\{\{\s*telefone\s*\}\}|\{\s*telefone\s*\}/gi, data.telefone || "")
    .replace(/\{\{\s*data\s*\}\}|\{\s*data\s*\}/gi, data.data || "")
    .replace(/\{\{\s*hora\s*\}\}|\{\s*hora\s*\}/gi, data.hora || "")
    .replace(/\{\{\s*unidade\s*\}\}|\{\s*unidade\s*\}/gi, data.unidade || "")
    .replace(/\{\{\s*endereco\s*\}\}|\{\s*endereco\s*\}/gi, data.endereco || "")
    .replace(/\{\{\s*antecedencia\s*\}\}|\{\s*antecedencia\s*\}/gi, data.antecedencia || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
}

function normalizeIntegraxError(raw: any, fallback: string): string {
  const message = String(raw?.message || raw?.error || fallback || "").trim()
  const normalized = message.toLowerCase()

  if (normalized.includes("integration not authorized to send") || normalized.includes("enable trust")) {
    return "Integrax bloqueou o envio: a integracao ainda nao esta autorizada para SMS. Acione o suporte da Integrax e peca a liberacao de trust/envio para este token."
  }

  if (normalized.includes("invalid token")) {
    return "Token Integrax invalido. Confira o token salvo nesta unidade."
  }

  if (normalized.includes("insufficient balance")) {
    return "Saldo Integrax insuficiente para enviar SMS."
  }

  if (normalized.includes("rate limited")) {
    return "Integrax aplicou limite de envio. Aguarde alguns instantes e tente novamente."
  }

  return message || fallback || "Falha ao enviar SMS Integrax"
}

function dedupeRecipients(recipients: SmsRecipient[]): SmsRecipient[] {
  const map = new Map<string, SmsRecipient>()
  for (const item of recipients) {
    const phone = normalizePhone(item.phone)
    if (!phone || map.has(phone)) continue
    map.set(phone, { ...item, phone })
  }
  return Array.from(map.values())
}

function mapConfig(row: any, includeToken = false): TenantSmsConfig | null {
  if (!row) return null
  const token = normalizeText(row.token, 1000)
  return {
    tenant: String(row.tenant || ""),
    provider: "integrax",
    enabled: row.enabled === true,
    token: includeToken ? token : undefined,
    hasToken: Boolean(token),
    senderId: normalizeText(row.sender_id, 50),
    autoScheduleEnabled: row.auto_schedule_enabled === true,
    autoNoShowEnabled: row.auto_no_show_enabled === true,
    appointmentRemindersEnabled: row.appointment_reminders_enabled === true,
    reminderSequenceMinutes: normalizeReminderSequence(row.reminder_sequence_minutes),
    scheduleTemplate: normalizeText(row.schedule_template, 1000) || DEFAULT_SCHEDULE_TEMPLATE,
    noShowTemplate: normalizeText(row.no_show_template, 1000) || DEFAULT_NO_SHOW_TEMPLATE,
    reminderTemplate: normalizeText(row.reminder_template, 1000) || DEFAULT_REMINDER_TEMPLATE,
  }
}

export class TenantSmsService {
  private readonly supabase = createBiaSupabaseServerClient()
  private readonly configTable = "tenant_sms_configs"
  private readonly campaignTable = "tenant_sms_campaigns"
  private readonly logTable = "tenant_sms_logs"
  private readonly scheduledTable = "tenant_sms_scheduled_messages"

  async getConfig(tenantInput: string, includeToken = false): Promise<TenantSmsConfig> {
    const tenant = normalizeTenant(tenantInput)
    if (!tenant) throw new Error("invalid_tenant")

    const { data, error } = await this.supabase
      .from(this.configTable)
      .select("*")
      .eq("tenant", tenant)
      .maybeSingle()

    if (error && !isMissingTableError(error)) throw new Error(error.message)

    return (
      mapConfig(data, includeToken) || {
        tenant,
        provider: "integrax",
        enabled: false,
        token: includeToken ? null : undefined,
        hasToken: false,
        senderId: null,
        autoScheduleEnabled: false,
        autoNoShowEnabled: false,
        appointmentRemindersEnabled: false,
        reminderSequenceMinutes: DEFAULT_REMINDER_SEQUENCE_MINUTES,
        scheduleTemplate: DEFAULT_SCHEDULE_TEMPLATE,
        noShowTemplate: DEFAULT_NO_SHOW_TEMPLATE,
        reminderTemplate: DEFAULT_REMINDER_TEMPLATE,
      }
    )
  }

  async saveConfig(
    tenantInput: string,
    input: {
      enabled?: boolean
      token?: string | null
      clearToken?: boolean
      senderId?: string | null
      autoScheduleEnabled?: boolean
      autoNoShowEnabled?: boolean
      appointmentRemindersEnabled?: boolean
      reminderSequenceMinutes?: any
      scheduleTemplate?: string | null
      noShowTemplate?: string | null
      reminderTemplate?: string | null
      updatedBy?: string | null
    },
  ): Promise<TenantSmsConfig> {
    const tenant = normalizeTenant(tenantInput)
    if (!tenant) throw new Error("invalid_tenant")

    const current = await this.getConfig(tenant, true)
    const tokenInput = input.clearToken ? null : input.token !== undefined ? normalizeText(input.token, 1000) : current.token
    const payload = {
      tenant,
      provider: "integrax",
      enabled: input.enabled === true,
      token: tokenInput || null,
      sender_id: normalizeText(input.senderId, 50),
      auto_schedule_enabled: input.autoScheduleEnabled === true,
      auto_no_show_enabled: input.autoNoShowEnabled === true,
      appointment_reminders_enabled: input.appointmentRemindersEnabled === true,
      reminder_sequence_minutes: normalizeReminderSequence(input.reminderSequenceMinutes),
      schedule_template: normalizeText(input.scheduleTemplate, 1000) || DEFAULT_SCHEDULE_TEMPLATE,
      no_show_template: normalizeText(input.noShowTemplate, 1000) || DEFAULT_NO_SHOW_TEMPLATE,
      reminder_template: normalizeText(input.reminderTemplate, 1000) || DEFAULT_REMINDER_TEMPLATE,
      updated_by: normalizeText(input.updatedBy, 120),
      created_by: normalizeText(input.updatedBy, 120),
    }

    const { data, error } = await this.supabase
      .from(this.configTable)
      .upsert(payload, { onConflict: "tenant" })
      .select("*")
      .single()

    if (error) throw new Error(error.message)
    return mapConfig(data, false)!
  }

  async listCampaigns(tenantInput: string): Promise<{ campaigns: any[]; logs: any[]; scheduledMessages: any[] }> {
    const tenant = normalizeTenant(tenantInput)
    if (!tenant) throw new Error("invalid_tenant")

    const [campaignsResult, logsResult, scheduledResult] = await Promise.all([
      this.supabase
        .from(this.campaignTable)
        .select("*")
        .eq("tenant", tenant)
        .order("created_at", { ascending: false })
        .limit(20),
      this.supabase
        .from(this.logTable)
        .select("*")
        .eq("tenant", tenant)
        .order("created_at", { ascending: false })
        .limit(50),
      this.supabase
        .from(this.scheduledTable)
        .select("*")
        .eq("tenant", tenant)
        .order("run_at", { ascending: true })
        .limit(50),
    ])

    if (campaignsResult.error && !isMissingTableError(campaignsResult.error)) {
      throw new Error(campaignsResult.error.message)
    }
    if (logsResult.error && !isMissingTableError(logsResult.error)) {
      throw new Error(logsResult.error.message)
    }
    if (scheduledResult.error && !isMissingTableError(scheduledResult.error)) {
      throw new Error(scheduledResult.error.message)
    }

    return {
      campaigns: campaignsResult.data || [],
      logs: logsResult.data || [],
      scheduledMessages: scheduledResult.data || [],
    }
  }

  async sendTest(input: {
    tenant: string
    phone: string
    message: string
    leadName?: string | null
  }): Promise<SendResult> {
    const config = await this.getConfig(input.tenant, true)
    const phone = normalizePhone(input.phone)
    const message = normalizeText(input.message, 1000)
    if (!phone) throw new Error("Telefone invalido para SMS")
    if (!message) throw new Error("Mensagem SMS vazia")
    const result = await this.sendViaIntegrax(config, phone, message)
    await this.logSend({
      tenant: input.tenant,
      eventType: "test",
      phone,
      leadName: input.leadName,
      message,
      result,
    })
    return result
  }

  async sendAutomaticScheduleSms(input: {
    tenant: string
    phone: string
    leadName?: string | null
    date?: string | null
    time?: string | null
    appointmentId?: string | null
    unitName?: string | null
    address?: string | null
  }): Promise<{ skipped?: string; result?: SendResult }> {
    const config = await this.getConfig(input.tenant, true)
    if (!config.enabled || !config.autoScheduleEnabled) return { skipped: "auto_schedule_disabled" }
    const phone = normalizePhone(input.phone)
    if (!phone) return { skipped: "invalid_phone" }
    const message = renderTemplate(config.scheduleTemplate, {
      nome: input.leadName || "Cliente",
      primeiro_nome: firstName(input.leadName) || "Cliente",
      telefone: phone,
      data: formatDateBR(input.date),
      hora: formatTime(input.time),
      unidade: input.unitName || input.tenant,
      endereco: input.address || "",
    })
    if (!message) return { skipped: "empty_message" }
    const result = await this.sendViaIntegrax(config, phone, message)
    await this.logSend({
      tenant: input.tenant,
      eventType: "auto_schedule",
      phone,
      leadName: input.leadName,
      message,
      appointmentId: input.appointmentId,
      result,
    })
    return { result }
  }

  async handleAppointmentScheduledSms(input: {
    tenant: string
    phone: string
    leadName?: string | null
    date?: string | null
    time?: string | null
    appointmentId?: string | null
    unitName?: string | null
    address?: string | null
  }): Promise<{
    immediate?: { skipped?: string; result?: SendResult }
    reminders?: { queued: number; skipped?: string }
  }> {
    const [immediate, reminders] = await Promise.all([
      this.sendAutomaticScheduleSms(input).catch((error: any) => ({ skipped: error?.message || "auto_schedule_failed" })),
      this.enqueueAppointmentReminderSequence(input).catch((error: any) => ({ queued: 0, skipped: error?.message || "reminder_queue_failed" })),
    ])

    return { immediate, reminders }
  }

  async enqueueAppointmentReminderSequence(input: {
    tenant: string
    phone: string
    leadName?: string | null
    date?: string | null
    time?: string | null
    appointmentId?: string | null
    unitName?: string | null
    address?: string | null
  }): Promise<{ queued: number; skipped?: string }> {
    const tenant = normalizeTenant(input.tenant)
    if (!tenant) throw new Error("invalid_tenant")

    const config = await this.getConfig(tenant, true)
    if (!config.enabled || !config.appointmentRemindersEnabled) {
      return { queued: 0, skipped: "appointment_sms_reminders_disabled" }
    }

    const phone = normalizePhone(input.phone)
    if (!phone) return { queued: 0, skipped: "invalid_phone" }

    const appointmentAt = parseAppointmentDateTime(input.date, input.time)
    if (!appointmentAt) return { queued: 0, skipped: "invalid_appointment_datetime" }

    const now = Date.now()
    let queued = 0
    const rows: any[] = []
    const dateLabel = formatDateBR(input.date)
    const timeLabel = formatTime(input.time)

    for (const offsetMinutes of config.reminderSequenceMinutes) {
      const runAt = new Date(appointmentAt.getTime() - offsetMinutes * 60 * 1000)
      if (runAt.getTime() <= now) continue

      const message = renderTemplate(config.reminderTemplate, {
        nome: input.leadName || "Cliente",
        primeiro_nome: firstName(input.leadName) || "Cliente",
        telefone: phone,
        data: dateLabel,
        hora: timeLabel,
        unidade: input.unitName || tenant,
        endereco: input.address || "",
        antecedencia: formatOffsetLabel(offsetMinutes),
      })

      if (!message) continue

      const stableAppointmentKey = input.appointmentId
        ? `${input.appointmentId}:${String(input.date || "").trim()}:${String(input.time || "").trim()}`
        : `${phone}:${String(input.date || "").trim()}:${String(input.time || "").trim()}`

      rows.push({
        tenant,
        dedupe_key: `appointment:${stableAppointmentKey}:reminder:${offsetMinutes}`,
        phone,
        lead_name: normalizeText(input.leadName, 120),
        appointment_id: input.appointmentId || null,
        appointment_date: String(input.date || "").trim(),
        appointment_time: String(input.time || "").trim(),
        message,
        sequence_offset_minutes: offsetMinutes,
        run_at: runAt.toISOString(),
        status: "pending",
        provider: "integrax",
        metadata: {
          unitName: input.unitName || tenant,
          address: input.address || null,
          appointmentAt: appointmentAt.toISOString(),
          label: formatOffsetLabel(offsetMinutes),
        },
      })
    }

    if (rows.length === 0) return { queued: 0, skipped: "no_future_reminders" }

    const { error } = await this.supabase
      .from(this.scheduledTable)
      .upsert(rows, { onConflict: "tenant,dedupe_key", ignoreDuplicates: true })

    if (error) {
      if (isMissingTableError(error)) return { queued: 0, skipped: "sms_scheduled_table_missing" }
      throw new Error(error.message)
    }

    queued = rows.length
    return { queued }
  }

  async processDueScheduledSms(input?: {
    limit?: number
  }): Promise<{ processed: number; sent: number; failed: number; cancelled: number; results: any[] }> {
    const limit = Number.isFinite(Number(input?.limit))
      ? Math.max(1, Math.min(200, Math.floor(Number(input?.limit))))
      : 50

    await this.supabase
      .from(this.scheduledTable)
      .update({
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("status", "processing")
      .lt("last_attempt_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())

    const { data, error } = await this.supabase
      .from(this.scheduledTable)
      .select("*")
      .eq("status", "pending")
      .lte("run_at", new Date().toISOString())
      .order("run_at", { ascending: true })
      .limit(limit)

    if (error) {
      if (isMissingTableError(error)) {
        return { processed: 0, sent: 0, failed: 0, cancelled: 0, results: [] }
      }
      throw new Error(error.message)
    }

    let sent = 0
    let failed = 0
    let cancelled = 0
    const results: any[] = []

    for (const row of data || []) {
      const claimed = await this.claimScheduledMessage(row.id)
      if (!claimed) continue

      const stillValid = await this.isScheduledReminderStillValid(claimed)
      if (!stillValid.ok) {
        cancelled += 1
        await this.updateScheduledMessage(claimed.id, {
          status: "cancelled",
          error_message: stillValid.reason,
          updated_at: new Date().toISOString(),
        })
        results.push({ id: claimed.id, status: "cancelled", reason: stillValid.reason })
        continue
      }

      const config = await this.getConfig(claimed.tenant, true)
      let result: SendResult
      try {
        result = await this.sendViaIntegrax(config, claimed.phone, claimed.message)
      } catch (error: any) {
        result = {
          ok: false,
          phone: claimed.phone,
          error: error?.message || "Falha ao enviar SMS",
        }
      }
      await this.logSend({
        tenant: claimed.tenant,
        eventType: "appointment_reminder",
        phone: claimed.phone,
        leadName: claimed.lead_name,
        message: claimed.message,
        appointmentId: claimed.appointment_id,
        result,
      })

      if (result.ok) {
        sent += 1
        await this.updateScheduledMessage(claimed.id, {
          status: "sent",
          provider_message_id: result.providerMessageId || null,
          provider_status: result.providerStatus || null,
          success: true,
          error_message: null,
          raw_response: result.raw || null,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      } else {
        failed += 1
        const attempts = Number(claimed.attempts || 0)
        const shouldRetry = attempts < 3
        await this.updateScheduledMessage(claimed.id, {
          status: shouldRetry ? "pending" : "failed",
          provider_status: result.providerStatus || null,
          success: false,
          error_message: result.error || "Falha ao enviar SMS",
          raw_response: result.raw || null,
          run_at: shouldRetry ? new Date(Date.now() + attempts * 5 * 60 * 1000).toISOString() : claimed.run_at,
          updated_at: new Date().toISOString(),
        })
      }

      results.push({
        id: claimed.id,
        tenant: claimed.tenant,
        phone: claimed.phone,
        status: result.ok ? "sent" : "failed",
        error: result.error || null,
      })
    }

    return { processed: results.length, sent, failed, cancelled, results }
  }

  async sendAutomaticNoShowSms(input: {
    tenant: string
    phone: string
    leadName?: string | null
    unitName?: string | null
  }): Promise<{ skipped?: string; result?: SendResult }> {
    const config = await this.getConfig(input.tenant, true)
    if (!config.enabled || !config.autoNoShowEnabled) return { skipped: "auto_no_show_disabled" }
    const phone = normalizePhone(input.phone)
    if (!phone) return { skipped: "invalid_phone" }
    const message = renderTemplate(config.noShowTemplate, {
      nome: input.leadName || "Cliente",
      primeiro_nome: firstName(input.leadName) || "Cliente",
      telefone: phone,
      unidade: input.unitName || input.tenant,
      data: "",
      hora: "",
      endereco: "",
    })
    if (!message) return { skipped: "empty_message" }
    const result = await this.sendViaIntegrax(config, phone, message)
    await this.logSend({
      tenant: input.tenant,
      eventType: "auto_no_show",
      phone,
      leadName: input.leadName,
      message,
      result,
    })
    return { result }
  }

  async sendCampaign(input: {
    tenant: string
    name?: string | null
    segment: SmsSegment
    message: string
    recipients?: SmsRecipient[]
    limit?: number
    createdBy?: string | null
  }): Promise<{ campaign: any; results: SendResult[] }> {
    const tenant = normalizeTenant(input.tenant)
    if (!tenant) throw new Error("invalid_tenant")
    const config = await this.getConfig(tenant, true)
    const message = normalizeText(input.message, 1000)
    if (!message) throw new Error("Mensagem SMS vazia")

    const recipients = await this.resolveRecipients({
      tenant,
      segment: input.segment,
      recipients: input.recipients || [],
      limit: input.limit,
    })
    if (recipients.length === 0) throw new Error("Nenhum destinatario encontrado para este SMS")

    const { data: campaign, error } = await this.supabase
      .from(this.campaignTable)
      .insert({
        tenant,
        name: normalizeText(input.name, 140) || `Campanha SMS ${new Date().toLocaleString("pt-BR")}`,
        segment: input.segment,
        message,
        status: "running",
        recipient_count: recipients.length,
        created_by: normalizeText(input.createdBy, 120),
        metadata: { provider: "integrax" },
      })
      .select("*")
      .single()

    if (error) throw new Error(error.message)

    const results: SendResult[] = []
    for (const recipient of recipients) {
      const rendered = renderTemplate(message, {
        nome: recipient.name || "Cliente",
        primeiro_nome: firstName(recipient.name) || "Cliente",
        telefone: recipient.phone,
        data: formatDateBR(recipient.date),
        hora: formatTime(recipient.time),
        unidade: tenant,
        endereco: "",
      })
      const result = await this.sendViaIntegrax(config, recipient.phone, rendered)
      results.push(result)
      await this.logSend({
        tenant,
        campaignId: campaign.id,
        eventType: "campaign",
        phone: recipient.phone,
        leadName: recipient.name,
        message: rendered,
        appointmentId: recipient.appointmentId,
        result,
      })
    }

    const sentCount = results.filter((item) => item.ok).length
    const failedCount = results.length - sentCount
    const status = failedCount === 0 ? "sent" : sentCount > 0 ? "partial" : "failed"

    const { data: updatedCampaign } = await this.supabase
      .from(this.campaignTable)
      .update({
        status,
        sent_count: sentCount,
        failed_count: failedCount,
        sent_at: new Date().toISOString(),
      })
      .eq("id", campaign.id)
      .select("*")
      .maybeSingle()

    return { campaign: updatedCampaign || campaign, results }
  }

  private async resolveRecipients(input: {
    tenant: string
    segment: SmsSegment
    recipients: SmsRecipient[]
    limit?: number
  }): Promise<SmsRecipient[]> {
    const limit = Number.isFinite(Number(input.limit))
      ? Math.max(1, Math.min(1000, Math.floor(Number(input.limit))))
      : 250

    if (input.segment === "manual") {
      return dedupeRecipients(input.recipients).slice(0, limit)
    }

    if (input.segment === "no_show") {
      const { data, error } = await this.supabase
        .from("tenant_business_events")
        .select("id, phone_number, lead_name, event_at")
        .eq("tenant", input.tenant)
        .eq("event_type", "no_show")
        .order("event_at", { ascending: false })
        .limit(limit * 2)

      if (error && !isMissingTableError(error)) throw new Error(error.message)
      return dedupeRecipients(
        (data || []).map((row: any) => ({
          phone: row.phone_number,
          name: row.lead_name,
          appointmentId: row.id,
        })),
      ).slice(0, limit)
    }

    const tables = getTablesForTenant(input.tenant)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayText = today.toISOString().slice(0, 10)
    const { data, error } = await this.supabase
      .from(tables.agendamentos)
      .select("*")
      .gte("dia", todayText)
      .order("dia", { ascending: true })
      .limit(limit * 3)

    if (error && !isMissingTableError(error)) throw new Error(error.message)

    return dedupeRecipients(
      (data || [])
        .filter((row: any) => {
          const status = String(row?.status || "").toLowerCase()
          const dia = String(row?.dia || "").trim()
          const horario = String(row?.horario || "").trim()
          if (!dia || dia === "A definir" || !horario || horario === "A definir") return false
          if (status.includes("cancel") || status.includes("bolo") || status.includes("no_show")) return false
          return status.includes("agend") || status.includes("confirm") || Boolean(dia && horario)
        })
        .map((row: any) => ({
          phone: row.contato || row.phone || row.telefone || row.numero,
          name: row.nome || row.nome_responsavel || row.nome_aluno,
          appointmentId: row.id,
          date: row.dia,
          time: row.horario,
        })),
    ).slice(0, limit)
  }

  private async claimScheduledMessage(id: string): Promise<any | null> {
    const { data, error } = await this.supabase
      .from(this.scheduledTable)
      .update({
        status: "processing",
        last_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle()

    if (error && !isMissingTableError(error)) {
      console.warn("[tenant-sms] failed to claim scheduled sms:", error.message)
    }

    if (!data) return null

    const attempts = Number(data.attempts || 0) + 1
    const { data: updated } = await this.supabase
      .from(this.scheduledTable)
      .update({ attempts })
      .eq("id", id)
      .select("*")
      .maybeSingle()

    return updated || { ...data, attempts }
  }

  private async updateScheduledMessage(id: string, updates: Record<string, any>): Promise<void> {
    const { error } = await this.supabase
      .from(this.scheduledTable)
      .update(updates)
      .eq("id", id)

    if (error && !isMissingTableError(error)) {
      console.warn("[tenant-sms] failed to update scheduled sms:", error.message)
    }
  }

  private async isScheduledReminderStillValid(row: any): Promise<{ ok: boolean; reason?: string }> {
    const tenant = normalizeTenant(row?.tenant)
    if (!tenant || !row?.appointment_id) return { ok: true }

    try {
      const tables = getTablesForTenant(tenant)
      const { data, error } = await this.supabase
        .from(tables.agendamentos)
        .select("id,status,dia,horario")
        .eq("id", row.appointment_id)
        .maybeSingle()

      if (error) {
        if (isMissingTableError(error)) return { ok: true }
        return { ok: true }
      }

      if (!data) return { ok: false, reason: "appointment_not_found" }

      const status = String(data.status || "").toLowerCase()
      if (status.includes("cancel") || status.includes("bolo") || status.includes("no_show") || status.includes("no-show")) {
        return { ok: false, reason: "appointment_not_active" }
      }

      const currentDate = String(data.dia || "").trim()
      const currentTime = String(data.horario || "").trim()
      const queuedDate = String(row.appointment_date || "").trim()
      const queuedTime = String(row.appointment_time || "").trim()
      if (queuedDate && currentDate && queuedDate !== currentDate) {
        return { ok: false, reason: "appointment_date_changed" }
      }
      if (queuedTime && currentTime && formatTime(queuedTime) !== formatTime(currentTime)) {
        return { ok: false, reason: "appointment_time_changed" }
      }

      return { ok: true }
    } catch {
      return { ok: true }
    }
  }

  private async sendViaIntegrax(config: TenantSmsConfig, phone: string, message: string): Promise<SendResult> {
    if (!config.enabled) throw new Error("SMS Integrax esta desativado para esta unidade")
    const token = normalizeText(config.token, 1000)
    if (!token) throw new Error("Token Integrax nao configurado")

    try {
      const response = await fetch(`${INTEGRAX_BASE_URL}/v1/integration/${encodeURIComponent(token)}/send-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [phone],
          from: config.senderId || undefined,
          message,
        }),
      })
      const raw = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }))
      if (!response.ok || Number(raw?.error) !== 0) {
        return {
          ok: false,
          phone,
          providerStatus: raw?.code || String(response.status),
          error: normalizeIntegraxError(raw, `Integrax HTTP ${response.status}`),
          raw,
        }
      }
      return {
        ok: true,
        phone,
        providerMessageId: raw?.data?.messageId || null,
        providerStatus: raw?.data?.status || raw?.code || "SENT",
        raw,
      }
    } catch (error: any) {
      return {
        ok: false,
        phone,
        error: error?.message || "Falha ao enviar SMS Integrax",
      }
    }
  }

  private async logSend(input: {
    tenant: string
    campaignId?: string | null
    eventType: "scheduled" | "no_show" | "campaign" | "test" | "auto_schedule" | "auto_no_show" | "appointment_reminder"
    phone: string
    leadName?: string | null
    message: string
    appointmentId?: string | null
    result: SendResult
  }): Promise<void> {
    const tenant = normalizeTenant(input.tenant)
    if (!tenant) return
    const { error } = await this.supabase.from(this.logTable).insert({
      tenant,
      campaign_id: input.campaignId || null,
      event_type: input.eventType,
      phone: input.phone,
      lead_name: normalizeText(input.leadName, 120),
      message: input.message,
      provider: "integrax",
      provider_message_id: input.result.providerMessageId || null,
      provider_status: input.result.providerStatus || null,
      success: input.result.ok === true,
      error_message: input.result.error || null,
      appointment_id: input.appointmentId || null,
      raw_response: input.result.raw || null,
    })

    if (error && !isMissingTableError(error)) {
      console.warn("[tenant-sms] failed to persist sms log:", error.message)
    }
  }
}
