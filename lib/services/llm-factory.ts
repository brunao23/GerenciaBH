import { NativeAgentConfig } from "../helpers/native-agent-config";
import { LLMService } from "./llm.interface";
import { GeminiService } from "./gemini.service";
import { OpenAIService } from "./openai.service";
import { AnthropicService } from "./anthropic.service";
import { GroqService } from "./groq.service";
import { OpenRouterService } from "./openrouter.service";

export class LLMFactory {
    static getService(config: NativeAgentConfig): LLMService {
        const provider = String(config.aiProvider || "google").toLowerCase().trim();

        switch (provider) {
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
}
