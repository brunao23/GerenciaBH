import { AgentActionPlan, GeminiAgentDecision, GeminiConversationMessage, GeminiFunctionDeclaration, GeminiToolCall, GeminiToolDecision, GeminiToolExecution, GeminiToolHandlerResult } from "./gemini.service";

export interface LLMSamplingConfig {
  temperature?: number
  topP?: number
  topK?: number
}

export interface LLMService {
  decideNextTurn(input: {
    systemPrompt: string;
    conversation: GeminiConversationMessage[];
    nowIso?: string;
    sampling?: LLMSamplingConfig;
  }): Promise<GeminiAgentDecision>;

  decideNextTurnWithTools(input: {
    systemPrompt: string;
    conversation: GeminiConversationMessage[];
    functionDeclarations: GeminiFunctionDeclaration[];
    onToolCall: (toolCall: GeminiToolCall) => Promise<GeminiToolHandlerResult>;
    maxSteps?: number;
    sampling?: LLMSamplingConfig;
  }): Promise<GeminiToolDecision>;

  transcribeAudio?(input: {
    audioBase64: string;
    mimeType?: string;
    prompt?: string;
  }): Promise<string>;
}
