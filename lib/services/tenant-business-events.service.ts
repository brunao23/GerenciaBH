import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"

export type TenantBusinessEventType = "attendance" | "no_show" | "sale"

export interface TenantBusinessEventInput {
  tenant: string
  sessionId?: string
  phoneNumber?: string
  leadName?: string
  eventType: TenantBusinessEventType
  saleAmount?: number
  productOrService?: string
  notes?: string
  metadata?: Record<string, any>
  eventAt?: string
  createdBy?: string
}

export interface TenantBusinessEventRecord {
  id: string
  tenant: string
  session_id: string | null
  phone_number: string | null
  lead_name: string | null
  event_type: TenantBusinessEventType
  sale_amount: number | null
  product_or_service: string | null
  notes: string | null
  metadata: Record<string, any>
  event_at: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TenantBusinessEventMetrics {
  totalEvents: number
  attendanceCount: number
  noShowCount: number
  salesCount: number
  totalSalesAmount: number
}

function normalizePhone(value: any): string | null {
  const digits = String(value || "").replace(/\D/g, "")
  if (!digits) return null
  if (digits.length < 10 || digits.length > 15) return null
  return digits.startsWith("55") ? digits : `55${digits}`
}

function normalizeSession(value: any): string | null {
  const text = String(value || "").trim()
  return text ? text : null
}

function normalizeOptionalText(value: any): string | null {
  const text = String(value || "").trim()
  return text || null
}

function toIsoDate(value?: string): string {
  if (!value) return new Date().toISOString()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString()
  return parsed.toISOString()
}

function isMissingTableError(error: any): boolean {
  const message = String(error?.message || "").toLowerCase()
  const code = String(error?.code || "")
  return code === "42P01" || message.includes("does not exist") || message.includes("relation")
}

export class TenantBusinessEventsService {
  private readonly supabase = createBiaSupabaseServerClient()
  private readonly table = "tenant_business_events"

  async createEvent(input: TenantBusinessEventInput): Promise<{ ok: boolean; event?: TenantBusinessEventRecord; error?: string }> {
    try {
      const tenant = normalizeTenant(input.tenant)
      if (!tenant) return { ok: false, error: "invalid_tenant" }

      const saleAmount = Number(input.saleAmount)
      const isSale = input.eventType === "sale"
      const normalizedSaleAmount = Number.isFinite(saleAmount) ? Number(saleAmount.toFixed(2)) : null
      if (isSale && (!normalizedSaleAmount || normalizedSaleAmount <= 0)) {
        return { ok: false, error: "sale_amount_required" }
      }

      const payload = {
        tenant,
        session_id: normalizeSession(input.sessionId),
        phone_number: normalizePhone(input.phoneNumber),
        lead_name: normalizeOptionalText(input.leadName),
        event_type: input.eventType,
        sale_amount: isSale ? normalizedSaleAmount : null,
        product_or_service: isSale ? normalizeOptionalText(input.productOrService) : null,
        notes: normalizeOptionalText(input.notes),
        metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
        event_at: toIsoDate(input.eventAt),
        created_by: normalizeOptionalText(input.createdBy),
      }

      const { data, error } = await this.supabase
        .from(this.table)
        .insert(payload)
        .select("*")
        .single()

      if (error) {
        if (isMissingTableError(error)) {
          return { ok: false, error: "tenant_business_events_table_missing" }
        }
        return { ok: false, error: error.message }
      }

      return { ok: true, event: data as TenantBusinessEventRecord }
    } catch (error: any) {
      return { ok: false, error: error?.message || "failed_to_create_business_event" }
    }
  }

  async listRecentEvents(input: {
    tenant: string
    startAt?: string
    endAt?: string
    limit?: number
  }): Promise<{ ok: boolean; events: TenantBusinessEventRecord[]; error?: string }> {
    try {
      const tenant = normalizeTenant(input.tenant)
      if (!tenant) return { ok: false, events: [], error: "invalid_tenant" }

      const limit = Number.isFinite(Number(input.limit))
        ? Math.max(1, Math.min(200, Math.floor(Number(input.limit))))
        : 20

      let query = this.supabase
        .from(this.table)
        .select("*")
        .eq("tenant", tenant)
        .order("event_at", { ascending: false })
        .limit(limit)

      if (input.startAt) {
        query = query.gte("event_at", toIsoDate(input.startAt))
      }
      if (input.endAt) {
        query = query.lte("event_at", toIsoDate(input.endAt))
      }

      const { data, error } = await query
      if (error) {
        if (isMissingTableError(error)) {
          return { ok: true, events: [] }
        }
        return { ok: false, events: [], error: error.message }
      }

      return { ok: true, events: (data || []) as TenantBusinessEventRecord[] }
    } catch (error: any) {
      return { ok: false, events: [], error: error?.message || "failed_to_list_business_events" }
    }
  }

  async getMetrics(input: {
    tenant: string
    startAt?: string
    endAt?: string
  }): Promise<{ ok: boolean; metrics: TenantBusinessEventMetrics; error?: string }> {
    const empty: TenantBusinessEventMetrics = {
      totalEvents: 0,
      attendanceCount: 0,
      noShowCount: 0,
      salesCount: 0,
      totalSalesAmount: 0,
    }

    try {
      const tenant = normalizeTenant(input.tenant)
      if (!tenant) return { ok: false, metrics: empty, error: "invalid_tenant" }

      let query = this.supabase
        .from(this.table)
        .select("event_type, sale_amount, event_at")
        .eq("tenant", tenant)

      if (input.startAt) {
        query = query.gte("event_at", toIsoDate(input.startAt))
      }
      if (input.endAt) {
        query = query.lte("event_at", toIsoDate(input.endAt))
      }

      const { data, error } = await query
      if (error) {
        if (isMissingTableError(error)) {
          return { ok: true, metrics: empty }
        }
        return { ok: false, metrics: empty, error: error.message }
      }

      const metrics = (data || []).reduce<TenantBusinessEventMetrics>((acc, row: any) => {
        const type = String(row?.event_type || "").toLowerCase()
        acc.totalEvents += 1
        if (type === "attendance") acc.attendanceCount += 1
        if (type === "no_show") acc.noShowCount += 1
        if (type === "sale") {
          acc.salesCount += 1
          const amount = Number(row?.sale_amount)
          if (Number.isFinite(amount)) {
            acc.totalSalesAmount += amount
          }
        }
        return acc
      }, empty)

      metrics.totalSalesAmount = Number(metrics.totalSalesAmount.toFixed(2))
      return { ok: true, metrics }
    } catch (error: any) {
      return { ok: false, metrics: empty, error: error?.message || "failed_to_get_business_metrics" }
    }
  }
}
