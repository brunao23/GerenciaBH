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
  scheduleTemplate: string
  noShowTemplate: string
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

function renderTemplate(template: string, data: Record<string, string>): string {
  return String(template || "")
    .replace(/\{\{\s*nome\s*\}\}|\{\s*nome\s*\}/gi, data.nome || "Cliente")
    .replace(/\{\{\s*primeiro_nome\s*\}\}|\{\s*primeiro_nome\s*\}/gi, data.primeiro_nome || data.nome || "Cliente")
    .replace(/\{\{\s*telefone\s*\}\}|\{\s*telefone\s*\}/gi, data.telefone || "")
    .replace(/\{\{\s*data\s*\}\}|\{\s*data\s*\}/gi, data.data || "")
    .replace(/\{\{\s*hora\s*\}\}|\{\s*hora\s*\}/gi, data.hora || "")
    .replace(/\{\{\s*unidade\s*\}\}|\{\s*unidade\s*\}/gi, data.unidade || "")
    .replace(/\{\{\s*endereco\s*\}\}|\{\s*endereco\s*\}/gi, data.endereco || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
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
    scheduleTemplate: normalizeText(row.schedule_template, 1000) || DEFAULT_SCHEDULE_TEMPLATE,
    noShowTemplate: normalizeText(row.no_show_template, 1000) || DEFAULT_NO_SHOW_TEMPLATE,
  }
}

export class TenantSmsService {
  private readonly supabase = createBiaSupabaseServerClient()
  private readonly configTable = "tenant_sms_configs"
  private readonly campaignTable = "tenant_sms_campaigns"
  private readonly logTable = "tenant_sms_logs"

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
        scheduleTemplate: DEFAULT_SCHEDULE_TEMPLATE,
        noShowTemplate: DEFAULT_NO_SHOW_TEMPLATE,
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
      scheduleTemplate?: string | null
      noShowTemplate?: string | null
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
      schedule_template: normalizeText(input.scheduleTemplate, 1000) || DEFAULT_SCHEDULE_TEMPLATE,
      no_show_template: normalizeText(input.noShowTemplate, 1000) || DEFAULT_NO_SHOW_TEMPLATE,
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

  async listCampaigns(tenantInput: string): Promise<{ campaigns: any[]; logs: any[] }> {
    const tenant = normalizeTenant(tenantInput)
    if (!tenant) throw new Error("invalid_tenant")

    const [campaignsResult, logsResult] = await Promise.all([
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
    ])

    if (campaignsResult.error && !isMissingTableError(campaignsResult.error)) {
      throw new Error(campaignsResult.error.message)
    }
    if (logsResult.error && !isMissingTableError(logsResult.error)) {
      throw new Error(logsResult.error.message)
    }

    return {
      campaigns: campaignsResult.data || [],
      logs: logsResult.data || [],
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
          error: raw?.message || `Integrax HTTP ${response.status}`,
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
    eventType: "scheduled" | "no_show" | "campaign" | "test" | "auto_schedule" | "auto_no_show"
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

