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
  constructor(
    private readonly primary: LLMService,
    private readonly fallback: LLMService,
  ) {}

  async decideNextTurn(input: {
    systemPrompt: string
    conversation: GeminiConversationMessage[]
    nowIso?: string
    sampling?: { temperature?: number; topP?: number; topK?: number }
  }): Promise<GeminiAgentDecision> {
    try {
      return await this.primary.decideNextTurn(input)
    } catch (error: any) {
      console.warn(
        `[LLMFactory] Vertex failed on decideNextTurn. Falling back to Gemini. reason=${String(error?.message || error || "unknown")}`,
      )
      return this.fallback.decideNextTurn(input)
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
      return await this.primary.decideNextTurnWithTools(input)
    } catch (error: any) {
      console.warn(
        `[LLMFactory] Vertex failed on decideNextTurnWithTools. Falling back to Gemini. reason=${String(error?.message || error || "unknown")}`,
      )
      return this.fallback.decideNextTurnWithTools(input)
    }
  }

  async transcribeAudio(input: {
    audioBase64: string
    mimeType?: string
    prompt?: string
  }): Promise<string> {
    const primary = this.primary as any
    const fallback = this.fallback as any

    if (typeof primary?.transcribeAudio === "function") {
      try {
        return await primary.transcribeAudio(input)
      } catch (error: any) {
        console.warn(
          `[LLMFactory] Vertex failed on transcribeAudio. Falling back to Gemini. reason=${String(error?.message || error || "unknown")}`,
        )
      }
    }

    if (typeof fallback?.transcribeAudio === "function") {
      return fallback.transcribeAudio(input)
    }

    throw new Error("Audio transcription is not available on the configured services")
  }

  async analyzeMedia(input: GeminiMediaAnalysisInput): Promise<string> {
    const primary = this.primary as any
    const fallback = this.fallback as any

    if (typeof primary?.analyzeMedia === "function") {
      try {
        return await primary.analyzeMedia(input)
      } catch (error: any) {
        console.warn(
          `[LLMFactory] Vertex failed on analyzeMedia. Falling back to Gemini. reason=${String(error?.message || error || "unknown")}`,
        )
      }
    }

    if (typeof fallback?.analyzeMedia === "function") {
      return fallback.analyzeMedia(input)
    }

    throw new Error("Media analysis is not available on the configured services")
  }
}
