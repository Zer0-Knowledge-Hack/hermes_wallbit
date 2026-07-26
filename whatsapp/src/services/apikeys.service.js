import db from "../database/index.js";
import { encrypt, decrypt, maskSecret } from "../security/encryption.js";

export const PROVIDERS = [
    "wallbit",
    "gemini",
    "openai",
    "claude",
    "deepseek",
    "groq",
    "mistral",
    "openrouter",
    "perplexity",
];

class ApiKeysService {
    list() {
        return db.all("api_keys").map((k) => this.toPublic(k));
    }

    get(id) {
        const key = db.find("api_keys", (k) => k.id === id);
        return key ? this.toPublic(key) : null;
    }

    getDecrypted(provider) {
        const record = db.find("api_keys", (k) => k.provider === provider && k.active);

        if (!record) return null;

        try {
            return decrypt(record.encrypted_key);
        } catch {
            return null;
        }
    }

    async save({ provider, apiKey, label, model }) {
        if (!PROVIDERS.includes(provider)) {
            return { ok: false, message: "Proveedor no soportado" };
        }

        const trimmed = apiKey?.trim();
        if (!trimmed) return { ok: false, message: "API Key vacía" };

        db.removeWhere("api_keys", (k) => k.provider === provider && k.active);

        const record = db.insert("api_keys", {
            provider,
            label: label || provider,
            model: model || null,
            encrypted_key: encrypt(trimmed),
            masked: maskSecret(trimmed),
            active: true,
            status: "valid",
            last_used: null,
        });

        return { ok: true, data: this.toPublic(record) };
    }

    update(id, updates) {
        const allowed = ["label", "model", "status"];
        const filtered = Object.fromEntries(
            Object.entries(updates).filter(([k]) => allowed.includes(k))
        );
        const updated = db.update("api_keys", id, filtered);
        return updated ? this.toPublic(updated) : null;
    }

    remove(id) {
        return db.remove("api_keys", id);
    }

    markUsed(provider) {
        const record = db.find("api_keys", (k) => k.provider === provider && k.active);
        if (record) {
            db.update("api_keys", record.id, { last_used: new Date().toISOString() });
        }
    }

    toPublic(record) {
        return {
            id: record.id,
            provider: record.provider,
            label: record.label,
            model: record.model,
            masked: record.masked,
            status: record.status,
            active: record.active,
            last_used: record.last_used,
            created_at: record.created_at,
            updated_at: record.updated_at,
        };
    }
}

export default new ApiKeysService();
