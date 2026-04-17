import { AgentActionPlan, GeminiAgentDecision, GeminiConversationMessage, GeminiFunctionDeclaration, GeminiToolCall, GeminiToolDecision, GeminiToolExecution, GeminiToolHandlerResult } from "./gemini.service";

export interface LLMService {
  decideNextTurn(input: {
    systemPrompt: string;
    conversation: GeminiConversationMessage[];
    nowIso?: string;
  }): Promise<GeminiAgentDecision>;

  decideNextTurnWithTools(input: {
    systemPrompt: string;
    conversation: GeminiConversationMessage[];
    functionDeclarations: GeminiFunctionDeclaration[];
    onToolCall: (toolCall: GeminiToolCall) => Promise<GeminiToolHandlerResult>;
    maxSteps?: number;
  }): Promise<GeminiToolDecision>;

  transcribeAudio?(input: {
    audioBase64: string;
    mimeType?: string;
    prompt?: string;
  }): Promise<string>;
}
