import { NativeAgentConfig } from "../helpers/native-agent-config";
import { LLMService } from "./llm.interface";
import { GeminiService } from "./gemini.service";
import { OpenAIService } from "./openai.service";
import { AnthropicService } from "./anthropic.service";
import { GroqService } from "./groq.service";
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
                console.warn("[LLMFactory] OpenRouter is disabled in this project. Using Google Gemini instead.");
                return LLMFactory.buildGeminiService(config);
            }

            case "google":
            default: {
                return LLMFactory.buildGeminiService(config);
            }
        }
    }

    private static buildGeminiService(config: NativeAgentConfig, options?: { envOnly?: boolean }): GeminiService {
        const apiKey = LLMFactory.resolveGeminiApiKey(config, options);
        const model = LLMFactory.resolveGeminiModel(config);
        console.log(`[LLMFactory] Using Google Gemini provider model=${model}`);
        return new GeminiService(apiKey, model);
    }

    private static resolveGeminiApiKey(config: NativeAgentConfig, options?: { envOnly?: boolean }): string {
        return LLMFactory.resolveGeminiApiKeys(config, options)[0] || "";
    }

    private static splitCredentialList(value: any): string[] {
        return String(value || "")
            .split(/[\n,;]+/g)
            .map((item) => item.trim())
            .filter(Boolean);
    }

    private static resolveGeminiApiKeys(config: NativeAgentConfig, options?: { envOnly?: boolean }): string[] {
        return Array.from(
            new Set(
                [
                    ...LLMFactory.splitCredentialList(process.env.GEMINI_API_KEY),
                    ...LLMFactory.splitCredentialList(process.env.GOOGLE_API_KEY),
                    ...LLMFactory.splitCredentialList(process.env.GEMINI_API_KEY_FALLBACK),
                    ...LLMFactory.splitCredentialList(process.env.GOOGLE_API_KEY_FALLBACK),
                    ...LLMFactory.splitCredentialList(process.env.GEMINI_API_KEYS),
                    ...(options?.envOnly ? [] : LLMFactory.splitCredentialList(config.geminiApiKey)),
                ].filter(Boolean),
            ),
        );
    }

    private static readCredentialString(value: any): string {
        let text = String(value || "").replace(/^\uFEFF/, "").trim();
        if (!text) return "";

        const first = text[0];
        const last = text[text.length - 1];
        if ((first === `"` && last === `"`) || (first === `'` && last === `'`)) {
            text = text.slice(1, -1).trim();
        }

        return text.includes("\\n") ? text.replace(/\\n/g, "\n").trim() : text;
    }

    private static parseServiceAccountJson(raw: any): Record<string, any> | null {
        const text = LLMFactory.readCredentialString(raw);
        if (!text) return null;

        try {
            const parsed = JSON.parse(text);
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch {
            return null;
        }
    }

    private static parseServiceAccountBase64(raw: any): Record<string, any> | null {
        const text = LLMFactory.readCredentialString(raw);
        if (!text) return null;

        try {
            return LLMFactory.parseServiceAccountJson(Buffer.from(text, "base64").toString("utf8"));
        } catch {
            return null;
        }
    }

    private static resolveVertexProjectId(): string {
        const configured = String(
            process.env.VERTEX_PROJECT_ID ||
                process.env.GOOGLE_CLOUD_PROJECT ||
                process.env.GCLOUD_PROJECT ||
                "",
        ).trim();
        if (configured) return configured;

        const serviceAccount =
            LLMFactory.parseServiceAccountBase64(
                process.env.VERTEX_SERVICE_ACCOUNT_JSON_BASE64 ||
                    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64,
            ) ||
            LLMFactory.parseServiceAccountJson(
                process.env.VERTEX_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
            );

        return String(serviceAccount?.project_id || "").trim();
    }

    private static buildVertexService(config: NativeAgentConfig): LLMService {
        const projectId = LLMFactory.resolveVertexProjectId();
        const model = LLMFactory.resolveVertexModel(config);
        const location = LLMFactory.resolveVertexLocation(model);
        const fallbacks = LLMFactory.resolveVertexFallbackServices(config);
        const primaryFallback = fallbacks[0] || null;

        if (!projectId) {
            console.warn(
                `[LLMFactory] Vertex selected but VERTEX_PROJECT_ID is missing. Falling back to ${primaryFallback?.provider || "none"}.`,
            );
            if (primaryFallback) return primaryFallback.service;
            return LLMFactory.buildGeminiService(config, { envOnly: true });
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
        const geminiKeys = LLMFactory.resolveGeminiApiKeys(config, { envOnly: true });
        for (const [index, geminiKey] of geminiKeys.entries()) {
            const model = LLMFactory.resolveGeminiModel(config);
            console.log(`[LLMFactory] Using Vertex fallback ${index + 1}/${geminiKeys.length}: Google Gemini model=${model}`);
            fallbacks.push({
                service: new GeminiService(geminiKey, model),
                provider: "google",
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
        const vertexProjectConfigured = Boolean(LLMFactory.resolveVertexProjectId());

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
        if (LLMFactory.resolveGeminiApiKey(config, { envOnly: true })) {
            return { provider: "google", model: LLMFactory.resolveGeminiModel(config) };
        }
        return null;
    }

    private static normalizeVertexModelForExecution(model: string): string {
        const requested = String(model || "").trim();
        const normalized = LLMFactory.normalizeModelCode(requested);
        const aliases: Record<string, string> = {
            "gemini-3.1-flash": "gemini-3.1-flash",
            "gemini-3.1-flash-preview": "gemini-3.1-flash",
            "gemini-3.1-flash-lite": "gemini-3.1-flash-lite",
            "gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite",
            "gemini-3.1-pro": "gemini-3-pro-preview",
            "gemini-3.1-pro-preview": "gemini-3-pro-preview",
        };
        return aliases[normalized] || normalized || "gemini-3.5-flash";
    }

    private static normalizeModelCode(model: string): string {
        return String(model || "")
            .trim()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/^models\//i, "")
            .replace(/^publishers\/google\/models\//i, "")
            .toLowerCase()
            .replace(/[()]/g, "")
            .replace(/[\s_]+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
    }

    private static resolveVertexLocation(model: string): string {
        const configured = String(process.env.VERTEX_LOCATION || "").trim();
        const normalizedModel = String(model || "").trim().toLowerCase();
        const requiresGlobalOrMultiRegionEndpoint = /^gemini-3(?:[.-]|$)/.test(normalizedModel);
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
            return LLMFactory.resolveGeminiModel(config);
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
        if (configured === "openrouter") return "google";

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
        const useEnvOnlyFallback = LLMFactory.shouldForceVertexForAllTenants();
        const geminiKey = LLMFactory.resolveGeminiApiKey(config, { envOnly: useEnvOnlyFallback });
        if (geminiKey) return LLMFactory.buildGeminiService(config, { envOnly: useEnvOnlyFallback });
        return null;
    }
}
