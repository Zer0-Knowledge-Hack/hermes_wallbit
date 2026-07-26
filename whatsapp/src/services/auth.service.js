import sessionManager from "../session/session.manager.js";
import { SessionState, API_KEY_STATUS } from "../session/states.js";
import wallbit from "../wallbit/wallbit.js";
import config from "../config/env.js";
import db from "../database/index.js";
import { generateToken } from "../security/encryption.js";
import { normalizeJid, normalizeWhatsApp } from "../utils/phone.js";

/** @deprecated Use SessionState from session/states.js */
export const UserState = SessionState;

export const UserRole = {
    ADMIN: "administrador",
    USER: "usuario",
    GUEST: "invitado",
};

/**
 * Thin compatibility layer — new code should use sessionManager directly.
 */
class AuthService {
    _resolveJid(whatsappOrJid) {
        if (String(whatsappOrJid).includes("@")) {
            return normalizeJid(whatsappOrJid);
        }
        const phone = normalizeWhatsApp(whatsappOrJid);
        const digits = phone.replace(/\D/g, "");
        return `${digits}@s.whatsapp.net`;
    }

    getOrCreateUser(whatsappOrJid) {
        const jid = this._resolveJid(whatsappOrJid);
        const session = sessionManager.getOrCreate(jid);
        return this._sessionAsUser(session);
    }

    getUser(whatsappOrJid) {
        const jid = this._resolveJid(whatsappOrJid);
        const session = sessionManager.get(jid);
        return session ? this._sessionAsUser(session) : null;
    }

    _sessionAsUser(session) {
        return {
            id: session.id,
            whatsapp: session.phone,
            jid: session.jid,
            name: session.phone,
            role: UserRole.USER,
            state: session.state,
            last_activity: session.lastActivity,
        };
    }

    setUserState(whatsappOrJid, state) {
        const jid = this._resolveJid(whatsappOrJid);
        sessionManager.updateState(jid, state);
        return this.getUser(jid);
    }

    hasCredentials(whatsappOrJid) {
        const jid = this._resolveJid(whatsappOrJid);
        return sessionManager.hasApiKey(jid);
    }

    getDecryptedApiKey(whatsappOrJid) {
        const jid = this._resolveJid(whatsappOrJid);
        return sessionManager.getDecryptedApiKey(jid);
    }

    async saveApiKey(whatsappOrJid, apiKey) {
        const jid = this._resolveJid(whatsappOrJid);
        const trimmed = apiKey?.trim();

        if (!trimmed) {
            return { ok: false, message: "API Key vacía" };
        }

        const validation = await wallbit.validateApiKey(trimmed);

        if (!validation.ok) {
            sessionManager.setApiKeyStatus(jid, API_KEY_STATUS.ERROR);
            return {
                ok: false,
                message: validation.message || "La API Key es inválida o ha expirado",
            };
        }

        sessionManager.saveApiKey(jid, trimmed);

        db.insert("audit_logs", {
            type: "wallbit_connect",
            jid,
            whatsapp: sessionManager.get(jid)?.phone,
            detail: "Cuenta Wallbit conectada",
        });

        return { ok: true, message: "Cuenta conectada correctamente" };
    }

    disconnect(whatsappOrJid) {
        const jid = this._resolveJid(whatsappOrJid);
        sessionManager.removeApiKey(jid);

        db.insert("audit_logs", {
            type: "wallbit_disconnect",
            jid,
            whatsapp: sessionManager.get(jid)?.phone,
            detail: "Cuenta Wallbit desconectada",
        });

        return true;
    }

    createConnectLink(whatsappOrJid) {
        const jid = this._resolveJid(whatsappOrJid);
        const phone = sessionManager.get(jid)?.phone || normalizeWhatsApp(jid);
        const token = generateToken(32);
        const expiresAt = new Date(
            Date.now() + config.connectLinkExpiryMinutes * 60 * 1000
        ).toISOString();

        db.removeWhere("connect_tokens", (t) => t.jid === jid || t.whatsapp === phone);

        db.insert("connect_tokens", {
            token,
            jid,
            whatsapp: phone,
            expires_at: expiresAt,
            used: false,
        });

        return `${config.baseUrl}/connect/${token}`;
    }

    getConnectToken(token) {
        const record = db.find("connect_tokens", (t) => t.token === token && !t.used);

        if (!record) return null;

        if (new Date(record.expires_at) < new Date()) {
            return null;
        }

        return record;
    }

    async completeConnectLink(token, apiKey) {
        const record = this.getConnectToken(token);

        if (!record) {
            return { ok: false, message: "Enlace inválido o expirado" };
        }

        const jid = record.jid || this._resolveJid(record.whatsapp);
        const result = await this.saveApiKey(jid, apiKey);

        if (result.ok) {
            db.update("connect_tokens", record.id, { used: true });
        }

        return result;
    }

    getStatus(whatsappOrJid) {
        const jid = this._resolveJid(whatsappOrJid);
        const session = sessionManager.get(jid);

        return {
            jid,
            whatsapp: session?.phone,
            whatsappConnected: true,
            wallbitConnected: sessionManager.hasApiKey(jid),
            state: session?.state || SessionState.IDLE,
            lastSync: session?.lastSync || null,
            apiKeyStatus: session?.apiKeyStatus || API_KEY_STATUS.NONE,
            role: UserRole.USER,
        };
    }

    updateLastSync(whatsappOrJid) {
        const jid = this._resolveJid(whatsappOrJid);
        sessionManager.recordQuery(jid, sessionManager.get(jid)?.lastQuery || "sync");
    }

    requireApiKey(whatsappOrJid) {
        const jid = this._resolveJid(whatsappOrJid);
        return sessionManager.requireApiKey(jid);
    }
}

export default new AuthService();
