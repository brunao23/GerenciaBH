import { LLMService } from "./llm.interface";
import {
    GeminiConversationMessage,
    GeminiAgentDecision,
    GeminiFunctionDeclaration,
    GeminiToolCall,
    GeminiToolHandlerResult,
    GeminiToolDecision,
    GeminiToolExecution,
    AgentActionPlan,
} from "./gemini.service";

export class OpenRouterService implements LLMService {
    private readonly apiKey: string;
    private readonly model: string;

    constructor(apiKey: string, model = "google/gemini-2.5-flash") {
        this.apiKey = String(apiKey || "").trim();
        this.model = String(model || "").trim() || "google/gemini-2.5-flash";
    }

    private async requestOpenRouter(payload: Record<string, any>): Promise<any> {
        if (!this.apiKey) {
            throw new Error("OpenRouter API key not configured");
        }

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`,
                "HTTP-Referer": "https://gerenciabh.com.br",
                "X-Title": "GerencIA by Genial Labs",
            },
            body: JSON.stringify(payload),
        });

        const rawText = await response.text();
        let data: any = null;
        try {
            data = rawText ? JSON.parse(rawText) : null;
        } catch {
            data = null;
        }

        if (!response.ok) {
            const errorMsg = data?.error?.message || rawText || `OpenRouter error: ${response.status}`;
            console.error(`[OpenRouter] Request failed: status=${response.status} model=${this.model} error=${errorMsg}`);
            throw new Error(errorMsg);
        }

        return data;
    }

    async decideNextTurn(input: {
        systemPrompt: string;
        conversation: GeminiConversationMessage[];
        nowIso?: string;
    }): Promise<GeminiAgentDecision> {
        const messages: any[] = [
            { role: "system", content: input.systemPrompt },
            ...input.conversation.map(m => ({
                role: m.role === "assistant" ? "assistant" : "user",
                content: m.content,
            })),
        ];

        const payload = {
            model: this.model,
            messages,
            temperature: 0.4,
            max_tokens: 4096,
        };

        const data = await this.requestOpenRouter(payload);
        const text = String(data?.choices?.[0]?.message?.content || "").trim();

        if (!text) {
            console.warn(`[OpenRouter] Empty response model=${this.model}`);
            return {
                reply: "",
                actions: [{ type: "none" }],
                handoff: false,
            };
        }

        // Try to parse JSON response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    reply: parsed.reply || text,
                    actions: Array.isArray(parsed.actions) ? parsed.actions : [{ type: "none" }],
                    handoff: parsed.handoff || false,
                };
            } catch {
                // Not valid JSON, return raw text
            }
        }

        return {
            reply: text,
            actions: [{ type: "none" }],
            handoff: false,
        };
    }

    async decideNextTurnWithTools(input: {
        systemPrompt: string;
        conversation: GeminiConversationMessage[];
        functionDeclarations: GeminiFunctionDeclaration[];
        onToolCall: (toolCall: GeminiToolCall) => Promise<GeminiToolHandlerResult>;
        maxSteps?: number;
    }): Promise<GeminiToolDecision> {
        const tools = input.functionDeclarations.map(fd => ({
            type: "function" as const,
            function: {
                name: fd.name,
                description: fd.description,
                parameters: fd.parameters || { type: "object", properties: {} },
            },
        }));

        let messages: any[] = [
            { role: "system", content: input.systemPrompt },
            ...input.conversation.map(m => ({
                role: m.role === "assistant" ? "assistant" : "user",
                content: m.content,
            })),
        ];

        const maxSteps = Math.max(1, Math.min(8, Number(input.maxSteps || 4)));
        const allCalls: GeminiToolCall[] = [];
        const executions: GeminiToolExecution[] = [];
        let finalReply = "";

        for (let step = 0; step < maxSteps; step++) {
            const payload: Record<string, any> = {
                model: this.model,
                messages,
                temperature: 0.4,
                max_tokens: 4096,
            };

            if (tools.length > 0) {
                payload.tools = tools;
                payload.tool_choice = "auto";
            }

            const data = await this.requestOpenRouter(payload);
            const responseMessage = data?.choices?.[0]?.message;

            if (!responseMessage) {
                console.warn(`[OpenRouter] No response message step=${step} model=${this.model}`);
                break;
            }

            messages.push(responseMessage);

            if (responseMessage.content) {
                finalReply = String(responseMessage.content).trim();
            }

            const toolCalls = responseMessage.tool_calls;
            if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
                break;
            }

            for (const tc of toolCalls) {
                let parsedArgs: Record<string, any> = {};
                try {
                    parsedArgs = JSON.parse(tc.function?.arguments || "{}");
                } catch {
                    parsedArgs = {};
                }

                const toolCall: GeminiToolCall = {
                    id: tc.id,
                    name: tc.function?.name || "",
                    args: parsedArgs,
                };
                allCalls.push(toolCall);

                let execution: GeminiToolExecution;
                try {
                    const result = await input.onToolCall(toolCall);
                    const ok = Boolean(result?.ok);
                    const responsePayload = result?.response && typeof result.response === "object"
                        ? result.response
                        : ok
                            ? { ok: true }
                            : { ok: false, error: result?.error || "tool_execution_failed" };

                    execution = {
                        call: toolCall,
                        action: result?.action || { type: "none" as AgentActionPlan["type"] },
                        ok,
                        response: responsePayload,
                        error: result?.error,
                    };
                } catch (error: any) {
                    execution = {
                        call: toolCall,
                        action: { type: "none" as AgentActionPlan["type"] },
                        ok: false,
                        response: { ok: false, error: error?.message || "tool_execution_failed" },
                        error: error?.message || "tool_execution_failed",
                    };
                }

                executions.push(execution);

                messages.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    content: JSON.stringify(execution.response),
                });
            }
        }

        const actions: AgentActionPlan[] = executions.length > 0
            ? executions.map(e => e.action)
            : [{ type: "none" as AgentActionPlan["type"] }];

        return {
            reply: finalReply,
            actions,
            handoff: actions.some(a => a.type === "handoff_human"),
            toolCalls: allCalls,
            executions,
        };
    }
}
