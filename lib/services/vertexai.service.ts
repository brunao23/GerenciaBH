import {
  FunctionDeclarationSchemaType,
  VertexAI,
} from "@google-cloud/vertexai"
import { LLMService } from "./llm.interface"
import {
  AgentActionPlan,
  GeminiAgentDecision,
  GeminiConversationMessage,
  GeminiFunctionDeclaration,
  GeminiMediaAnalysisInput,
  GeminiToolCall,
  GeminiToolDecision,
  GeminiToolExecution,
  GeminiToolHandlerResult,
  LLMUsageMetrics,
} from "./gemini.service"

type VertexSamplingConfig = {
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
          String(action?.appointment_mode || "").toLowerCase() === "online"
            ? "online"
            : "presencial",
        appointment_id: action?.appointment_id
          ? String(action.appointment_id)
          : undefined,
        customer_name: action?.customer_name
          ? String(action.customer_name)
          : undefined,
        customer_email: action?.customer_email
          ? String(action.customer_email)
          : undefined,
        old_date: action?.old_date ? String(action.old_date) : undefined,
        old_time: action?.old_time ? String(action.old_time) : undefined,
        date_from: action?.date_from ? String(action.date_from) : undefined,
        date_to: action?.date_to ? String(action.date_to) : undefined,
        max_slots:
          action?.max_slots !== undefined &&
          Number.isFinite(Number(action.max_slots))
            ? Number(action.max_slots)
            : undefined,
        note: action?.note ? String(action.note) : undefined,
        minutes_from_now:
          action?.minutes_from_now !== undefined &&
          Number.isFinite(Number(action.minutes_from_now))
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
      handoff: Boolean(
        parsed?.handoff || actions.some((action) => action.type === "handoff_human"),
      ),
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
  return (parts || [])
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
        String(args.appointment_mode || "").toLowerCase() === "online"
          ? "online"
          : "presencial",
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
        String(args.appointment_mode || "").toLowerCase() === "online"
          ? "online"
          : "presencial",
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
        args.minutes_from_now !== undefined &&
        Number.isFinite(Number(args.minutes_from_now))
          ? Number(args.minutes_from_now)
          : undefined,
    }
  }

  if (name === "create_reminder") {
    return {
      type: "create_reminder",
      note: args.note ? String(args.note) : undefined,
      minutes_from_now:
        args.minutes_from_now !== undefined &&
        Number.isFinite(Number(args.minutes_from_now))
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

function toSafeTokenInt(value: any): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.max(0, Math.floor(numeric))
}

function readVertexCredentialString(value: any): string {
  return String(value || "").trim()
}

function resolveVertexGoogleAuthOptions(projectId: string): Record<string, any> | undefined {
  const clientEmail = readVertexCredentialString(
    process.env.VERTEX_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  )
  const privateKeyRaw = readVertexCredentialString(
    process.env.VERTEX_SERVICE_ACCOUNT_PRIVATE_KEY ||
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  )

  if (!clientEmail || !privateKeyRaw) return undefined

  const privateKey = privateKeyRaw.includes("\\n")
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : privateKeyRaw

  return {
    projectId,
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  }
}

function extractUsageMetrics(data: any, fallbackModel: string): LLMUsageMetrics {
  const usage = data?.usageMetadata || {}
  const modelVersion = String(data?.modelVersion || "").trim()
  const model = modelVersion || fallbackModel

  const inputTokens = toSafeTokenInt(usage?.promptTokenCount)
  const outputTokens = toSafeTokenInt(usage?.candidatesTokenCount)
  const totalTokensRaw = toSafeTokenInt(usage?.totalTokenCount)
  const totalTokens = totalTokensRaw > 0 ? totalTokensRaw : inputTokens + outputTokens

  return {
    provider: "vertexai",
    model: model || fallbackModel || "gemini-2.5-flash",
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens: toSafeTokenInt(usage?.cachedContentTokenCount),
    raw: usage && typeof usage === "object" ? usage : undefined,
  }
}

function accumulateUsageMetrics(
  base: LLMUsageMetrics | null,
  incoming: LLMUsageMetrics,
): LLMUsageMetrics {
  if (!base) return { ...incoming }
  return {
    provider: incoming.provider || base.provider || "vertexai",
    model: incoming.model || base.model || "",
    inputTokens: toSafeTokenInt(base.inputTokens) + toSafeTokenInt(incoming.inputTokens),
    outputTokens: toSafeTokenInt(base.outputTokens) + toSafeTokenInt(incoming.outputTokens),
    totalTokens: toSafeTokenInt(base.totalTokens) + toSafeTokenInt(incoming.totalTokens),
    cachedInputTokens:
      toSafeTokenInt(base.cachedInputTokens) + toSafeTokenInt(incoming.cachedInputTokens),
    raw: incoming.raw || base.raw,
  }
}

function normalizeSchemaType(input: any): any {
  const value = String(input || "").trim().toUpperCase()
  if (!value) return undefined
  if (value === "OBJECT") return FunctionDeclarationSchemaType.OBJECT
  if (value === "STRING") return FunctionDeclarationSchemaType.STRING
  if (value === "NUMBER") return FunctionDeclarationSchemaType.NUMBER
  if (value === "INTEGER") return FunctionDeclarationSchemaType.INTEGER
  if (value === "BOOLEAN") return FunctionDeclarationSchemaType.BOOLEAN
  if (value === "ARRAY") return FunctionDeclarationSchemaType.ARRAY
  return undefined
}

function normalizeSchema(input: any): any {
  if (!input || typeof input !== "object") return input
  if (Array.isArray(input)) return input.map((item) => normalizeSchema(item))

  const next: Record<string, any> = {}
  for (const [key, value] of Object.entries(input)) {
    if (key === "type") {
      next.type = normalizeSchemaType(value) || value
      continue
    }
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      const props: Record<string, any> = {}
      for (const [propName, propSchema] of Object.entries(value)) {
        props[propName] = normalizeSchema(propSchema)
      }
      next.properties = props
      continue
    }
    if (key === "items") {
      next.items = normalizeSchema(value)
      continue
    }
    next[key] = normalizeSchema(value)
  }
  return next
}

function normalizeFunctionDeclarations(
  declarations: GeminiFunctionDeclaration[],
): Array<{ functionDeclarations: any[] }> {
  if (!Array.isArray(declarations) || declarations.length === 0) return []

  return [
    {
      functionDeclarations: declarations.map((declaration) => ({
        name: String(declaration.name || "").trim(),
        description: String(declaration.description || "").trim(),
        parameters: normalizeSchema(declaration.parameters || {
          type: FunctionDeclarationSchemaType.OBJECT,
          properties: {},
        }),
      })),
    },
  ]
}

export class VertexAIService implements LLMService {
  private readonly projectId: string
  private readonly location: string
  private readonly model: string
  private readonly modelClient: any

  constructor(projectId: string, location = "us-central1", model = "gemini-2.5-flash") {
    this.projectId = String(projectId || "").trim()
    this.location = String(location || "").trim() || "us-central1"
    this.model = String(model || "").trim() || "gemini-2.5-flash"

    if (!this.projectId) {
      throw new Error("VERTEX_PROJECT_ID not configured")
    }

    const googleAuthOptions = resolveVertexGoogleAuthOptions(this.projectId)

    const vertex = new VertexAI({
      project: this.projectId,
      location: this.location,
      googleAuthOptions,
    })

    this.modelClient = vertex.getGenerativeModel({
      model: this.model,
    })
  }

  private async generateContent(request: Record<string, any>): Promise<any> {
    const result = await this.modelClient.generateContent(request)
    const response = await Promise.resolve((result as any)?.response ?? result)
    return response || {}
  }

  async transcribeAudio(input: {
    audioBase64: string
    mimeType?: string
    prompt?: string
  }): Promise<string> {
    const audioBase64 = String(input.audioBase64 || "").replace(/\s+/g, "").trim()
    if (!audioBase64) {
      throw new Error("audio_base64_missing")
    }

    const mimeType = String(input.mimeType || "").trim() || "audio/ogg"
    const prompt = String(
      input.prompt ||
        "Transcreva fielmente o audio em portugues do Brasil. Retorne apenas a transcricao em texto, sem explicacoes.",
    ).trim()

    const data = await this.generateContent({
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
    })

    const parts = Array.isArray(data?.candidates?.[0]?.content?.parts)
      ? data.candidates[0].content.parts
      : []
    return extractTextFromParts(parts)
  }

  async analyzeMedia(input: GeminiMediaAnalysisInput): Promise<string> {
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

    const data = await this.generateContent({
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
    })

    const parts = Array.isArray(data?.candidates?.[0]?.content?.parts)
      ? data.candidates[0].content.parts
      : []
    return extractTextFromParts(parts)
  }

  async decideNextTurn(input: {
    systemPrompt: string
    conversation: GeminiConversationMessage[]
    nowIso?: string
    sampling?: VertexSamplingConfig
  }): Promise<GeminiAgentDecision> {
    const nowIso = input.nowIso || new Date().toISOString()
    const instruction = [
      "Voce e um agente conversacional de WhatsApp para atendimento comercial.",
      "Responda sempre em portugues do Brasil, de forma objetiva e natural.",
      "Considere o historico da conversa.",
      "Se detectar intencao de agendamento, follow-up ou lembrete, adicione acao em `actions`.",
      "Retorne APENAS JSON valido no formato:",
      '{ "reply": "texto", "actions": [{"type":"none"}], "handoff": false }',
      "Tipos de action permitidos: get_available_slots, schedule_appointment, edit_appointment, cancel_appointment, create_followup, create_reminder, handoff_human, none.",
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

    const data = await this.generateContent({
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      generationConfig: {
        temperature: resolveSamplingValue(input.sampling?.temperature, 0.4, 0, 2),
        topP: resolveSamplingValue(input.sampling?.topP, 0.9, 0, 1),
        topK: Math.floor(resolveSamplingValue(input.sampling?.topK, 40, 1, 100)),
        responseMimeType: "application/json",
      },
    })

    const usage = extractUsageMetrics(data, this.model)
    const outputText = String(
      data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join("\n") || "",
    ).trim()

    const parsed = safeParseDecision(outputText)
    if (parsed) return { ...parsed, usage }

    return {
      reply: outputText || "",
      actions: [{ type: "none" }],
      handoff: false,
      usage,
    }
  }

  async decideNextTurnWithTools(input: {
    systemPrompt: string
    conversation: GeminiConversationMessage[]
    functionDeclarations: GeminiFunctionDeclaration[]
    onToolCall: (toolCall: GeminiToolCall) => Promise<GeminiToolHandlerResult>
    maxSteps?: number
    sampling?: VertexSamplingConfig
  }): Promise<GeminiToolDecision> {
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

    const tools = normalizeFunctionDeclarations(input.functionDeclarations || [])
    const maxSteps = Math.max(1, Math.min(8, Number(input.maxSteps || 4)))
    const allCalls: GeminiToolCall[] = []
    const executions: GeminiToolExecution[] = []
    let latestText = ""
    let usageAggregate: LLMUsageMetrics | null = null

    for (let step = 0; step < maxSteps; step++) {
      const request: Record<string, any> = {
        contents,
        systemInstruction: {
          role: "system",
          parts: [{ text: String(input.systemPrompt || "").trim() }],
        },
        generationConfig: {
          temperature: resolveSamplingValue(input.sampling?.temperature, 0.4, 0, 2),
          topP: resolveSamplingValue(input.sampling?.topP, 0.9, 0, 1),
          topK: Math.floor(resolveSamplingValue(input.sampling?.topK, 40, 1, 100)),
        },
      }

      if (tools.length > 0) {
        request.tools = tools
      }

      const data = await this.generateContent(request)
      usageAggregate = accumulateUsageMetrics(
        usageAggregate,
        extractUsageMetrics(data, this.model),
      )
      const content = data?.candidates?.[0]?.content || {}
      const parts = Array.isArray(content?.parts) ? content.parts : []

      if (parts.length > 0) {
        contents.push({
          role: String(content?.role || "model"),
          parts,
        })
      }

      const outputText = extractTextFromParts(parts)
      if (outputText) latestText = outputText

      const toolCalls = extractToolCallsFromParts(parts)
      if (!toolCalls.length) break

      for (const toolCall of toolCalls) {
        allCalls.push(toolCall)
        const defaultAction = actionFromToolCall(toolCall)

        let execution: GeminiToolExecution
        try {
          const handled = await input.onToolCall(toolCall)
          const ok = Boolean(handled?.ok)
          const responsePayload =
            handled?.response && typeof handled.response === "object"
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
                response: execution.response,
              },
            },
          ],
        })
      }
    }

    const actions = executions.length > 0
      ? executions.map((execution) => execution.action)
      : [{ type: "none" as const }]
    const handoff = actions.some((action) => action.type === "handoff_human")

    return {
      reply: latestText || "",
      actions,
      handoff,
      toolCalls: allCalls,
      executions,
      usage: usageAggregate || undefined,
    }
  }
}
