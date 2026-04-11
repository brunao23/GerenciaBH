import { NextResponse } from "next/server"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { getTablesForTenant } from "@/lib/helpers/tenant"
import { getMessagingConfigForTenant } from "@/lib/helpers/messaging-config"

type Periodo = "dia" | "semana" | "mes" | "ano"
type SeriesBucket = "hour" | "day"

function resolvePeriodRange(periodo: Periodo) {
  const now = new Date()
  const start = new Date(now)

  switch (periodo) {
    case "dia":
      start.setHours(0, 0, 0, 0)
      break
    case "semana":
      start.setDate(start.getDate() - 7)
      break
    case "mes":
      start.setMonth(start.getMonth() - 1)
      break
    case "ano":
      start.setFullYear(start.getFullYear() - 1)
      break
    default:
      start.setDate(start.getDate() - 7)
      break
  }

  return { start, end: now }
}

function safeString(value: any) {
  return typeof value === "string" ? value : value ? String(value) : ""
}

function normalizePricingCategory(value: any) {
  const raw = safeString(value).toLowerCase()
  if (!raw) return ""
  if (raw.includes("marketing")) return "marketing"
  if (raw.includes("utility")) return "utility"
  if (raw.includes("auth")) return "authentication"
  if (raw.includes("service")) return "service"
  return raw
}

function extractPricingDataArray(payload: any) {
  if (!payload) return []
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.pricing_analytics?.data)) return payload.pricing_analytics.data
  if (Array.isArray(payload?.pricing_analytics)) return payload.pricing_analytics
  return []
}

function parsePricingMetricPayload(payload: any, metricType: "COST" | "CONVERSATION" | "VOLUME") {
  const data = extractPricingDataArray(payload)
  const byCategory: Record<string, number> = {}
  let total = 0
  let currency = ""

  const takeValue = (categoryRaw: any, valueRaw: any, currencyRaw?: any) => {
    const category = normalizePricingCategory(categoryRaw)
    const value = Number(valueRaw)
    if (!category || !Number.isFinite(value)) return
    byCategory[category] = (byCategory[category] || 0) + value
    total += value
    if (!currency && currencyRaw) currency = safeString(currencyRaw)
  }

  for (const entry of data) {
    if (entry?.currency && !currency) currency = safeString(entry.currency)
    if (Array.isArray(entry?.values)) {
      for (const item of entry.values) {
        const category =
          item?.pricing_category ||
          item?.pricingCategory ||
          item?.dimension?.pricing_category ||
          entry?.pricing_category ||
          entry?.dimensions?.pricing_category
        takeValue(category, item?.value ?? item?.metric_value ?? item?.count, item?.currency)
      }
      continue
    }

    if (Array.isArray(entry?.data_points)) {
      for (const item of entry.data_points) {
        const category =
          item?.pricing_category ||
          item?.pricingCategory ||
          item?.dimension?.pricing_category ||
          entry?.pricing_category ||
          entry?.dimensions?.pricing_category
        const valueRaw =
          metricType === "COST"
            ? item?.cost ?? item?.value ?? item?.metric_value
            : item?.volume ?? item?.value ?? item?.metric_value ?? item?.count
        takeValue(category, valueRaw, item?.currency || entry?.currency)
      }
      continue
    }

    if (entry?.metrics) {
      const metricKey = Object.keys(entry.metrics).find(
        (key) => key.toLowerCase() === metricType.toLowerCase(),
      )
      const metricValues = metricKey ? entry.metrics[metricKey] : null
      if (Array.isArray(metricValues)) {
        for (const item of metricValues) {
          const category =
            item?.pricing_category ||
            item?.pricingCategory ||
            item?.dimension?.pricing_category ||
            entry?.pricing_category ||
            entry?.dimensions?.pricing_category
          takeValue(category, item?.value ?? item?.metric_value ?? item?.count, item?.currency)
        }
      }
    }
  }

  return { byCategory, total, currency }
}

async function fetchPricingMetric(
  accessToken: string,
  wabaId: string,
  apiVersion: string,
  startTs: number,
  endTs: number,
  metricType: "COST" | "CONVERSATION" | "VOLUME",
) {
  const baseUrl = `https://graph.facebook.com/${apiVersion}/${wabaId}`
  const params = new URLSearchParams({
    access_token: accessToken,
    start: String(startTs),
    end: String(endTs),
    granularity: "DAILY",
    metric_types: metricType,
    dimensions: "PRICING_CATEGORY",
  })

  const attemptUrls = [
    `${baseUrl}/pricing_analytics?${params.toString()}`,
    `${baseUrl}?fields=${encodeURIComponent(
      `pricing_analytics.start(${startTs}).end(${endTs}).granularity(DAILY).metric_types(${metricType}).dimensions(PRICING_CATEGORY)`,
    )}&access_token=${encodeURIComponent(accessToken)}`,
  ]

  let lastError: string | null = null
  for (const url of attemptUrls) {
    const res = await fetch(url, { cache: "no-store" })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      lastError = payload?.error?.message || `HTTP ${res.status}`
      continue
    }
    if (payload?.error) {
      lastError = payload.error?.message || "Meta API error"
      continue
    }
    return parsePricingMetricPayload(payload, metricType)
  }

  throw new Error(lastError || "Pricing analytics unavailable")
}

async function fetchPricingAnalytics(
  accessToken: string,
  wabaId: string,
  apiVersion: string,
  startTs: number,
  endTs: number,
) {
  const cost = await fetchPricingMetric(
    accessToken,
    wabaId,
    apiVersion,
    startTs,
    endTs,
    "COST",
  )

  let volumeResult = null
  try {
    volumeResult = await fetchPricingMetric(
      accessToken,
      wabaId,
      apiVersion,
      startTs,
      endTs,
      "CONVERSATION",
    )
  } catch {
    volumeResult = await fetchPricingMetric(
      accessToken,
      wabaId,
      apiVersion,
      startTs,
      endTs,
      "VOLUME",
    )
  }

  const byCategory: Record<string, { cost: number; volume: number; average: number }> = {}
  const categories = new Set([
    ...Object.keys(cost.byCategory || {}),
    ...Object.keys(volumeResult?.byCategory || {}),
  ])

  for (const category of categories) {
    const costValue = cost.byCategory[category] || 0
    const volumeValue = volumeResult?.byCategory[category] || 0
    const average = volumeValue > 0 ? costValue / volumeValue : 0
    byCategory[category] = { cost: costValue, volume: volumeValue, average }
  }

  return {
    currency: cost.currency || volumeResult?.currency || "USD",
    totalCost: cost.total || 0,
    totalVolume: volumeResult?.total || 0,
    byCategory,
    source: "pricing_analytics",
  }
}

function toBucketKey(date: Date, bucket: SeriesBucket) {
  const next = new Date(date)
  if (bucket === "hour") {
    next.setMinutes(0, 0, 0)
  } else {
    next.setHours(0, 0, 0, 0)
  }
  return next.toISOString()
}

function addBucketStep(date: Date, bucket: SeriesBucket) {
  const next = new Date(date)
  if (bucket === "hour") {
    next.setHours(next.getHours() + 1)
  } else {
    next.setDate(next.getDate() + 1)
  }
  return next
}

function buildStatusSeries(
  rows: any[],
  start: Date,
  end: Date,
  bucket: SeriesBucket,
) {
  const seriesMap = new Map<
    string,
    { bucket: string; sent: number; delivered: number; read: number; failed: number }
  >()

  let cursor = new Date(start)
  cursor = bucket === "hour" ? new Date(cursor.setMinutes(0, 0, 0)) : new Date(cursor.setHours(0, 0, 0, 0))
  while (cursor <= end) {
    const key = cursor.toISOString()
    seriesMap.set(key, { bucket: key, sent: 0, delivered: 0, read: 0, failed: 0 })
    cursor = addBucketStep(cursor, bucket)
  }

  for (const row of rows) {
    const message = row?.message || {}
    if (message.type !== "status") continue

    const createdAtRaw = safeString(message.created_at || row?.created_at)
    const createdAt = createdAtRaw ? new Date(createdAtRaw) : null
    if (!createdAt || Number.isNaN(createdAt.getTime())) continue

    const key = toBucketKey(createdAt, bucket)
    const entry =
      seriesMap.get(key) || { bucket: key, sent: 0, delivered: 0, read: 0, failed: 0 }

    const status = safeString(message.status || message.raw?.status).toLowerCase()
    if (status === "sent") entry.sent += 1
    if (status === "delivered") entry.delivered += 1
    if (status === "read") entry.read += 1
    if (status === "failed") entry.failed += 1

    seriesMap.set(key, entry)
  }

  return Array.from(seriesMap.values()).sort((a, b) => (a.bucket < b.bucket ? -1 : 1))
}

export async function GET(req: Request) {
  try {
    const tenant = await resolveTenant(req)
    const url = new URL(req.url)
    const periodo = (url.searchParams.get("periodo") || "semana") as Periodo
    const { start, end } = resolvePeriodRange(periodo)

    const config = await getMessagingConfigForTenant(tenant)
    const metaReady =
      config?.provider === "meta" && config.metaAccessToken && config.metaWabaId
    const metaApiVersion = config?.metaApiVersion || "v21.0"
    let pricingAnalytics: any = null
    let pricingAnalyticsError: string | null = null

    const supabase = createBiaSupabaseServerClient()
    const { chatHistories } = getTablesForTenant(tenant)

    const { data, error } = await supabase
      .from(chatHistories)
      .select("message, created_at, session_id")
      .eq("message->>source", "meta")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())

    if (error) {
      throw error
    }

    const rows = Array.isArray(data) ? data : []
    const seriesBucket: SeriesBucket = periodo === "dia" ? "hour" : "day"
    const series = buildStatusSeries(rows, start, end, seriesBucket)
    const statusCounts: Record<string, number> = {}
    const pricingCounts: Record<string, number> = {}
    const conversationCounts: Record<string, number> = {}
    const openedByMap = new Map<
      string,
      { recipient: string; count: number; firstReadAt: string; lastReadAt: string }
    >()
    const clickEvents: Array<{
      recipient: string
      label: string
      type: string
      at: string
    }> = []

    let responses = 0
    let quickReplies = 0
    let billable = 0

    for (const row of rows) {
      const message = row?.message || {}
      const createdAt = safeString(row?.created_at) || new Date().toISOString()

      if (message.type === "status") {
        const status = safeString(message.status || message.raw?.status).toLowerCase()
        if (status) {
          statusCounts[status] = (statusCounts[status] || 0) + 1
        }

        const pricingCategory = safeString(message.pricing?.category)
        if (pricingCategory) {
          pricingCounts[pricingCategory] = (pricingCounts[pricingCategory] || 0) + 1
        }
        if (message.pricing?.billable) {
          billable += 1
        }

        const conversationCategory = safeString(message.conversation?.category)
        if (conversationCategory) {
          conversationCounts[conversationCategory] =
            (conversationCounts[conversationCategory] || 0) + 1
        }

        if (status === "read") {
          const recipient = safeString(message.recipient_id || message.raw?.recipient_id)
          if (recipient) {
            const existing = openedByMap.get(recipient)
            if (existing) {
              existing.count += 1
              if (createdAt < existing.firstReadAt) existing.firstReadAt = createdAt
              if (createdAt > existing.lastReadAt) existing.lastReadAt = createdAt
            } else {
              openedByMap.set(recipient, {
                recipient,
                count: 1,
                firstReadAt: createdAt,
                lastReadAt: createdAt,
              })
            }
          }
        }
        continue
      }

      if (message.role === "user" || message.type === "user") {
        responses += 1
        const raw = message.raw || {}
        const quickReplyLabel =
          raw?.button?.text ||
          raw?.button?.payload ||
          raw?.interactive?.button_reply?.title ||
          raw?.interactive?.button_reply?.id ||
          raw?.interactive?.list_reply?.title ||
          raw?.interactive?.list_reply?.id ||
          raw?.interactive?.nfm_reply?.name ||
          ""
        if (quickReplyLabel) {
          quickReplies += 1
          const recipient = safeString(raw?.from || message.from || "")
          const replyType = raw?.button
            ? "button"
            : raw?.interactive?.button_reply
              ? "button_reply"
              : raw?.interactive?.list_reply
                ? "list_reply"
                : raw?.interactive?.nfm_reply
                  ? "flow_reply"
                : "interactive"
          clickEvents.push({
            recipient,
            label: safeString(quickReplyLabel),
            type: replyType,
            at: createdAt,
          })
        }
      }
    }

    const openedBy = Array.from(openedByMap.values()).sort((a, b) =>
      a.lastReadAt < b.lastReadAt ? 1 : -1,
    )

    const totals = {
      sent: statusCounts.sent || 0,
      delivered: statusCounts.delivered || 0,
      read: statusCounts.read || 0,
      failed: statusCounts.failed || 0,
      responses,
      quickReplies,
      billable,
    }

    if (metaReady) {
      try {
        const startTs = Math.floor(start.getTime() / 1000)
        const endTs = Math.floor(end.getTime() / 1000)
        pricingAnalytics = await fetchPricingAnalytics(
          config?.metaAccessToken || "",
          config?.metaWabaId || "",
          metaApiVersion,
          startTs,
          endTs,
        )
      } catch (error: any) {
        pricingAnalyticsError = error?.message || "Pricing analytics unavailable"
      }
    }

    return NextResponse.json({
      periodo,
      dataInicio: start.toISOString(),
      dataFim: end.toISOString(),
      seriesBucket,
      series,
      totals,
      byStatus: statusCounts,
      byPricingCategory: pricingCounts,
      byConversationCategory: conversationCounts,
      openedBy,
      clicks: clickEvents.slice(-200).reverse(),
      pricingAnalytics,
      pricingAnalyticsError,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load Meta report" },
      { status: 500 },
    )
  }
}
