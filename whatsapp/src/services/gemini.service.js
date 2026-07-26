import db from "../database/index.js";
import apiKeysService from "./apikeys.service.js";

export const GEMINI_MODELS = [
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", context: "1M", speed: "Medium", cost: "High", capability: "Reasoning" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", context: "1M", speed: "Fast", cost: "Low", capability: "Balanced" },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", context: "1M", speed: "Fast", cost: "Low", capability: "General" },
    { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite", context: "1M", speed: "Very Fast", cost: "Minimal", capability: "Lightweight" },
    { id: "text-embedding-004", name: "Embedding", context: "8K", speed: "Fast", cost: "Low", capability: "Embeddings" },
];

const DEFAULT_PROMPT = {
    systemPrompt: "You are Wallbit AI Assistant, a professional financial advisor integrated with Wallbit API. Always cite real data from tools. Never invent figures.",
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    candidateCount: 1,
    thinkingMode: false,
    streaming: true,
    safety: "default",
    jsonOutput: false,
    contextWindow: 128000,
};

class GeminiService {
    getConfig() {
        const config = db.find("gemini_config", () => true);
        if (!config) {
            return { ...DEFAULT_PROMPT, model: "gemini-2.5-flash", hasKey: false };
        }

        return {
            ...DEFAULT_PROMPT,
            ...config.settings,
            model: config.model || "gemini-2.5-flash",
            hasKey: !!apiKeysService.getDecrypted("gemini"),
            maskedKey: config.masked_key || null,
        };
    }

    saveConfig(settings) {
        const existing = db.find("gemini_config", () => true);

        if (existing) {
            return db.update("gemini_config", existing.id, {
                settings: { ...existing.settings, ...settings },
                model: settings.model || existing.model,
            });
        }

        return db.insert("gemini_config", {
            model: settings.model || "gemini-2.5-flash",
            settings: { ...DEFAULT_PROMPT, ...settings },
        });
    }

    saveApiKey(apiKey) {
        return apiKeysService.save({ provider: "gemini", apiKey, label: "Gemini" });
    }

    async validateKey(apiKey) {
        const key = apiKey || apiKeysService.getDecrypted("gemini");
        if (!key) return { ok: false, message: "No API Key configured" };

        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
            );
            if (res.ok) {
                apiKeysService.markUsed("gemini");
                return { ok: true, message: "API Key válida" };
            }
            return { ok: false, message: "API Key inválida" };
        } catch (err) {
            return { ok: false, message: err.message };
        }
    }

    getModels() {
        return GEMINI_MODELS;
    }

    resetPrompt() {
        return this.saveConfig(DEFAULT_PROMPT);
    }
}

export default new GeminiService();
