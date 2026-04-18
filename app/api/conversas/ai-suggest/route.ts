import { NextResponse } from "next/server"
import { resolveTenant } from "@/lib/helpers/resolve-tenant"
import { getNativeAgentConfigForTenant, type NativeAgentConfig } from "@/lib/helpers/native-agent-config"
import { LLMFactory } from "@/lib/services/llm-factory"
import type { GeminiConversationMessage } from "@/lib/services/gemini.service"

type SuggestMessageInput = {
  role?: "user" | "bot"
  content?: string
  senderType?: "lead" | "ia" | "human" | "system"
  fromMe?: boolean
  isManual?: boolean
}

type SuggestRequestBody = {
  sessionId?: string
  contactName?: string
  messages?: SuggestMessageInput[]
  previousSuggestion?: string
  variantIndex?: number
}

function normalizeComparableMessage(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function stripMarkdownFormatting(text: string): string {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, "$1 ($2)")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-*\u2022]+|\d+[.)])\s+/gm, "")
    .replace(/[*_~]+/g, "")
}

function stripHyphensAndDashes(text: string): string {
  return String(text || "")
    .replace(/[\u2010-\u2015-]+/g, " ")
    .replace(/\s{2,}/g, " ")
}

function stripEmojis(text: string): string {
  return String(text || "")
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, "")
    .replace(/\s{2,}/g, " ")
}

function applyAssistantOutputPolicy(value: string, allowEmojis: boolean): string {
  let normalized = String(value || "").trim()
  if (!normalized) return ""

  normalized = stripMarkdownFormatting(normalized)
  normalized = stripHyphensAndDashes(normalized)
  if (!allowEmojis) normalized = stripEmojis(normalized)

  const paragraphs = normalized
    .replace(/\r/g, "")
    .split(/\n{2,}/g)
    .map((part) => part.replace(/\n+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)

  const deduped: string[] = []
  const seen = new Set<string>()
  for (const paragraph of paragraphs) {
    const key = normalizeComparableMessage(paragraph)
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(paragraph)
  }

  return deduped.join("\n\n").trim()
}

function normalizeSenderType(message: SuggestMessageInput): "lead" | "ia" | "human" | "system" {
  const explicit = String(message.senderType || "").toLowerCase().trim()
  if (explicit === "lead" || explicit === "ia" || explicit === "human" || explicit === "system") {
    return explicit
  }

  if (message.isManual) return "human"
  if (message.fromMe === false) return "lead"
  if (message.fromMe === true && message.role === "user") return "human"
  return message.role === "user" ? "lead" : "ia"
}

function toConversation(messages: SuggestMessageInput[]): GeminiConversationMessage[] {
  return messages
    .map((message) => {
      const content = String(message.content || "").trim()
      if (!content) return null

      const senderType = normalizeSenderType(message)
      if (senderType === "system") return null

      return {
        role: senderType === "lead" ? ("user" as const) : ("assistant" as const),
        content,
      }
    })
    .filter(Boolean)
    .slice(-60) as GeminiConversationMessage[]
}

function resolveProviderAndModel(config: NativeAgentConfig): { provider: string; model: string } {
  const provider = String(config.aiProvider || "google").toLowerCase().trim()
  if (provider === "openai") return { provider, model: config.openaiModel || "gpt-4o" }
  if (provider === "anthropic") return { provider, model: config.anthropicModel || "claude-sonnet-4-20250514" }
  if (provider === "groq") return { provider, model: config.groqModel || "llama3-70b-8192" }
  if (provider === "openrouter") return { provider, model: config.openRouterModel || "google/gemini-2.5-flash" }
  return { provider: "google", model: config.geminiModel || "gemini-2.5-flash" }
}

function validateProviderCredentials(config: NativeAgentConfig): string | null {
  const provider = String(config.aiProvider || "google").toLowerCase().trim()
  if (provider === "openai") return config.openaiApiKey ? null : "openai_api_key_missing"
  if (provider === "anthropic") return config.anthropicApiKey ? null : "anthropic_api_key_missing"
  if (provider === "groq") return config.groqApiKey ? null : "groq_api_key_missing"
  if (provider === "openrouter") return config.openRouterApiKey ? null : "openrouter_api_key_missing"
  return config.geminiApiKey ? null : "gemini_api_key_missing"
}

function buildSystemPrompt(input: {
  config: NativeAgentConfig
  sessionId?: string
  contactName?: string
  tenant: string
  previousSuggestion?: string
  variantIndex?: number
}): string {
  const promptBase = String(input.config.promptBase || "").trim()
  const assistantIdentity = promptBase || "Voce e uma atendente comercial consultiva via WhatsApp."
  const previousSuggestion = String(input.previousSuggestion || "").trim()
  const variantIndex = Number(input.variantIndex || 0)

  const alternativeRule = previousSuggestion
    ? [
        "GERACAO ALTERNATIVA: gere uma versao diferente da sugestao anterior, mantendo o mesmo contexto e objetivo.",
        "Nao repita a mesma estrutura de frases. Troque abordagem e formulacao.",
        `Sugestao anterior: ${previousSuggestion.slice(0, 900)}`,
        `Indice de variante solicitado: ${Number.isFinite(variantIndex) && variantIndex > 0 ? variantIndex : 1}`,
      ].join("\n")
    : ""

  return [
    assistantIdentity,
    "MODO OPERACIONAL: voce esta gerando uma sugestao para um atendente humano enviar agora.",
    "Use o contexto da conversa inteira e responda somente ao que o lead precisa neste momento.",
    "Priorize resposta objetiva, contextual e assertiva, sem inventar fatos.",
    "Escreva em portugues do Brasil.",
    "Nao use markdown, lista, bullets, numeracao, prefixos tecnicos nem texto com hifens.",
    "Se nao houver resposta necessaria agora, responda exatamente: [SEM_RESPOSTA]",
    alternativeRule,
    `TENANT: ${input.tenant}`,
    `SESSAO: ${String(input.sessionId || "").trim() || "desconhecida"}`,
    `LEAD: ${String(input.contactName || "").trim() || "nao identificado"}`,
  ]
    .filter(Boolean)
    .join("\n")
}

export async function POST(req: Request) {
  try {
    const tenant = await resolveTenant(req)
    const body = (await req.json().catch(() => ({}))) as SuggestRequestBody

    const messages = Array.isArray(body.messages) ? body.messages : []
    if (messages.length === 0) {
      return NextResponse.json({ error: "messages_is_required" }, { status: 400 })
    }

    const conversation = toConversation(messages)
    if (conversation.length === 0) {
      return NextResponse.json({ error: "messages_without_content" }, { status: 400 })
    }

    const config = await getNativeAgentConfigForTenant(tenant)
    if (!config) {
      return NextResponse.json(
        {
          error: "native_agent_config_missing",
        },
        { status: 400 },
      )
    }
    const credentialError = validateProviderCredentials(config)
    if (credentialError) {
      return NextResponse.json(
        {
          error: "provider_credentials_missing",
          code: credentialError,
        },
        { status: 400 },
      )
    }

    const llm = LLMFactory.getService(config)
    const previousSuggestion = String(body.previousSuggestion || "").trim()
    const variantIndex = Number(body.variantIndex || 0)
    const systemPrompt = buildSystemPrompt({
      config,
      tenant,
      sessionId: body.sessionId,
      contactName: body.contactName,
      previousSuggestion,
      variantIndex,
    })

    const requestConversation = [...conversation]
    if (previousSuggestion) {
      requestConversation.push({
        role: "user",
        content:
          "Quero uma alternativa diferente da sugestao anterior, sem repetir texto, mantendo contexto e assertividade.",
      })
    }

    const decision = await llm.decideNextTurn({
      systemPrompt,
      conversation: requestConversation,
      nowIso: new Date().toISOString(),
    })

    const rawReply = String(decision?.reply || "").trim()
    if (!rawReply || rawReply === "[SEM_RESPOSTA]") {
      const modelInfo = resolveProviderAndModel(config)
      return NextResponse.json({
        success: true,
        reply: "",
        provider: modelInfo.provider,
        model: modelInfo.model,
      })
    }

    const reply = applyAssistantOutputPolicy(rawReply, config.moderateEmojiEnabled !== false)
    const modelInfo = resolveProviderAndModel(config)

    return NextResponse.json({
      success: true,
      reply,
      provider: modelInfo.provider,
      model: modelInfo.model,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || "ai_suggest_failed",
      },
      { status: 500 },
    )
  }
}
