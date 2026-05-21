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

export type LLMEffectiveModelInfo = {
    requestedProvider: string;
    requestedModel: string;
    effectiveProvider: string;
    effectiveModel: string;
    primaryProvider: string;
    primaryModel: string;
    fallbackProvider?: string;
    fallbackModel?: string;
    vertexGlobalEnabled: boolean;
    vertexProjectConfigured: boolean;
    vertexEnvModel?: string;
};

type LLMFallbackInfo = {
    service: LLMService;
    provider: string;
    model: string;
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
                const model = LLMFactory.resolveGroqModel(config);
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
        const apiKey = LLMFactory.resolveGeminiApiKey(config);
        const model = LLMFactory.resolveGeminiModel(config);
        console.log(`[LLMFactory] Using Google Gemini provider model=${model}`);
        return new GeminiService(apiKey, model);
    }

    private static resolveGeminiApiKey(config: NativeAgentConfig): string {
        return String(
            config.geminiApiKey ||
                process.env.GEMINI_API_KEY ||
                process.env.GOOGLE_API_KEY ||
                "",
        ).trim();
    }

    private static buildVertexService(config: NativeAgentConfig): LLMService {
        const projectId =
            process.env.VERTEX_PROJECT_ID ||
            process.env.GOOGLE_CLOUD_PROJECT ||
            process.env.GCLOUD_PROJECT ||
            "";
        const model = LLMFactory.resolveVertexModel(config);
        const location = LLMFactory.resolveVertexLocation(model);
        const fallbacks = LLMFactory.resolveVertexFallbackServices(config);
        const primaryFallback = fallbacks[0] || null;

        if (!projectId) {
            console.warn(
                `[LLMFactory] Vertex selected but VERTEX_PROJECT_ID is missing. Falling back to ${primaryFallback?.provider || "none"}.`,
            );
            if (primaryFallback) return primaryFallback.service;
            return LLMFactory.buildGeminiService(config);
        }

        console.log(
            `[LLMFactory] Using Google Vertex AI provider model=${model} project=${projectId} location=${location}`,
        );
        const vertex = new VertexAIService(projectId, location, model);
        if (fallbacks.length === 0) {
            console.warn("[LLMFactory] Vertex selected without configured fallback provider.");
            return vertex;
        }
        return new VertexWithGoogleFallbackService(vertex, fallbacks, {
            primaryProvider: "vertexai",
            primaryModel: model,
            fallbackProvider: primaryFallback?.provider,
            fallbackModel: primaryFallback?.model,
        });
    }

    private static resolveVertexFallbackServices(config: NativeAgentConfig): LLMFallbackInfo[] {
        const fallbacks: LLMFallbackInfo[] = [];
        const geminiKey = LLMFactory.resolveGeminiApiKey(config);
        if (geminiKey) {
            const model = LLMFactory.resolveGeminiModel(config);
            console.log(`[LLMFactory] Using Vertex fallback: Google Gemini model=${model}`);
            fallbacks.push({
                service: new GeminiService(geminiKey, model),
                provider: "google",
                model,
            });
        }

        const anthropicKey = config.anthropicApiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || "";
        if (anthropicKey) {
            const model = "claude-3-5-haiku-20241022";
            console.log(`[LLMFactory] Using Vertex fallback: Anthropic model=${model}`);
            fallbacks.push({
                service: new AnthropicService(anthropicKey, model),
                provider: "anthropic",
                model,
            });
        }

        const openaiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || "";
        if (openaiKey) {
            const model = "gpt-4o-mini";
            console.log(`[LLMFactory] Using Vertex fallback: OpenAI model=${model}`);
            fallbacks.push({
                service: new OpenAIService(openaiKey, model),
                provider: "openai",
                model,
            });
        }

        const groqKey = config.groqApiKey || process.env.GROQ_API_KEY || "";
        if (groqKey) {
            const model = LLMFactory.resolveGroqModel(config);
            console.log(`[LLMFactory] Using Vertex fallback: Groq model=${model}`);
            fallbacks.push({
                service: new GroqService(groqKey, model),
                provider: "groq",
                model,
            });
        }

        const openRouterKey = config.openRouterApiKey || process.env.OPENROUTER_API_KEY || "";
        if (openRouterKey) {
            const model = config.openRouterModel || "google/gemini-2.5-flash";
            console.log(`[LLMFactory] Using Vertex fallback: OpenRouter model=${model}`);
            fallbacks.push({
                service: new OpenRouterService(openRouterKey, model),
                provider: "openrouter",
                model,
            });
        }

        return fallbacks;
    }

    static describeEffectiveModel(
        config: NativeAgentConfig,
        context?: LLMFactoryContext,
    ): LLMEffectiveModelInfo {
        const requestedProvider = String(config.aiProvider || "google").trim().toLowerCase() || "google";
        const requestedModel = LLMFactory.resolveConfiguredModel(config, requestedProvider);
        const effectiveProvider = LLMFactory.resolveEffectiveProvider(config, context);
        const vertexProjectConfigured = Boolean(
            process.env.VERTEX_PROJECT_ID ||
                process.env.GOOGLE_CLOUD_PROJECT ||
                process.env.GCLOUD_PROJECT,
        );

        if (effectiveProvider === "vertexai") {
            const primaryModel = LLMFactory.resolveVertexModel(config);
            const fallbackInfo = LLMFactory.resolveVertexFallbackInfo(config);
            return {
                requestedProvider,
                requestedModel,
                effectiveProvider: vertexProjectConfigured ? "vertexai" : "google",
                effectiveModel: vertexProjectConfigured ? primaryModel : fallbackInfo?.model || LLMFactory.resolveGeminiModel(config),
                primaryProvider: vertexProjectConfigured ? "vertexai" : fallbackInfo?.provider || "google",
                primaryModel: vertexProjectConfigured ? primaryModel : fallbackInfo?.model || LLMFactory.resolveGeminiModel(config),
                fallbackProvider: vertexProjectConfigured ? fallbackInfo?.provider : undefined,
                fallbackModel: vertexProjectConfigured ? fallbackInfo?.model : undefined,
                vertexGlobalEnabled: LLMFactory.shouldForceVertexForAllTenants(),
                vertexProjectConfigured,
                vertexEnvModel: String(process.env.VERTEX_MODEL || "").trim() || undefined,
            };
        }

        return {
            requestedProvider,
            requestedModel,
            effectiveProvider,
            effectiveModel: LLMFactory.resolveConfiguredModel(config, effectiveProvider),
            primaryProvider: effectiveProvider,
            primaryModel: LLMFactory.resolveConfiguredModel(config, effectiveProvider),
            vertexGlobalEnabled: LLMFactory.shouldForceVertexForAllTenants(),
            vertexProjectConfigured,
            vertexEnvModel: String(process.env.VERTEX_MODEL || "").trim() || undefined,
        };
    }

    private static resolveGeminiModel(config: NativeAgentConfig): string {
        return String(config.geminiModel || process.env.GEMINI_MODEL || "gemini-3.5-flash").trim() || "gemini-3.5-flash";
    }

    private static resolveGroqModel(config: NativeAgentConfig): string {
        const requested = String(config.groqModel || "llama-3.3-70b-versatile").trim();
        const aliases: Record<string, string> = {
            "llama3-70b-8192": "llama-3.3-70b-versatile",
            "llama3-8b-8192": "llama-3.1-8b-instant",
        };
        return aliases[requested.toLowerCase()] || requested || "llama-3.3-70b-versatile";
    }

    private static resolveVertexModel(config: NativeAgentConfig): string {
        // VERTEX_MODEL is the production override for all tenants when Vertex is forced globally.
        const requested = (
            String(process.env.VERTEX_MODEL || "").trim() ||
            String(config.geminiModel || "").trim() ||
            "gemini-3.5-flash"
        );
        return LLMFactory.normalizeVertexModelForExecution(requested);
    }

    private static resolveVertexFallbackInfo(config: NativeAgentConfig): { provider: string; model: string } | null {
        if (LLMFactory.resolveGeminiApiKey(config)) {
            return { provider: "google", model: LLMFactory.resolveGeminiModel(config) };
        }
        if (config.anthropicApiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY) {
            return { provider: "anthropic", model: "claude-3-5-haiku-20241022" };
        }
        if (config.openaiApiKey || process.env.OPENAI_API_KEY) {
            return { provider: "openai", model: "gpt-4o-mini" };
        }
        if (config.groqApiKey || process.env.GROQ_API_KEY) {
            return { provider: "groq", model: LLMFactory.resolveGroqModel(config) };
        }
        if (config.openRouterApiKey || process.env.OPENROUTER_API_KEY) {
            return { provider: "openrouter", model: config.openRouterModel || "google/gemini-2.5-flash" };
        }
        return null;
    }

    private static normalizeVertexModelForExecution(model: string): string {
        const requested = String(model || "").trim();
        const normalized = requested.toLowerCase();
        const aliases: Record<string, string> = {
            "gemini-3.1-flash": "gemini-3-flash-preview",
            "gemini-3.1-flash-preview": "gemini-3-flash-preview",
            "gemini-3.1-flash-lite": "gemini-3-flash-preview",
            "gemini-3.1-pro": "gemini-3-pro-preview",
            "gemini-3.1-pro-preview": "gemini-3-pro-preview",
        };
        return aliases[normalized] || requested || "gemini-3.5-flash";
    }

    private static resolveVertexLocation(model: string): string {
        const configured = String(process.env.VERTEX_LOCATION || "").trim();
        const normalizedModel = String(model || "").trim().toLowerCase();
        const requiresGlobalOrMultiRegionEndpoint =
            normalizedModel === "gemini-3.5-flash" ||
            normalizedModel === "gemini-3-flash-preview" ||
            normalizedModel === "gemini-3-pro-preview";
        const normalizedLocation = configured.toLowerCase();
        const isSupportedGemini3Location =
            normalizedLocation === "global" ||
            normalizedLocation === "us" ||
            normalizedLocation === "eu";

        if (requiresGlobalOrMultiRegionEndpoint) {
            if (configured && !isSupportedGemini3Location) {
                console.warn(
                    `[LLMFactory] Vertex model=${model} requires location global/us/eu. Ignoring VERTEX_LOCATION=${configured}.`,
                );
                return "global";
            }
            return configured || "global";
        }

        return configured || "us-central1";
    }

    private static resolveConfiguredModel(config: NativeAgentConfig, provider: string): string {
        const normalized = String(provider || "google").trim().toLowerCase();
        if (normalized === "openai") return String(config.openaiModel || "gpt-4o").trim() || "gpt-4o";
        if (normalized === "anthropic") {
            return String(config.anthropicModel || "claude-sonnet-4-20250514").trim() || "claude-sonnet-4-20250514";
        }
        if (normalized === "groq") return LLMFactory.resolveGroqModel(config);
        if (normalized === "openrouter") {
            return String(config.openRouterModel || "google/gemini-2.5-flash").trim() || "google/gemini-2.5-flash";
        }
        if (normalized === "vertexai") return LLMFactory.resolveVertexModel(config);
        return LLMFactory.resolveGeminiModel(config);
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
            const model = LLMFactory.resolveGroqModel(config);
            console.log(`[LLMFactory] Using Fallback: Groq model=${model}`);
            return new GroqService(groqKey, model);
        }

        return null;
    }
}
