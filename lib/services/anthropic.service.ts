import { LLMService, LLMSamplingConfig } from "./llm.interface";
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

export class AnthropicService implements LLMService {
    private readonly apiKey: string;
    private readonly model: string;

    constructor(apiKey: string, model = "claude-sonnet-4-20250514") {
        this.apiKey = String(apiKey || "").trim();
        this.model = String(model || "").trim() || "claude-sonnet-4-20250514";
    }

    private resolveSamplingValue(value: any, fallback: number, min: number, max: number): number {
        const numeric = Number(value)
        if (!Number.isFinite(numeric)) return fallback
        if (numeric < min) return min
        if (numeric > max) return max
        return numeric
    }

    private async requestAnthropic(payload: Record<string, any>): Promise<any> {
        if (!this.apiKey) {
            throw new Error("Anthropic API key not configured");
        }

        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": this.apiKey,
                "anthropic-version": "2023-06-01",
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
            const errorMsg = data?.error?.message || rawText || `Anthropic error: ${response.status}`;
            console.error(`[Anthropic] Request failed: status=${response.status} model=${this.model} error=${errorMsg}`);
            throw new Error(errorMsg);
        }

        return data;
    }

    private ensureAlternatingRoles(messages: any[]): any[] {
        // Anthropic requires alternating user/assistant roles.
        // Merge consecutive messages of the same role.
        if (messages.length <= 1) return messages;

        const merged: any[] = [messages[0]];
        for (let i = 1; i < messages.length; i++) {
            const prev = merged[merged.length - 1];
            const curr = messages[i];
            if (prev.role === curr.role) {
                // Merge content
                if (typeof prev.content === "string" && typeof curr.content === "string") {
                    prev.content = `${prev.content}\n\n${curr.content}`;
                } else if (Array.isArray(prev.content) && Array.isArray(curr.content)) {
                    prev.content = [...prev.content, ...curr.content];
                } else if (typeof prev.content === "string" && Array.isArray(curr.content)) {
                    prev.content = [{ type: "text", text: prev.content }, ...curr.content];
                } else if (Array.isArray(prev.content) && typeof curr.content === "string") {
                    prev.content = [...prev.content, { type: "text", text: curr.content }];
                }
            } else {
                merged.push(curr);
            }
        }
        return merged;
    }

    async decideNextTurn(input: {
        systemPrompt: string;
        conversation: GeminiConversationMessage[];
        nowIso?: string;
        sampling?: LLMSamplingConfig;
    }): Promise<GeminiAgentDecision> {
        let messages = input.conversation.map(m => ({
            role: m.role === "assistant" ? "assistant" as const : "user" as const,
            content: m.content,
        }));

        // Ensure first message is from user (Anthropic requirement)
        if (messages.length === 0 || messages[0].role !== "user") {
            messages = [{ role: "user" as const, content: "Inicie atendimento." }, ...messages];
        }

        messages = this.ensureAlternatingRoles(messages);

        const payload = {
            model: this.model,
            max_tokens: 4096,
            system: input.systemPrompt,
            messages,
            temperature: this.resolveSamplingValue(input.sampling?.temperature, 0.4, 0, 1),
            top_p: this.resolveSamplingValue(input.sampling?.topP, 0.9, 0, 1),
            top_k: Math.floor(this.resolveSamplingValue(input.sampling?.topK, 40, 1, 100)),
        };

        const data = await this.requestAnthropic(payload);
        const content = Array.isArray(data?.content) ? data.content : [];
        const textPart = content.find((c: any) => c.type === "text");
        const text = String(textPart?.text || "").trim();

        if (!text) {
            console.warn(`[Anthropic] Empty response model=${this.model}`);
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
        sampling?: LLMSamplingConfig;
    }): Promise<GeminiToolDecision> {
        const tools = input.functionDeclarations.map(fd => ({
            name: fd.name,
            description: fd.description,
            input_schema: fd.parameters || { type: "object", properties: {} },
        }));

        let messages: any[] = input.conversation.map(m => ({
            role: m.role === "assistant" ? "assistant" as const : "user" as const,
            content: m.content,
        }));

        // Ensure first message is from user (Anthropic requirement)
        if (messages.length === 0 || messages[0].role !== "user") {
            messages = [{ role: "user" as const, content: "Inicie atendimento." }, ...messages];
        }

        messages = this.ensureAlternatingRoles(messages);

        const maxSteps = Math.max(1, Math.min(8, Number(input.maxSteps || 4)));
        const allCalls: GeminiToolCall[] = [];
        const executions: GeminiToolExecution[] = [];
        let finalReply = "";

        for (let step = 0; step < maxSteps; step++) {
            const payload: Record<string, any> = {
                model: this.model,
                max_tokens: 4096,
                system: input.systemPrompt,
                messages,
                temperature: this.resolveSamplingValue(input.sampling?.temperature, 0.4, 0, 1),
                top_p: this.resolveSamplingValue(input.sampling?.topP, 0.9, 0, 1),
                top_k: Math.floor(this.resolveSamplingValue(input.sampling?.topK, 40, 1, 100)),
            };

            if (tools.length > 0) {
                payload.tools = tools;
            }

            const data = await this.requestAnthropic(payload);
            const content = Array.isArray(data?.content) ? data.content : [];

            if (content.length === 0) {
                console.warn(`[Anthropic] Empty content step=${step} model=${this.model}`);
                break;
            }

            // Add response to message history
            messages.push({ role: "assistant", content });

            const textPart = content.find((c: any) => c.type === "text");
            if (textPart?.text) {
                finalReply = String(textPart.text).trim();
            }

            const toolUseParts = content.filter((c: any) => c.type === "tool_use");
            if (toolUseParts.length === 0) {
                break;
            }

            const toolResults: any[] = [];
            for (const part of toolUseParts) {
                const toolCall: GeminiToolCall = {
                    id: part.id,
                    name: part.name || "",
                    args: part.input && typeof part.input === "object" ? part.input : {},
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

                toolResults.push({
                    type: "tool_result",
                    tool_use_id: part.id,
                    content: JSON.stringify(execution.response),
                });
            }

            messages.push({ role: "user", content: toolResults });
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
