import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { type MessagingConfig } from "@/lib/helpers/messaging-config"
import { createZApiServiceFromMessagingConfig } from "@/lib/helpers/zapi-messaging"
import { notifyAdminUpdate } from "@/lib/services/tenant-notifications"

type ZapiHealth = "connected" | "disconnected" | "expired" | "error" | "not_configured"

interface UnitRow {
  id: string
  unit_name: string
  unit_prefix: string
  is_active: boolean
  metadata: Record<string, any> | null
}

export interface ZapiUnitStatus {
  unitId: string
  unitName: string
  unitPrefix: string
  isActive: boolean
  provider: string
  instanceId?: string
  health: ZapiHealth
  connected: boolean
  statusText?: string
  paymentStatus?: string
  dueAt?: string
  paymentUrl?: string
  dashboardUrl?: string
  error?: string
  lastCheckedAt: string
  rawStatus?: Record<string, any> | null
}

export interface MonitorZapiInstancesResult {
  ok: boolean
  totalUnits: number
  totalZapiUnits: number
  checked: number
  notificationsSent: number
  statuses: ZapiUnitStatus[]
}

function safeObject(input: any): Record<string, any> {
  if (input && typeof input === "object" && !Array.isArray(input)) return input
  return {}
}

function toText(value: any): string {
  return String(value ?? "").trim()
}

function isTruthyUrl(value: any): string | undefined {
  const text = toText(value)
  if (!text) return undefined
  if (/^https?:\/\//i.test(text)) return text
  return undefined
}

function normalizePaymentStatus(input: any): string | undefined {
  const text = toText(input)
  return text ? text.toLowerCase() : undefined
}

function parseDueAt(input: any): string | undefined {
  if (input === null || input === undefined || input === "") return undefined

  if (typeof input === "number" || /^\d+$/.test(String(input))) {
    const raw = Number(input)
    if (!Number.isFinite(raw) || raw <= 0) return undefined
    const millis = raw > 10_000_000_000 ? raw : raw * 1000
    const date = new Date(millis)
    if (Number.isNaN(date.getTime())) return undefined
    return date.toISOString()
  }

  const date = new Date(String(input))
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

function hasExpiredSignal(values: Array<string | undefined>): boolean {
  const text = values.filter(Boolean).join(" ").toLowerCase()
  if (!text) return false
  return [
    "expired",
    "expire",
    "vencid",
    "expirad",
    "overdue",
    "suspended",
    "suspens",
    "inadimpl",
    "payment_required",
    "blocked_by_payment",
    "bloqueado_pagamento",
    "fatura",
    "invoice_due",
  ].some((keyword) => text.includes(keyword))
}

function isPast(dueAt?: string): boolean {
  if (!dueAt) return false
  const dueMs = new Date(dueAt).getTime()
  if (!Number.isFinite(dueMs)) return false
  return dueMs < Date.now()
}

function pickPaymentUrl(meData: Record<string, any>, config: MessagingConfig): string | undefined {
  return (
    isTruthyUrl(config.zapiPaymentUrl) ||
    isTruthyUrl(meData.paymentUrl) ||
    isTruthyUrl(meData.payment_url) ||
    isTruthyUrl(meData.renewUrl) ||
    isTruthyUrl(meData.renew_url) ||
    isTruthyUrl(meData.invoiceUrl) ||
    isTruthyUrl(meData.invoice_url) ||
    isTruthyUrl(meData.billingUrl) ||
    isTruthyUrl(meData.billing_url)
  )
}

function pickDashboardUrl(meData: Record<string, any>, config: MessagingConfig): string | undefined {
  return (
    isTruthyUrl(config.zapiDashboardUrl) ||
    isTruthyUrl(meData.dashboardUrl) ||
    isTruthyUrl(meData.dashboard_url) ||
    isTruthyUrl(meData.instanceUrl) ||
    isTruthyUrl(meData.instance_url)
  )
}

function deriveHealth(input: {
  connected: boolean
  statusText?: string
  paymentStatus?: string
  dueAt?: string
  error?: string
}): ZapiHealth {
  const { connected, statusText, paymentStatus, dueAt, error } = input

  const expiredSignal = hasExpiredSignal([statusText, paymentStatus, error])
  if (expiredSignal || (isPast(dueAt) && !connected)) {
    return "expired"
  }

  if (connected) return "connected"
  if (error) return "disconnected"
  return "disconnected"
}

async function listUnits(): Promise<UnitRow[]> {
  const supabase = createBiaSupabaseServerClient()
  const { data, error } = await supabase
    .from("units_registry")
    .select("id, unit_name, unit_prefix, is_active, metadata")
    .order("unit_name", { ascending: true })

  if (error) throw new Error(error.message || "Erro ao listar unidades")
  return Array.isArray(data) ? (data as UnitRow[]) : []
}

async function inspectUnit(unit: UnitRow): Promise<ZapiUnitStatus | null> {
  const metadata = safeObject(unit.metadata)
  const config = safeObject(metadata.messaging) as MessagingConfig
  const provider = toText(config.provider).toLowerCase()
  if (provider !== "zapi") return null

  const nowIso = new Date().toISOString()
  const { service, error: configError } = createZApiServiceFromMessagingConfig(config)
  if (!service) {
    return {
      unitId: unit.id,
      unitName: unit.unit_name,
      unitPrefix: unit.unit_prefix,
      isActive: unit.is_active,
      provider,
      instanceId: toText(config.instanceId) || undefined,
      health: "not_configured",
      connected: false,
      error: configError || "Configuracao Z-API incompleta",
      lastCheckedAt: nowIso,
    }
  }

  const [statusResult, meResult] = await Promise.all([
    service.checkInstanceStatusDetailed(),
    service.getInstanceInfo(),
  ])

  const meData = meResult.success ? safeObject(meResult.data) : {}
  const paymentStatus = normalizePaymentStatus(
    meData.paymentStatus ?? meData.payment_status ?? meData.planStatus ?? meData.plan_status,
  )
  const dueAt = parseDueAt(meData.due ?? meData.dueAt ?? meData.due_at ?? meData.expirationDate ?? meData.expireAt)
  const paymentUrl = pickPaymentUrl(meData, config)
  const dashboardUrl = pickDashboardUrl(meData, config)

  const health = deriveHealth({
    connected: statusResult.connected,
    statusText: statusResult.statusText,
    paymentStatus,
    dueAt,
    error: statusResult.error || (!meResult.success ? meResult.error : undefined),
  })

  return {
    unitId: unit.id,
    unitName: unit.unit_name,
    unitPrefix: unit.unit_prefix,
    isActive: unit.is_active,
    provider,
    instanceId: toText(config.instanceId) || undefined,
    health,
    connected: statusResult.connected,
    statusText: statusResult.statusText,
    paymentStatus,
    dueAt,
    paymentUrl,
    dashboardUrl,
    error: statusResult.error || (!meResult.success ? meResult.error : undefined),
    lastCheckedAt: nowIso,
    rawStatus: safeObject({
      status: statusResult.raw || null,
      me: meResult.success ? meData : null,
    }),
  }
}

function shouldNotifyTransition(prevHealth: string, nextHealth: ZapiHealth) {
  const prev = String(prevHealth || "").toLowerCase()
  const next = String(nextHealth || "").toLowerCase()
  if (!next || prev === next) return false
  return true
}

async function persistSnapshotAndNotify(unit: UnitRow, status: ZapiUnitStatus): Promise<boolean> {
  const supabase = createBiaSupabaseServerClient()
  const metadata = safeObject(unit.metadata)
  const messaging = safeObject(metadata.messaging)

  const previousHealth = toText(messaging.zapiLastHealth).toLowerCase()
  const previousPaymentStatus = toText(messaging.zapiLastPaymentStatus).toLowerCase()

  const nextMessaging = {
    ...messaging,
    ...(status.paymentUrl ? { zapiPaymentUrl: status.paymentUrl } : {}),
    ...(status.dashboardUrl ? { zapiDashboardUrl: status.dashboardUrl } : {}),
    zapiLastCheckedAt: status.lastCheckedAt,
    zapiLastHealth: status.health,
    zapiLastConnected: status.connected,
    zapiLastStatusText: status.statusText || null,
    zapiLastPaymentStatus: status.paymentStatus || null,
    zapiLastDueAt: status.dueAt || null,
    zapiLastError: status.error || null,
  }

  const { error } = await supabase
    .from("units_registry")
    .update({ metadata: { ...metadata, messaging: nextMessaging } })
    .eq("id", unit.id)
  if (error) {
    console.error("[ZAPI Monitor] falha ao salvar snapshot:", unit.unit_prefix, error.message)
  }

  const paymentChanged = previousPaymentStatus !== String(status.paymentStatus || "").toLowerCase()
  const healthChanged = shouldNotifyTransition(previousHealth, status.health)
  if (!paymentChanged && !healthChanged) return false

  const problematic = status.health === "expired" || status.health === "disconnected" || status.health === "error"
  let title = ""
  let message = ""

  if (problematic) {
    title = "Instancia Z-API requer atencao"
    message = `A instancia da unidade ${unit.unit_name} está com status ${status.health}. ${status.paymentStatus ? `Pagamento: ${status.paymentStatus}. ` : ""}${status.dueAt ? `Vencimento: ${status.dueAt}. ` : ""}${status.error ? `Erro: ${status.error}.` : ""}`.trim()
  } else if (previousHealth && previousHealth !== "connected" && status.health === "connected") {
    title = "Instancia Z-API reconectada"
    message = `A unidade ${unit.unit_name} voltou a ficar conectada.`
  }

  if (!title || !message) return false

  const result = await notifyAdminUpdate({
    tenant: unit.unit_prefix,
    title,
    message,
    sourceId: unit.id,
  })
  return result.ok
}

export async function monitorZapiInstances(options?: {
  persistSnapshot?: boolean
  notifyTransitions?: boolean
}): Promise<MonitorZapiInstancesResult> {
  const units = await listUnits()
  const zapiUnits = units.filter((unit) => {
    const provider = toText(safeObject(unit.metadata).messaging?.provider).toLowerCase()
    return provider === "zapi"
  })

  const statuses: ZapiUnitStatus[] = []
  let notificationsSent = 0

  for (const unit of zapiUnits) {
    const inspected = await inspectUnit(unit)
    if (!inspected) continue
    statuses.push(inspected)

    if (options?.persistSnapshot || options?.notifyTransitions) {
      const notified = await persistSnapshotAndNotify(unit, inspected)
      if (options?.notifyTransitions && notified) notificationsSent += 1
    }
  }

  return {
    ok: true,
    totalUnits: units.length,
    totalZapiUnits: zapiUnits.length,
    checked: statuses.length,
    notificationsSent,
    statuses,
  }
}

