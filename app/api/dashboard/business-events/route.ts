import { NextResponse } from "next/server"
import { getTenantFromRequest } from "@/lib/helpers/api-tenant"
import { AgentTaskQueueService } from "@/lib/services/agent-task-queue.service"
import { TenantBusinessEventsService, type TenantBusinessEventType } from "@/lib/services/tenant-business-events.service"
import { getNativeAgentConfigForTenant } from "@/lib/helpers/native-agent-config"

function toIsoDate(value?: string | null): string | null {
  const text = String(value || "").trim()
  if (!text) return null
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function parsePeriodRange(searchParams: URLSearchParams): { startAt: string; endAt: string } {
  const period = String(searchParams.get("period") || "7d").toLowerCase()
  const now = new Date()

  if (period === "custom") {
    const start = toIsoDate(searchParams.get("startDate"))
    const end = toIsoDate(searchParams.get("endDate"))
    if (start && end && new Date(start) <= new Date(end)) {
      return { startAt: start, endAt: end }
    }
  }

  const daysMap: Record<string, number> = {
    "7d": 7,
    "15d": 15,
    "30d": 30,
    "90d": 90,
  }

  const days = daysMap[period] || 7
  const start = new Date(now)
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)

  return {
    startAt: start.toISOString(),
    endAt: now.toISOString(),
  }
}

function normalizeEventType(value: any): TenantBusinessEventType | null {
  const type = String(value || "").trim().toLowerCase()
  if (type === "attendance" || type === "no_show" || type === "sale") return type
  return null
}

function renderTemplate(template: string, data: Record<string, string>): string {
  return String(template || "")
    .replace(/\{\{\s*lead_name\s*\}\}/gi, data.lead_name || "Lead")
    .replace(/\{\{\s*phone\s*\}\}/gi, data.phone || "")
    .replace(/\{\{\s*event_date\s*\}\}/gi, data.event_date || "")
    .replace(/\{\{\s*product\s*\}\}/gi, data.product || "")
    .replace(/\{\{\s*sale_amount\s*\}\}/gi, data.sale_amount || "")
    .replace(/\s+/g, " ")
    .trim()
}

function formatCurrencyBRL(value?: number | null): string {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return ""
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function addMinutesIso(minutes: number): string {
  const value = Number.isFinite(minutes) ? Math.max(1, Math.floor(minutes)) : 1
  return new Date(Date.now() + value * 60 * 1000).toISOString()
}

export async function GET(req: Request) {
  try {
    const tenantContext = await getTenantFromRequest()
    const tenant = tenantContext.tenant
    const url = new URL(req.url)
    const range = parsePeriodRange(url.searchParams)

    const service = new TenantBusinessEventsService()
    const [metricsResult, recentResult] = await Promise.all([
      service.getMetrics({ tenant, startAt: range.startAt, endAt: range.endAt }),
      service.listRecentEvents({
        tenant,
        startAt: range.startAt,
        endAt: range.endAt,
        limit: 20,
      }),
    ])

    if (!metricsResult.ok) {
      return NextResponse.json(
        {
          success: false,
          error: metricsResult.error || "failed_to_load_business_metrics",
        },
        { status: 500 },
      )
    }

    if (!recentResult.ok) {
      return NextResponse.json(
        {
          success: false,
          error: recentResult.error || "failed_to_load_business_events",
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      range,
      metrics: metricsResult.metrics,
      recentEvents: recentResult.events,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "failed_to_load_business_events",
      },
      { status: 401 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const tenantContext = await getTenantFromRequest()
    const tenant = tenantContext.tenant
    const body = await req.json()

    const eventType = normalizeEventType(body?.eventType)
    if (!eventType) {
      return NextResponse.json(
        { success: false, error: "invalid_event_type" },
        { status: 400 },
      )
    }

    const service = new TenantBusinessEventsService()
    const createResult = await service.createEvent({
      tenant,
      eventType,
      sessionId: body?.sessionId,
      phoneNumber: body?.phone,
      leadName: body?.leadName,
      saleAmount: body?.saleAmount,
      productOrService: body?.productOrService,
      notes: body?.notes,
      metadata: {
        source: "dashboard_manual",
      },
      eventAt: body?.eventAt,
      createdBy: String(tenantContext?.session?.unitName || "dashboard_user"),
    })

    if (!createResult.ok || !createResult.event) {
      return NextResponse.json(
        {
          success: false,
          error: createResult.error || "failed_to_create_business_event",
        },
        { status: 400 },
      )
    }

    const queue = new AgentTaskQueueService()
    const config = await getNativeAgentConfigForTenant(tenant)
    const event = createResult.event
    const leadName = String(event.lead_name || "Lead")
    const eventDate = new Date(event.event_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })

    let queuedTask: { type: "reengagement" | "welcome"; id?: string; runAt?: string } | null = null

    if (
      event.event_type === "no_show" &&
      config?.reengagementAgentEnabled &&
      event.phone_number &&
      event.session_id
    ) {
      const delayMinutes = Number(config.reengagementDelayMinutes || 180)
      const runAt = addMinutesIso(delayMinutes)
      const template =
        config.reengagementTemplate ||
        "Oi {{lead_name}}, vi que voce nao conseguiu comparecer no ultimo horario. Quer que eu te envie novas opcoes para reagendar?"
      const message = renderTemplate(template, {
        lead_name: leadName,
        phone: event.phone_number,
        event_date: eventDate,
        product: String(event.product_or_service || ""),
        sale_amount: formatCurrencyBRL(event.sale_amount),
      })

      const enqueued = await queue.enqueueReminder({
        tenant,
        sessionId: event.session_id,
        phone: event.phone_number,
        message,
        runAt,
        metadata: {
          reminder_kind: "reengagement_no_show",
          source: "tenant_business_events",
        },
      })

      if (enqueued.ok) {
        queuedTask = { type: "reengagement", id: enqueued.id, runAt }
      }
    }

    if (
      event.event_type === "sale" &&
      config?.welcomeAgentEnabled &&
      event.phone_number &&
      event.session_id
    ) {
      const delayMinutes = Number(config.welcomeDelayMinutes || 10080)
      const runAt = addMinutesIso(delayMinutes)
      const template =
        config.welcomeTemplate ||
        "Oi {{lead_name}}, passando para te dar as boas-vindas e saber como esta sua experiencia ate aqui. Se precisar, estou por aqui."
      const message = renderTemplate(template, {
        lead_name: leadName,
        phone: event.phone_number,
        event_date: eventDate,
        product: String(event.product_or_service || ""),
        sale_amount: formatCurrencyBRL(event.sale_amount),
      })

      const enqueued = await queue.enqueueReminder({
        tenant,
        sessionId: event.session_id,
        phone: event.phone_number,
        message,
        runAt,
        metadata: {
          reminder_kind: "welcome_new_customer",
          source: "tenant_business_events",
        },
      })

      if (enqueued.ok) {
        queuedTask = { type: "welcome", id: enqueued.id, runAt }
      }
    }

    return NextResponse.json({
      success: true,
      event,
      queuedTask,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "failed_to_create_business_event",
      },
      { status: 500 },
    )
  }
}
