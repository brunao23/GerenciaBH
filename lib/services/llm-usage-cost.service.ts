import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"
import { normalizeTenant } from "@/lib/helpers/normalize-tenant"
import { type LLMUsageMetrics } from "@/lib/services/gemini.service"

type PricingRule = {
  provider: string
  modelMatch: string
  inputUsdPerMillion: number
  outputUsdPerMillion: number
}

type ToolCostMap = Record<string, number>

type ToolUsageEntry = {
  tool: string
  actionType?: string
  count: number
  unitCostBrl: number
  totalCostBrl: number
}

export interface PersistLlmUsageEventInput {
  tenant: string
  sessionId: string
  messageId?: string
  source?: string
  channel?: string
  provider?: string
  model?: string
  cacheHit?: boolean
  usage?: LLMUsageMetrics | null
  toolCalls?: Array<{ name?: string | null; actionType?: string | null }>
  metadata?: Record<string, any>
}

const DEFAULT_FX_RATE_BRL = 5.5

const DEFAULT_PRICING_RULES: PricingRule[] = [
  { provider: "openai", modelMatch: "gpt-4o-mini", inputUsdPerMillion: 0.15, outputUsdPerMillion: 0.6 },
  { provider: "openai", modelMatch: "gpt-4o", inputUsdPerMillion: 2.5, outputUsdPerMillion: 10 },
  { provider: "openai", modelMatch: "gpt-4.1-mini", inputUsdPerMillion: 0.4, outputUsdPerMillion: 1.6 },
  { provider: "openai", modelMatch: "gpt-4.1-nano", inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 },
  { provider: "openai", modelMatch: "gpt-4.1", inputUsdPerMillion: 2, outputUsdPerMillion: 8 },

  { provider: "google", modelMatch: "gemini-2.5-flash-lite", inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 },
  { provider: "google", modelMatch: "gemini-2.5-flash", inputUsdPerMillion: 0.3, outputUsdPerMillion: 2.5 },
  { provider: "google", modelMatch: "gemini-2.5-pro", inputUsdPerMillion: 1.25, outputUsdPerMillion: 10 },

  { provider: "anthropic", modelMatch: "claude-sonnet-4", inputUsdPerMillion: 3, outputUsdPerMillion: 15 },
  { provider: "anthropic", modelMatch: "claude-3-5-sonnet", inputUsdPerMillion: 3, outputUsdPerMillion: 15 },
  { provider: "anthropic", modelMatch: "claude-3-5-haiku", inputUsdPerMillion: 0.8, outputUsdPerMillion: 4 },
]

function toFiniteNumber(value: any, fallback = 0): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return numeric
}

function toTokenInt(value: any): number {
  const numeric = toFiniteNumber(value, 0)
  if (numeric <= 0) return 0
  return Math.max(0, Math.floor(numeric))
}

function roundMoney(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round((Number(value) || 0) * factor) / factor
}

function normalizeModel(model?: string | null): string {
  return String(model || "")
    .trim()
    .toLowerCase()
    .replace(/^models\//, "")
}

function normalizeProvider(provider?: string | null): string {
  const normalized = String(provider || "").trim().toLowerCase()
  if (!normalized) return "unknown"
  if (normalized.includes("gemini") || normalized === "google") return "google"
  if (normalized.includes("openai")) return "openai"
  if (normalized.includes("anthropic") || normalized.includes("claude")) return "anthropic"
  if (normalized.includes("openrouter")) return "openrouter"
  if (normalized.includes("groq")) return "groq"
  return normalized
}

function parsePricingEnvRules(): PricingRule[] {
  const raw = String(process.env.LLM_MODEL_PRICING_USD_JSON || "").trim()
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => ({
        provider: normalizeProvider(item?.provider),
        modelMatch: normalizeModel(item?.modelMatch || item?.model || ""),
        inputUsdPerMillion: toFiniteNumber(item?.inputUsdPerMillion, NaN),
        outputUsdPerMillion: toFiniteNumber(item?.outputUsdPerMillion, NaN),
      }))
      .filter(
        (item) =>
          item.provider &&
          item.modelMatch &&
          Number.isFinite(item.inputUsdPerMillion) &&
          Number.isFinite(item.outputUsdPerMillion),
      )
  } catch {
    return []
  }
}

function parseToolCostsEnvMap(): ToolCostMap {
  const raw = String(process.env.LLM_TOOL_COSTS_BRL_JSON || "").trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}

    const result: ToolCostMap = {}
    for (const [key, value] of Object.entries(parsed)) {
      const normalizedKey = String(key || "").trim().toLowerCase()
      if (!normalizedKey) continue
      const cost = toFiniteNumber(value, NaN)
      if (!Number.isFinite(cost) || cost <= 0) continue
      result[normalizedKey] = cost
    }
    return result
  } catch {
    return {}
  }
}

export class LlmUsageCostService {
  private readonly supabase = createBiaSupabaseServerClient()
  private readonly pricingRules: PricingRule[]
  private readonly toolCostsBrl: ToolCostMap
  private readonly fxRateBrl: number

  constructor() {
    const envRules = parsePricingEnvRules()
    this.pricingRules = [...envRules, ...DEFAULT_PRICING_RULES]
    this.toolCostsBrl = parseToolCostsEnvMap()
    this.fxRateBrl = toFiniteNumber(process.env.LLM_USD_TO_BRL, DEFAULT_FX_RATE_BRL)
  }

  private resolvePricing(provider: string, model: string): {
    inputUsdPerMillion: number
    outputUsdPerMillion: number
    source: string
  } {
    const normalizedProvider = normalizeProvider(provider)
    const normalizedModel = normalizeModel(model)

    for (const rule of this.pricingRules) {
      if (rule.provider !== normalizedProvider) continue
      if (!normalizedModel.includes(rule.modelMatch)) continue
      return {
        inputUsdPerMillion: rule.inputUsdPerMillion,
        outputUsdPerMillion: rule.outputUsdPerMillion,
        source: "provider_model_rule",
      }
    }

    return {
      inputUsdPerMillion: 0,
      outputUsdPerMillion: 0,
      source: "unpriced_model",
    }
  }

  private buildToolBreakdown(
    toolCalls: Array<{ name?: string | null; actionType?: string | null }>,
  ): { entries: ToolUsageEntry[]; totalBrl: number } {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      return { entries: [], totalBrl: 0 }
    }

    const bucket = new Map<string, { tool: string; actionType?: string; count: number }>()
    for (const call of toolCalls) {
      const tool = String(call?.name || "").trim().toLowerCase() || "unknown_tool"
      const actionType = String(call?.actionType || "").trim().toLowerCase() || undefined
      const key = `${tool}::${actionType || ""}`
      const existing = bucket.get(key)
      if (existing) {
        existing.count += 1
      } else {
        bucket.set(key, { tool, actionType, count: 1 })
      }
    }

    const entries: ToolUsageEntry[] = []
    for (const item of bucket.values()) {
      const byTool = this.toolCostsBrl[item.tool] || 0
      const byAction = item.actionType ? this.toolCostsBrl[item.actionType] || 0 : 0
      const unitCostBrl = Math.max(byTool, byAction)
      const totalCostBrl = roundMoney(unitCostBrl * item.count, 6)

      entries.push({
        tool: item.tool,
        actionType: item.actionType,
        count: item.count,
        unitCostBrl,
        totalCostBrl,
      })
    }

    const totalBrl = roundMoney(
      entries.reduce((sum, entry) => sum + entry.totalCostBrl, 0),
      6,
    )

    return { entries, totalBrl }
  }

  async persistUsageEvent(input: PersistLlmUsageEventInput): Promise<void> {
    const tenant = normalizeTenant(input.tenant)
    const sessionId = String(input.sessionId || "").trim()
    if (!tenant || !sessionId) return

    const usage = input.usage || null
    const provider = normalizeProvider(usage?.provider || input.provider)
    const model = normalizeModel(usage?.model || input.model || "")

    const inputTokens = toTokenInt(usage?.inputTokens)
    const outputTokens = toTokenInt(usage?.outputTokens)
    const totalTokensRaw = toTokenInt(usage?.totalTokens)
    const totalTokens = totalTokensRaw > 0 ? totalTokensRaw : inputTokens + outputTokens
    const cachedInputTokens = toTokenInt(usage?.cachedInputTokens)

    const pricing = this.resolvePricing(provider, model)

    const inputCostUsd = roundMoney((inputTokens / 1_000_000) * pricing.inputUsdPerMillion, 8)
    const outputCostUsd = roundMoney((outputTokens / 1_000_000) * pricing.outputUsdPerMillion, 8)
    const totalCostUsd = roundMoney(inputCostUsd + outputCostUsd, 8)

    const inputCostBrl = roundMoney(inputCostUsd * this.fxRateBrl, 6)
    const outputCostBrl = roundMoney(outputCostUsd * this.fxRateBrl, 6)

    const toolBreakdown = this.buildToolBreakdown(input.toolCalls || [])
    const toolsCostBrl = roundMoney(toolBreakdown.totalBrl, 6)
    const totalCostBrl = roundMoney(inputCostBrl + outputCostBrl + toolsCostBrl, 6)

    const payload = {
      tenant,
      session_id: sessionId,
      message_id: String(input.messageId || "").trim() || null,
      source: String(input.source || "native-agent").trim() || "native-agent",
      channel: String(input.channel || "").trim() || null,
      provider,
      model: model || "unknown",
      cache_hit: input.cacheHit === true,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      cached_input_tokens: cachedInputTokens,
      input_cost_usd: inputCostUsd,
      output_cost_usd: outputCostUsd,
      total_cost_usd: totalCostUsd,
      fx_rate_brl: this.fxRateBrl,
      input_cost_brl: inputCostBrl,
      output_cost_brl: outputCostBrl,
      tools_cost_brl: toolsCostBrl,
      total_cost_brl: totalCostBrl,
      tool_calls_count: Array.isArray(input.toolCalls) ? input.toolCalls.length : 0,
      tool_executions_count: Array.isArray(input.toolCalls) ? input.toolCalls.length : 0,
      tools_breakdown: toolBreakdown.entries,
      pricing_source: pricing.source,
      raw_usage: usage?.raw && typeof usage.raw === "object" ? usage.raw : null,
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : null,
    }

    const { error } = await this.supabase.from("llm_usage_events").insert(payload)
    if (error) {
      console.warn("[llm-usage] failed to persist event:", error?.message || error)
    }
  }
}
