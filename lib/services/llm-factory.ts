import { NativeAgentConfig } from "../helpers/native-agent-config";
import { LLMService } from "./llm.interface";
import { GeminiService } from "./gemini.service";
import { OpenAIService } from "./openai.service";
import { AnthropicService } from "./anthropic.service";
import { GroqService } from "./groq.service";
import { OpenRouterService } from "./openrouter.service";
import { VertexAIService } from "./vertexai.service";
import { VertexWithGoogleFallbackService } from "./vertex-with-google-fallback.service";

type LLMFactoryContext = {
    tenant?: string;
};

export class LLMFactory {
    static getService(config: NativeAgentConfig, context?: LLMFactoryContext): LLMService {
        const provider = LLMFactory.resolveEffectiveProvider(config, context);

        switch (provider) {
            case "vertexai": {
                return LLMFactory.buildVertexService(config);
            }

            case "openai": {
                const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || "";
                const model = config.openaiModel || "gpt-4o";
                if (!apiKey) {
                    console.warn(`[LLMFactory] OpenAI selected but no API key found. Falling back to Gemini.`);
                    return LLMFactory.buildGeminiService(config);
                }
                console.log(`[LLMFactory] Using OpenAI provider model=${model}`);
                return new OpenAIService(apiKey, model);
            }

            case "anthropic": {
                const apiKey = config.anthropicApiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || "";
                const model = config.anthropicModel || "claude-sonnet-4-20250514";
                if (!apiKey) {
                    console.warn(`[LLMFactory] Anthropic selected but no API key found. Falling back to Gemini.`);
                    return LLMFactory.buildGeminiService(config);
                }
                console.log(`[LLMFactory] Using Anthropic provider model=${model}`);
                return new AnthropicService(apiKey, model);
            }

            case "groq": {
                const apiKey = config.groqApiKey || process.env.GROQ_API_KEY || "";
                const model = config.groqModel || "llama3-70b-8192";
                if (!apiKey) {
                    console.warn(`[LLMFactory] Groq selected but no API key found. Falling back to Gemini.`);
                    return LLMFactory.buildGeminiService(config);
                }
                console.log(`[LLMFactory] Using Groq provider model=${model}`);
                return new GroqService(apiKey, model);
            }

            case "openrouter": {
                const apiKey = config.openRouterApiKey || process.env.OPENROUTER_API_KEY || "";
                const model = config.openRouterModel || "google/gemini-2.5-flash";
                if (!apiKey) {
                    console.warn(`[LLMFactory] OpenRouter selected but no API key found. Falling back to Gemini.`);
                    return LLMFactory.buildGeminiService(config);
                }
                console.log(`[LLMFactory] Using OpenRouter provider model=${model}`);
                return new OpenRouterService(apiKey, model);
            }

            case "google":
            default: {
                return LLMFactory.buildGeminiService(config);
            }
        }
    }

    private static buildGeminiService(config: NativeAgentConfig): GeminiService {
        const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY || "";
        const model = config.geminiModel || "gemini-2.5-flash";
        console.log(`[LLMFactory] Using Google Gemini provider model=${model}`);
        return new GeminiService(apiKey, model);
    }

    private static buildVertexService(config: NativeAgentConfig): LLMService {
        const projectId =
            process.env.VERTEX_PROJECT_ID ||
            process.env.GOOGLE_CLOUD_PROJECT ||
            process.env.GCLOUD_PROJECT ||
            "";
        const location = process.env.VERTEX_LOCATION || "us-central1";
        const model = process.env.VERTEX_MODEL || config.geminiModel || "gemini-2.5-flash";
        const geminiFallback = LLMFactory.buildGeminiService(config);

        if (!projectId) {
            console.warn(
                `[LLMFactory] Vertex selected but VERTEX_PROJECT_ID is missing. Falling back to Gemini.`,
            );
            return geminiFallback;
        }

        console.log(
            `[LLMFactory] Using Google Vertex AI provider model=${model} project=${projectId} location=${location}`,
        );
        const vertex = new VertexAIService(projectId, location, model);
        return new VertexWithGoogleFallbackService(vertex, geminiFallback);
    }

    private static parseCsvList(value: string): string[] {
        return String(value || "")
            .split(/[,\n;]+/g)
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean);
    }

    private static parseBoolean(value: string | undefined): boolean {
        const normalized = String(value || "")
            .trim()
            .toLowerCase();
        return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
    }

    private static parseBooleanWithDefault(value: string | undefined, fallback: boolean): boolean {
        if (value === undefined || value === null || String(value).trim() === "") return fallback;
        return LLMFactory.parseBoolean(value);
    }

    private static shouldForceVertexForAllTenants(): boolean {
        // Default habilitado: todos os tenants usam Vertex, com fallback automático para Gemini.
        return LLMFactory.parseBooleanWithDefault(process.env.VERTEX_GLOBAL_ENABLED, true);
    }

    private static resolveEffectiveProvider(
        config: NativeAgentConfig,
        context?: LLMFactoryContext,
    ): string {
        const configured = String(config.aiProvider || "google").toLowerCase().trim();
        if (configured === "vertexai") return "vertexai";
        if (LLMFactory.shouldForceVertexForAllTenants()) return "vertexai";

        const tenant = String(context?.tenant || "")
            .trim()
            .toLowerCase();
        if (!tenant) return configured;

        const vertexTestEnabled = LLMFactory.parseBoolean(process.env.VERTEX_TEST_MODE_ENABLED);
        if (!vertexTestEnabled) return configured;

        const allowedTenants = new Set(
            LLMFactory.parseCsvList(process.env.VERTEX_TEST_TENANTS || ""),
        );
        if (!allowedTenants.has(tenant)) return configured;

        return "vertexai";
    }

    static getFallbackService(config: NativeAgentConfig): LLMService | null {
        // Tenta Anthropic Claude 3.5 Haiku
        const anthropicKey = config.anthropicApiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || "";
        if (anthropicKey) {
            console.log(`[LLMFactory] Using Fallback: Anthropic Claude 3.5 Haiku`);
            return new AnthropicService(anthropicKey, "claude-3-5-haiku-20241022");
        }

        // Tenta OpenAI GPT-4o-mini
        const openaiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || "";
        if (openaiKey) {
            console.log(`[LLMFactory] Using Fallback: OpenAI GPT-4o-mini`);
            return new OpenAIService(openaiKey, "gpt-4o-mini");
        }

        // Tenta Groq Llama 3
        const groqKey = config.groqApiKey || process.env.GROQ_API_KEY || "";
        if (groqKey) {
            console.log(`[LLMFactory] Using Fallback: Groq Llama 3 70B`);
            return new GroqService(groqKey, "llama3-70b-8192");
        }

        return null;
    }
}
