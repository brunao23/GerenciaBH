import { LLMService } from "./llm.interface"
import {
  GeminiAgentDecision,
  GeminiConversationMessage,
  GeminiFunctionDeclaration,
  GeminiMediaAnalysisInput,
  GeminiToolCall,
  GeminiToolDecision,
  GeminiToolHandlerResult,
} from "./gemini.service"

export class VertexWithGoogleFallbackService implements LLMService {
  private readonly fallbacks: Array<{
    service: LLMService
    provider?: string
    model?: string
  }>

  constructor(
    private readonly primary: LLMService,
    fallback: LLMService | Array<{ service: LLMService; provider?: string; model?: string }>,
    private readonly metadata: {
      primaryProvider?: string
      primaryModel?: string
      fallbackProvider?: string
      fallbackModel?: string
    } = {},
  ) {
    this.fallbacks = Array.isArray(fallback)
      ? fallback
      : [
          {
            service: fallback,
            provider: metadata.fallbackProvider,
            model: metadata.fallbackModel,
          },
        ]
  }

  private annotateDecision<T extends Record<string, any>>(
    decision: T,
    runtime: { provider?: string; model?: string; fallbackUsed: boolean; fallbackReason?: string },
  ): T {
    if (!decision || typeof decision !== "object") return decision
    return {
      ...decision,
      agent_runtime_provider: runtime.provider || null,
      agent_runtime_model: runtime.model || null,
      agent_runtime_fallback_used: runtime.fallbackUsed,
      agent_runtime_fallback_reason: runtime.fallbackReason || null,
      agent_runtime_primary_provider: this.metadata.primaryProvider || null,
      agent_runtime_primary_model: this.metadata.primaryModel || null,
      agent_runtime_fallback_provider: this.metadata.fallbackProvider || null,
      agent_runtime_fallback_model: this.metadata.fallbackModel || null,
    }
  }

  async decideNextTurn(input: {
    systemPrompt: string
    conversation: GeminiConversationMessage[]
    nowIso?: string
    sampling?: { temperature?: number; topP?: number; topK?: number }
  }): Promise<GeminiAgentDecision> {
    try {
      const decision = await this.primary.decideNextTurn(input)
      return this.annotateDecision(decision as any, {
        provider: this.metadata.primaryProvider,
        model: this.metadata.primaryModel,
        fallbackUsed: false,
      })
    } catch (error: any) {
      const reason = String(error?.message || error || "unknown")
      console.warn(
        `[LLMFactory] Vertex failed on decideNextTurn. Trying fallback chain. reason=${reason}`,
      )
      let lastFallbackError: any = null
      for (const fallback of this.fallbacks) {
        try {
          const decision = await fallback.service.decideNextTurn(input)
          return this.annotateDecision(decision as any, {
            provider: fallback.provider || this.metadata.fallbackProvider,
            model: fallback.model || this.metadata.fallbackModel,
            fallbackUsed: true,
            fallbackReason: reason.slice(0, 300),
          })
        } catch (fallbackError: any) {
          lastFallbackError = fallbackError
          console.warn(
            `[LLMFactory] Fallback failed on decideNextTurn provider=${fallback.provider || "unknown"} reason=${String(fallbackError?.message || fallbackError || "unknown").slice(0, 300)}`,
          )
        }
      }
      throw lastFallbackError || error
    }
  }

  async decideNextTurnWithTools(input: {
    systemPrompt: string
    conversation: GeminiConversationMessage[]
    functionDeclarations: GeminiFunctionDeclaration[]
    onToolCall: (toolCall: GeminiToolCall) => Promise<GeminiToolHandlerResult>
    maxSteps?: number
    sampling?: { temperature?: number; topP?: number; topK?: number }
  }): Promise<GeminiToolDecision> {
    try {
      const decision = await this.primary.decideNextTurnWithTools(input)
      return this.annotateDecision(decision as any, {
        provider: this.metadata.primaryProvider,
        model: this.metadata.primaryModel,
        fallbackUsed: false,
      })
    } catch (error: any) {
      const reason = String(error?.message || error || "unknown")
      console.warn(
        `[LLMFactory] Vertex failed on decideNextTurnWithTools. Trying fallback chain. reason=${reason}`,
      )
      let lastFallbackError: any = null
      for (const fallback of this.fallbacks) {
        try {
          const decision = await fallback.service.decideNextTurnWithTools(input)
          return this.annotateDecision(decision as any, {
            provider: fallback.provider || this.metadata.fallbackProvider,
            model: fallback.model || this.metadata.fallbackModel,
            fallbackUsed: true,
            fallbackReason: reason.slice(0, 300),
          })
        } catch (fallbackError: any) {
          lastFallbackError = fallbackError
          console.warn(
            `[LLMFactory] Fallback failed on decideNextTurnWithTools provider=${fallback.provider || "unknown"} reason=${String(fallbackError?.message || fallbackError || "unknown").slice(0, 300)}`,
          )
        }
      }
      throw lastFallbackError || error
    }
  }

  async transcribeAudio(input: {
    audioBase64: string
    mimeType?: string
    prompt?: string
  }): Promise<string> {
    const primary = this.primary as any

    if (typeof primary?.transcribeAudio === "function") {
      try {
        return await primary.transcribeAudio(input)
      } catch (error: any) {
        console.warn(
          `[LLMFactory] Vertex failed on transcribeAudio. Falling back to Gemini. reason=${String(error?.message || error || "unknown")}`,
        )
      }
    }

    let lastFallbackError: any = null
    for (const fallbackInfo of this.fallbacks) {
      const fallback = fallbackInfo.service as any
      if (typeof fallback?.transcribeAudio !== "function") continue
      try {
        return await fallback.transcribeAudio(input)
      } catch (error: any) {
        lastFallbackError = error
        console.warn(
          `[LLMFactory] Fallback failed on transcribeAudio provider=${fallbackInfo.provider || "unknown"} reason=${String(error?.message || error || "unknown").slice(0, 300)}`,
        )
      }
    }

    if (lastFallbackError) throw lastFallbackError
    throw new Error("Audio transcription is not available on the configured services")
  }

  async analyzeMedia(input: GeminiMediaAnalysisInput): Promise<string> {
    const primary = this.primary as any

    if (typeof primary?.analyzeMedia === "function") {
      try {
        return await primary.analyzeMedia(input)
      } catch (error: any) {
        console.warn(
          `[LLMFactory] Vertex failed on analyzeMedia. Falling back to Gemini. reason=${String(error?.message || error || "unknown")}`,
        )
      }
    }

    let lastFallbackError: any = null
    for (const fallbackInfo of this.fallbacks) {
      const fallback = fallbackInfo.service as any
      if (typeof fallback?.analyzeMedia !== "function") continue
      try {
        return await fallback.analyzeMedia(input)
      } catch (error: any) {
        lastFallbackError = error
        console.warn(
          `[LLMFactory] Fallback failed on analyzeMedia provider=${fallbackInfo.provider || "unknown"} reason=${String(error?.message || error || "unknown").slice(0, 300)}`,
        )
      }
    }

    if (lastFallbackError) throw lastFallbackError
    throw new Error("Media analysis is not available on the configured services")
  }
}
