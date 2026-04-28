import { createHash } from "crypto"

export interface GeminiConversationMessage {
  role: "user" | "assistant"
  content: string
}

export interface AgentActionPlan {
  type:
    | "get_available_slots"
    | "schedule_appointment"
    | "edit_appointment"
    | "cancel_appointment"
    | "create_followup"
    | "create_reminder"
    | "handoff_human"
    | "none"
  appointment_id?: string
  date?: string
  time?: string
  old_date?: string
  old_time?: string
  date_from?: string
  date_to?: string
  max_slots?: number
  appointment_mode?: "presencial" | "online"
  customer_name?: string
  customer_email?: string
  note?: string
  minutes_from_now?: number
}

export interface GeminiAgentDecision {
  reply: string
  actions: AgentActionPlan[]
  handoff: boolean
}

export interface GeminiFunctionDeclaration {
  name: string
  description: string
  parameters?: Record<string, any>
}

export interface GeminiToolCall {
  id?: string
  name: string
  args: Record<string, any>
}

export interface GeminiToolExecution {
  call: GeminiToolCall
  action: AgentActionPlan
  ok: boolean
  response: Record<string, any>
  error?: string
}

export interface GeminiToolHandlerResult {
  ok: boolean
  response?: Record<string, any>
  error?: string
  action?: AgentActionPlan
}

export interface GeminiToolDecision extends GeminiAgentDecision {
  toolCalls: GeminiToolCall[]
  executions: GeminiToolExecution[]
}

export interface GeminiMediaAnalysisInput {
  mediaBase64: string
  mimeType: string
  mediaType?: "image" | "video" | "document"
  prompt?: string
}

type GeminiSamplingConfig = {
  temperature?: number
  topP?: number
  topK?: number
}

function resolveSamplingValue(
  value: any,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  if (numeric < min) return min
  if (numeric > max) return max
  return numeric
}

function extractJsonObject(input: string): string | null {
  const text = String(input || "").trim()
  if (!text) return null

  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end < start) return null
  return text.slice(start, end + 1)
}

function safeParseDecision(input: string): GeminiAgentDecision | null {
  const json = extractJsonObject(input)
  if (!json) return null

  try {
    const parsed = JSON.parse(json)
    const reply = String(parsed?.reply || "").trim()
    const rawActions = Array.isArray(parsed?.actions) ? parsed.actions : []
    const actions: AgentActionPlan[] = rawActions
      .map((action: any): AgentActionPlan => ({
        type: String(action?.type || "none") as AgentActionPlan["type"],
        date: action?.date ? String(action.date) : undefined,
        time: action?.time ? String(action.time) : undefined,
        appointment_mode:
          String(action?.appointment_mode || "").toLowerCase() === "online" ? "online" : "presencial",
        appointment_id: action?.appointment_id ? String(action.appointment_id) : undefined,
        customer_name: action?.customer_name ? String(action.customer_name) : undefined,
        customer_email: action?.customer_email ? String(action.customer_email) : undefined,
        old_date: action?.old_date ? String(action.old_date) : undefined,
        old_time: action?.old_time ? String(action.old_time) : undefined,
        date_from: action?.date_from ? String(action.date_from) : undefined,
        date_to: action?.date_to ? String(action.date_to) : undefined,
        max_slots:
          action?.max_slots !== undefined && Number.isFinite(Number(action.max_slots))
            ? Number(action.max_slots)
            : undefined,
        note: action?.note ? String(action.note) : undefined,
        minutes_from_now:
          action?.minutes_from_now !== undefined && Number.isFinite(Number(action.minutes_from_now))
            ? Number(action.minutes_from_now)
            : undefined,
      }))
      .filter((action: AgentActionPlan) =>
        [
          "get_available_slots",
          "schedule_appointment",
          "edit_appointment",
          "cancel_appointment",
          "create_followup",
          "create_reminder",
          "handoff_human",
          "none",
        ].includes(action.type),
      )

    if (!reply) return null

    return {
      reply,
      actions,
      handoff: Boolean(parsed?.handoff || actions.some((action) => action.type === "handoff_human")),
    }
  } catch {
    return null
  }
}

function mapRoleToGemini(role: "user" | "assistant"): "user" | "model" {
  return role === "assistant" ? "model" : "user"
}

function parseArgsObject(input: any): Record<string, any> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, any>
  }
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, any>
      }
    } catch {
      return {}
    }
  }
  return {}
}

function extractTextFromParts(parts: any[]): string {
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim()
}

function extractToolCallsFromParts(parts: any[]): GeminiToolCall[] {
  const calls: GeminiToolCall[] = []
  for (const part of parts || []) {
    const functionCall = part?.functionCall
    const name = String(functionCall?.name || "").trim()
    if (!name) continue
    calls.push({
      id: functionCall?.id ? String(functionCall.id) : undefined,
      name,
      args: parseArgsObject(functionCall?.args),
    })
  }
  return calls
}

function actionFromToolCall(toolCall: GeminiToolCall): AgentActionPlan {
  const name = String(toolCall.name || "").trim().toLowerCase()
  const args = parseArgsObject(toolCall.args)

  if (name === "schedule_appointment") {
    return {
      type: "schedule_appointment",
      date: args.date ? String(args.date) : undefined,
      time: args.time ? String(args.time) : undefined,
      appointment_mode:
        String(args.appointment_mode || "").toLowerCase() === "online" ? "online" : "presencial",
      customer_name: args.customer_name ? String(args.customer_name) : undefined,
      customer_email: args.customer_email ? String(args.customer_email) : undefined,
      note: args.note ? String(args.note) : undefined,
    }
  }

  if (name === "get_available_slots") {
    return {
      type: "get_available_slots",
      date_from: args.date_from ? String(args.date_from) : undefined,
      date_to: args.date_to ? String(args.date_to) : undefined,
      max_slots:
        args.max_slots !== undefined && Number.isFinite(Number(args.max_slots))
          ? Number(args.max_slots)
          : undefined,
    }
  }

  if (name === "edit_appointment") {
    return {
      type: "edit_appointment",
      appointment_id: args.appointment_id ? String(args.appointment_id) : undefined,
      date: args.date ? String(args.date) : undefined,
      time: args.time ? String(args.time) : undefined,
      old_date: args.old_date ? String(args.old_date) : undefined,
      old_time: args.old_time ? String(args.old_time) : undefined,
      appointment_mode:
        String(args.appointment_mode || "").toLowerCase() === "online" ? "online" : "presencial",
      customer_email: args.customer_email ? String(args.customer_email) : undefined,
      note: args.note ? String(args.note) : undefined,
    }
  }

  if (name === "cancel_appointment") {
    return {
      type: "cancel_appointment",
      appointment_id: args.appointment_id ? String(args.appointment_id) : undefined,
      date: args.date ? String(args.date) : undefined,
      time: args.time ? String(args.time) : undefined,
      note: args.reason ? String(args.reason) : args.note ? String(args.note) : undefined,
    }
  }

  if (name === "create_followup") {
    return {
      type: "create_followup",
      note: args.note ? String(args.note) : undefined,
      minutes_from_now:
        args.minutes_from_now !== undefined && Number.isFinite(Number(args.minutes_from_now))
          ? Number(args.minutes_from_now)
          : undefined,
    }
  }

  if (name === "create_reminder") {
    return {
      type: "create_reminder",
      note: args.note ? String(args.note) : undefined,
      minutes_from_now:
        args.minutes_from_now !== undefined && Number.isFinite(Number(args.minutes_from_now))
          ? Number(args.minutes_from_now)
          : undefined,
    }
  }

  if (name === "handoff_human") {
    return {
      type: "handoff_human",
      note: args.reason ? String(args.reason) : args.note ? String(args.note) : undefined,
    }
  }

  return { type: "none" }
}

function normalizeModelCode(value: string): string {
  const text = String(value || "").trim().toLowerCase()
  if (!text) return ""
  return text.replace(/^models\//, "")
}

function buildUniqueModelList(values: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = normalizeModelCode(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

type ExplicitCacheEntry = {
  name: string
  expiresAt: number
}

type PreparedGeminiPayload = {
  payload: Record<string, any>
  usedCachedContent: boolean
  cacheKey?: string
}

export class GeminiService {
  private readonly apiKey: string
  private readonly model: string
  private static readonly FALLBACK_MODEL = "gemini-2.5-flash"
  private static readonly MODELS_LIST_CACHE_MS = 10 * 60 * 1000
  private static readonly EXPLICIT_CACHE_ENABLED =
    String(process.env.GEMINI_EXPLICIT_CACHE_ENABLED || "true").trim().toLowerCase() !== "false"
  private static readonly EXPLICIT_CACHE_TTL_SECONDS = Math.max(
    300,
    Math.min(86400, Number(process.env.GEMINI_EXPLICIT_CACHE_TTL_SECONDS || 1800) || 1800),
  )
  private static readonly EXPLICIT_CACHE_MIN_SYSTEM_CHARS = Math.max(
    200,
    Math.min(20000, Number(process.env.GEMINI_EXPLICIT_CACHE_MIN_SYSTEM_CHARS || 1200) || 1200),
  )
  private static readonly EXPLICIT_CACHE_COOLDOWN_MS = 5 * 60 * 1000
  private static readonly modelsCache = new Map<string, { expiresAt: number; models: Set<string> }>()
  private static readonly explicitCache = new Map<string, ExplicitCacheEntry>()
  private static readonly explicitCacheCooldown = new Map<string, number>()
  private static readonly MODEL_ALIASES: Record<string, string[]> = {
    "gemini-3.1-pro-preview": ["gemini-3-pro-preview", "gemini-2.5-pro"],
    "gemini-3.1-pro": ["gemini-3-pro-preview", "gemini-2.5-pro"],
    "gemini-3.1-flash-preview": ["gemini-3-flash-preview", "gemini-2.5-flash"],
    "gemini-3.1-flash": ["gemini-3-flash-preview", "gemini-2.5-flash"],
    "gemini-3.1-flash-lite": [
      "gemini-3-flash-preview",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
    ],
  }

  constructor(apiKey: string, model = "gemini-2.5-flash") {
    this.apiKey = String(apiKey || "").trim()
    this.model = String(model || "").trim() || "gemini-2.5-flash"
  }

  private get endpoint(): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`
  }

  private endpointForModel(model: string): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`
  }

  private extractSystemInstructionText(payload: Record<string, any>): string {
    const parts = Array.isArray(payload?.systemInstruction?.parts) ? payload.systemInstruction.parts : []
    return parts
      .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim()
  }

  private payloadHasInlineData(payload: Record<string, any>): boolean {
    const contents = Array.isArray(payload?.contents) ? payload.contents : []
    for (const content of contents) {
      const parts = Array.isArray(content?.parts) ? content.parts : []
      for (const part of parts) {
        if (part?.inlineData || part?.fileData) return true
      }
    }
    return false
  }

  private shouldUseExplicitCache(payload: Record<string, any>, model: string): boolean {
    if (!GeminiService.EXPLICIT_CACHE_ENABLED) return false
    if (!this.apiKey) return false
    if (String(payload?.cachedContent || "").trim()) return false
    if (this.payloadHasInlineData(payload)) return false

    const normalizedModel = normalizeModelCode(model)
    const modelSupportsCache =
      normalizedModel.startsWith("gemini-2.5") ||
      normalizedModel.startsWith("gemini-3")
    if (!modelSupportsCache) return false

    const systemText = this.extractSystemInstructionText(payload)
    if (!systemText) return false
    if (systemText.length < GeminiService.EXPLICIT_CACHE_MIN_SYSTEM_CHARS) return false

    return true
  }

  private buildExplicitCacheKey(model: string, systemText: string): string {
    const normalizedModel = normalizeModelCode(model)
    const fingerprint = createHash("sha256").update(systemText).digest("hex")
    const apiSuffix = this.apiKey.slice(-8) || this.apiKey
    return `${apiSuffix}:${normalizedModel}:${fingerprint}`
  }

  private getCachedContentCreateEndpoint(): string {
    return `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${encodeURIComponent(this.apiKey)}`
  }

  private parseExplicitCacheExpiry(rawExpireTime: any): number {
    const parsed = Date.parse(String(rawExpireTime || ""))
    if (Number.isFinite(parsed) && parsed > Date.now()) {
      return parsed
    }
    return Date.now() + GeminiService.EXPLICIT_CACHE_TTL_SECONDS * 1000
  }

  private async createExplicitCachedContent(
    model: string,
    payload: Record<string, any>,
  ): Promise<ExplicitCacheEntry | null> {
    const normalizedModel = normalizeModelCode(model)
    if (!normalizedModel) return null

    const response = await fetch(this.getCachedContentCreateEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: `models/${normalizedModel}`,
        displayName: `native-agent-${normalizedModel}`,
        systemInstruction: payload.systemInstruction,
        ttl: `${GeminiService.EXPLICIT_CACHE_TTL_SECONDS}s`,
      }),
    })

    const rawText = await response.text()
    let data: any = null
    try {
      data = rawText ? JSON.parse(rawText) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      const errorMessage =
        String(data?.error?.message || rawText || "").trim() || `status_${response.status}`
      console.warn(
        `[gemini][explicit-cache] create failed model=${normalizedModel} status=${response.status} error=${errorMessage.slice(0, 220)}`,
      )
      return null
    }

    const name = String(data?.name || "").trim()
    if (!name) return null

    return {
      name,
      expiresAt: this.parseExplicitCacheExpiry(data?.expireTime),
    }
  }

  private async preparePayloadWithExplicitCache(
    payload: Record<string, any>,
    model: string,
  ): Promise<PreparedGeminiPayload> {
    if (!this.shouldUseExplicitCache(payload, model)) {
      return {
        payload,
        usedCachedContent: false,
      }
    }

    const systemText = this.extractSystemInstructionText(payload)
    const cacheKey = this.buildExplicitCacheKey(model, systemText)
    const now = Date.now()

    const cooldownUntil = GeminiService.explicitCacheCooldown.get(cacheKey)
    if (cooldownUntil && cooldownUntil > now) {
      return {
        payload,
        usedCachedContent: false,
        cacheKey,
      }
    }

    const existing = GeminiService.explicitCache.get(cacheKey)
    let cacheEntry = existing && existing.expiresAt > now ? existing : null

    if (!cacheEntry) {
      const created = await this.createExplicitCachedContent(model, payload)
      if (!created) {
        GeminiService.explicitCacheCooldown.set(
          cacheKey,
          now + GeminiService.EXPLICIT_CACHE_COOLDOWN_MS,
        )
        return {
          payload,
          usedCachedContent: false,
          cacheKey,
        }
      }
      GeminiService.explicitCache.set(cacheKey, created)
      cacheEntry = created
      GeminiService.explicitCacheCooldown.delete(cacheKey)
    }

    const preparedPayload: Record<string, any> = {
      ...payload,
      cachedContent: cacheEntry.name,
    }
    delete preparedPayload.systemInstruction

    return {
      payload: preparedPayload,
      usedCachedContent: true,
      cacheKey,
    }
  }

  private shouldRetryWithoutCachedContent(status: number, data: any, rawText: string): boolean {
    const message = String(data?.error?.message || rawText || "").toLowerCase()
    if (!message) return status === 404
    if (status === 404) return true
    if (status !== 400 && status !== 422) return false

    return (
      message.includes("cachedcontent") ||
      message.includes("cached content") ||
      (
        message.includes("cache") &&
        (
          message.includes("not found") ||
          message.includes("invalid") ||
          message.includes("minimum") ||
          message.includes("too few") ||
          message.includes("small")
        )
      )
    )
  }

  private disableExplicitCache(cacheKey?: string): void {
    if (!cacheKey) return
    GeminiService.explicitCache.delete(cacheKey)
    GeminiService.explicitCacheCooldown.set(cacheKey, Date.now() + GeminiService.EXPLICIT_CACHE_COOLDOWN_MS)
  }

  private logUsageMetadata(data: any, model: string, usedCachedContent: boolean): void {
    const usage = data?.usageMetadata
    if (!usage) return

    const cachedTokenCount = Number(usage?.cachedContentTokenCount ?? 0)
    if (!usedCachedContent && (!Number.isFinite(cachedTokenCount) || cachedTokenCount <= 0)) {
      return
    }

    const totalTokenCount = Number(usage?.totalTokenCount ?? 0)
    const inputTokenCount = Number(usage?.promptTokenCount ?? 0)
    console.log(
      `[gemini][usage] model=${normalizeModelCode(model)} cached_tokens=${Number.isFinite(cachedTokenCount) ? cachedTokenCount : 0} input_tokens=${Number.isFinite(inputTokenCount) ? inputTokenCount : 0} total_tokens=${Number.isFinite(totalTokenCount) ? totalTokenCount : 0}`,
    )
  }

  private shouldRetryWithFallbackModel(status: number, data: any, rawText: string, attemptedModel: string): boolean {
    const errorMessage = String(data?.error?.message || rawText || "").toLowerCase()
    if (!errorMessage) return false
    if (normalizeModelCode(attemptedModel) === GeminiService.FALLBACK_MODEL) return false
    if (status === 404) return true

    return (
      errorMessage.includes("model") &&
      (
        errorMessage.includes("not found") ||
        errorMessage.includes("is not found") ||
        errorMessage.includes("not supported") ||
        errorMessage.includes("unknown model")
      )
    )
  }

  private buildModelCandidates(): string[] {
    const configured = normalizeModelCode(this.model) || GeminiService.FALLBACK_MODEL
    const aliases = GeminiService.MODEL_ALIASES[configured] || []

    return buildUniqueModelList([
      configured,
      ...aliases,
      GeminiService.FALLBACK_MODEL,
      "gemini-2.5-flash-lite",
    ])
  }

  private async listAvailableModels(): Promise<Set<string> | null> {
    if (!this.apiKey) return null

    const cacheKey = this.apiKey.slice(-12) || this.apiKey
    const cached = GeminiService.modelsCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.models
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(this.apiKey)}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      )
      const rawText = await response.text()
      if (!response.ok) return null

      const parsed = rawText ? JSON.parse(rawText) : {}
      const models = new Set<string>()
      for (const item of Array.isArray(parsed?.models) ? parsed.models : []) {
        const name = normalizeModelCode(String(item?.name || item?.model || ""))
        if (!name) continue
        const methods = Array.isArray(item?.supportedGenerationMethods)
          ? item.supportedGenerationMethods.map((method: any) => String(method || "").toLowerCase())
          : []
        if (methods.length === 0 || methods.includes("generatecontent")) {
          models.add(name)
        }
      }

      GeminiService.modelsCache.set(cacheKey, {
        models,
        expiresAt: Date.now() + GeminiService.MODELS_LIST_CACHE_MS,
      })

      return models
    } catch {
      return null
    }
  }

  private async resolveModelExecutionOrder(): Promise<string[]> {
    const candidates = this.buildModelCandidates()
    const available = await this.listAvailableModels()
    if (!available || available.size === 0) {
      return candidates
    }

    const availableCandidates = candidates.filter((candidate) => available.has(candidate))
    if (availableCandidates.length > 0) {
      return availableCandidates
    }

    return candidates
  }

  private async requestGenerateContentWithModel(
    payload: Record<string, any>,
    model: string,
  ): Promise<{ ok: true; data: any } | { ok: false; status: number; data: any; rawText: string }> {
    const prepared = await this.preparePayloadWithExplicitCache(payload, model)

    const executeRequest = async (requestPayload: Record<string, any>) => {
      const response = await fetch(this.endpointForModel(model), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      })

      const rawText = await response.text()
      let data: any = null
      try {
        data = rawText ? JSON.parse(rawText) : null
      } catch {
        data = null
      }

      return { response, rawText, data }
    }

    let attempt = await executeRequest(prepared.payload)
    if (
      !attempt.response.ok &&
      prepared.usedCachedContent &&
      this.shouldRetryWithoutCachedContent(attempt.response.status, attempt.data, attempt.rawText)
    ) {
      this.disableExplicitCache(prepared.cacheKey)
      attempt = await executeRequest(payload)
    }

    if (!attempt.response.ok) {
      return {
        ok: false,
        status: attempt.response.status,
        data: attempt.data,
        rawText: attempt.rawText,
      }
    }

    this.logUsageMetadata(attempt.data || {}, model, prepared.usedCachedContent)
    return {
      ok: true,
      data: attempt.data || {},
    }
  }

  private async requestGenerateContent(payload: Record<string, any>): Promise<any> {
    const orderedModels = await this.resolveModelExecutionOrder()
    let lastError = "Gemini request failed"

    for (const model of orderedModels) {
      const attempt = await this.requestGenerateContentWithModel(payload, model)
      if (attempt.ok) {
        return attempt.data
      }

      lastError =
        attempt.data?.error?.message ||
        attempt.rawText ||
        `Gemini request failed (${attempt.status})`

      if (!this.shouldRetryWithFallbackModel(attempt.status, attempt.data, attempt.rawText, model)) {
        break
      }
    }

    throw new Error(lastError)
  }

  async transcribeAudio(input: {
    audioBase64: string
    mimeType?: string
    prompt?: string
  }): Promise<string> {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY not configured")
    }

    const audioBase64 = String(input.audioBase64 || "").replace(/\s+/g, "").trim()
    if (!audioBase64) {
      throw new Error("audio_base64_missing")
    }

    const mimeType = String(input.mimeType || "").trim() || "audio/ogg"
    const prompt = String(
      input.prompt ||
      "Transcreva fielmente o audio em portugues do Brasil. Retorne apenas a transcricao em texto, sem explicacoes.",
    ).trim()

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: audioBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        topP: 0.95,
      },
    }

    const data = await this.requestGenerateContent(payload)
    const parts = Array.isArray(data?.candidates?.[0]?.content?.parts)
      ? data.candidates[0].content.parts
      : []
    const outputText = extractTextFromParts(parts)
    return String(outputText || "").trim()
  }

  async analyzeMedia(input: GeminiMediaAnalysisInput): Promise<string> {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY not configured")
    }

    const mediaBase64 = String(input.mediaBase64 || "").replace(/\s+/g, "").trim()
    if (!mediaBase64) {
      throw new Error("media_base64_missing")
    }

    const mimeType = String(input.mimeType || "").trim() || "application/octet-stream"
    const mediaType = String(input.mediaType || "").trim().toLowerCase()
    const mediaLabel =
      mediaType === "image"
        ? "imagem"
        : mediaType === "video"
          ? "video"
          : mediaType === "document"
            ? "documento"
            : "arquivo"
    const prompt = String(
      input.prompt ||
        `Analise este ${mediaLabel} enviado no WhatsApp e retorne um resumo curto e objetivo em portugues do Brasil para contexto de atendimento comercial. ` +
          "Inclua apenas o que for observavel no conteudo, sem inventar. Se nao for possivel interpretar, retorne somente: [midia_sem_contexto_legivel].",
    ).trim()

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: mediaBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
      },
    }

    const data = await this.requestGenerateContent(payload)
    const parts = Array.isArray(data?.candidates?.[0]?.content?.parts)
      ? data.candidates[0].content.parts
      : []
    const outputText = extractTextFromParts(parts)
    return String(outputText || "").trim()
  }

  async decideNextTurn(input: {
    systemPrompt: string
    conversation: GeminiConversationMessage[]
    nowIso?: string
    sampling?: GeminiSamplingConfig
  }): Promise<GeminiAgentDecision> {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY not configured")
    }

    const nowIso = input.nowIso || new Date().toISOString()

    const instruction = [
      "Voce e um agente conversacional de WhatsApp para atendimento comercial.",
      "Responda sempre em portugues do Brasil, de forma objetiva e natural.",
      "Considere o historico da conversa.",
      "Se detectar intencao de agendamento, follow-up ou lembrete, adicione acao em `actions`.",
      "Retorne APENAS JSON valido no formato:",
      '{ "reply": "texto", "actions": [{"type":"none"}], "handoff": false }',
      "Tipos de action permitidos: get_available_slots, schedule_appointment, edit_appointment, cancel_appointment, create_followup, create_reminder, handoff_human, none.",
      "Para get_available_slots, sempre envie date_from e date_to cobrindo o periodo pedido e use max_slots >= 100 quando o cliente pedir uma data especifica ou periodo longo — isso evita que dias disponiveis fiquem fora da resposta por limite de slots.",
      "Para schedule_appointment, inclua date (YYYY-MM-DD) e time (HH:mm) quando o lead confirmar.",
      "Para edit_appointment, inclua appointment_id quando disponivel e sempre use essa action quando houver remarcacao, reagendamento ou pedido para mudar data/horario.",
      "Para cancel_appointment, inclua appointment_id quando disponivel ou date/time quando o lead quiser cancelar o horario marcado.",
      "Para create_followup/create_reminder, inclua minutes_from_now.",
      `Data/hora atual: ${nowIso}.`,
    ].join("\n")

    const conversationParts = input.conversation
      .map((message) => `${message.role === "assistant" ? "Assistente" : "Lead"}: ${message.content}`)
      .join("\n")

    const finalPrompt = [
      `PROMPT BASE DA UNIDADE:\n${input.systemPrompt || "(nao informado)"}`,
      "",
      "HISTORICO:",
      conversationParts || "(sem historico)",
      "",
      instruction,
    ].join("\n")

    const payload = {
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      generationConfig: {
        temperature: resolveSamplingValue(input.sampling?.temperature, 0.4, 0, 2),
        topP: resolveSamplingValue(input.sampling?.topP, 0.9, 0, 1),
        topK: Math.floor(resolveSamplingValue(input.sampling?.topK, 40, 1, 100)),
        responseMimeType: "application/json",
      },
    }

    const data = await this.requestGenerateContent(payload)

    const outputText = String(
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("\n") || "",
    ).trim()

    const parsed = safeParseDecision(outputText)
    if (parsed) return parsed

    return {
      reply: outputText || "",
      actions: [{ type: "none" }],
      handoff: false,
    }
  }

  async decideNextTurnWithTools(input: {
    systemPrompt: string
    conversation: GeminiConversationMessage[]
    functionDeclarations: GeminiFunctionDeclaration[]
    onToolCall: (toolCall: GeminiToolCall) => Promise<GeminiToolHandlerResult>
    maxSteps?: number
    sampling?: GeminiSamplingConfig
  }): Promise<GeminiToolDecision> {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY not configured")
    }

    const contents: any[] = input.conversation.map((message) => ({
      role: mapRoleToGemini(message.role),
      parts: [{ text: String(message.content || "").trim() }],
    }))
    if (!contents.length) {
      contents.push({
        role: "user",
        parts: [{ text: "Inicie atendimento." }],
      })
    }

    const maxSteps = Math.max(1, Math.min(8, Number(input.maxSteps || 4)))
    const allCalls: GeminiToolCall[] = []
    const executions: GeminiToolExecution[] = []
    let latestText = ""

    for (let step = 0; step < maxSteps; step++) {
      const payload: Record<string, any> = {
        contents,
        systemInstruction: {
          parts: [{ text: String(input.systemPrompt || "").trim() }],
        },
        generationConfig: {
          temperature: resolveSamplingValue(input.sampling?.temperature, 0.4, 0, 2),
          topP: resolveSamplingValue(input.sampling?.topP, 0.9, 0, 1),
          topK: Math.floor(resolveSamplingValue(input.sampling?.topK, 40, 1, 100)),
        },
      }

      if (Array.isArray(input.functionDeclarations) && input.functionDeclarations.length > 0) {
        payload.tools = [
          {
            functionDeclarations: input.functionDeclarations,
          },
        ]
        payload.toolConfig = {
          functionCallingConfig: {
            mode: "AUTO",
          },
        }
      }

      const data = await this.requestGenerateContent(payload)
      const content = data?.candidates?.[0]?.content || {}
      const parts = Array.isArray(content?.parts) ? content.parts : []

      if (parts.length > 0) {
        contents.push({
          role: String(content?.role || "model"),
          parts,
        })
      }

      const outputText = extractTextFromParts(parts)
      if (outputText) {
        latestText = outputText
      }

      const toolCalls = extractToolCallsFromParts(parts)
      if (!toolCalls.length) {
        break
      }

      for (const toolCall of toolCalls) {
        allCalls.push(toolCall)
        const defaultAction = actionFromToolCall(toolCall)

        let execution: GeminiToolExecution
        try {
          const handled = await input.onToolCall(toolCall)
          const ok = Boolean(handled?.ok)
          const responsePayload = handled?.response && typeof handled.response === "object"
            ? handled.response
            : ok
              ? { ok: true }
              : { ok: false, error: handled?.error || "tool_execution_failed" }

          execution = {
            call: toolCall,
            action: handled?.action || defaultAction,
            ok,
            response: responsePayload,
            error: handled?.error,
          }
        } catch (error: any) {
          execution = {
            call: toolCall,
            action: defaultAction,
            ok: false,
            response: {
              ok: false,
              error: error?.message || "tool_execution_failed",
            },
            error: error?.message || "tool_execution_failed",
          }
        }

        executions.push(execution)
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: toolCall.name,
                id: toolCall.id,
                response: execution.response,
              },
            },
          ],
        })
      }
    }

    const actions = executions.length > 0
      ? executions.map((e) => e.action)
      : [{ type: "none" as const }]
    const handoff = actions.some((action) => action.type === "handoff_human")

    return {
      reply: latestText || "",
      actions,
      handoff,
      toolCalls: allCalls,
      executions,
    }
  }
}
