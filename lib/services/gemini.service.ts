export interface GeminiConversationMessage {
  role: "user" | "assistant"
  content: string
}

export interface AgentActionPlan {
  type:
    | "get_available_slots"
    | "schedule_appointment"
    | "edit_appointment"
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

export class GeminiService {
  private readonly apiKey: string
  private readonly model: string

  constructor(apiKey: string, model = "gemini-2.5-flash") {
    this.apiKey = String(apiKey || "").trim()
    this.model = String(model || "").trim() || "gemini-2.5-flash"
  }

  private get endpoint(): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`
  }

  private async requestGenerateContent(payload: Record<string, any>): Promise<any> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const rawText = await response.text()
    let data: any = null
    try {
      data = rawText ? JSON.parse(rawText) : null
    } catch {
      data = null
    }

    if (!response.ok) {
      const err = data?.error?.message || rawText || `Gemini request failed (${response.status})`
      throw new Error(err)
    }
    return data || {}
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

  async decideNextTurn(input: {
    systemPrompt: string
    conversation: GeminiConversationMessage[]
    nowIso?: string
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
      "Tipos de action permitidos: get_available_slots, schedule_appointment, edit_appointment, create_followup, create_reminder, handoff_human, none.",
      "Para get_available_slots, voce pode enviar date_from/date_to e max_slots.",
      "Para schedule_appointment, inclua date (YYYY-MM-DD) e time (HH:mm) quando o lead confirmar.",
      "Para edit_appointment, inclua appointment_id quando disponivel e os novos date/time.",
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
        temperature: 0.4,
        topP: 0.9,
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
      reply:
        outputText ||
        "Ola! Como posso te ajudar hoje?",
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
          temperature: 0.4,
          topP: 0.9,
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
      reply:
        latestText ||
        "Ola! Como posso te ajudar hoje?",
      actions,
      handoff,
      toolCalls: allCalls,
      executions,
    }
  }
}
