import db from "../database/index.js";
import { encrypt, decrypt } from "../security/encryption.js";
import { normalizeJid, phoneFromJid } from "../utils/phone.js";
import { SessionState, API_KEY_STATUS } from "./states.js";
import logger from "../utils/logger.js";

const MAX_CONVERSATION = 20;

/**
 * One session per WhatsApp JID — the canonical user identifier for Baileys.
 */
class SessionManager {
    getOrCreate(jid) {
        const normalized = normalizeJid(jid);
        let session = db.find("sessions", (s) => s.jid === normalized);

        if (!session) {
            session = db.insert("sessions", this.emptySession(normalized));
        }

        return session;
    }

    get(jid) {
        const normalized = normalizeJid(jid);
        return db.find("sessions", (s) => s.jid === normalized) || null;
    }

    emptySession(jid) {
        return {
            jid,
            phone: phoneFromJid(jid),
            state: SessionState.IDLE,
            apiKeyEncrypted: null,
            apiKeyStatus: API_KEY_STATUS.NONE,
            pendingTrade: null,
            conversation: [],
            lastSync: null,
            lastQuery: null,
            lastQueryAt: null,
            lastActivity: new Date().toISOString(),
        };
    }

    update(jid, updates) {
        const session = this.getOrCreate(jid);
        return db.update("sessions", session.id, {
            ...updates,
            lastActivity: new Date().toISOString(),
        });
    }

    updateState(jid, state) {
        return this.update(jid, { state });
    }

    hasApiKey(jid) {
        const session = this.get(jid);
        return !!(session?.apiKeyEncrypted && session.apiKeyStatus === API_KEY_STATUS.VALID);
    }

    getDecryptedApiKey(jid) {
        const session = this.get(jid);

        if (!session?.apiKeyEncrypted) return null;

        try {
            return decrypt(session.apiKeyEncrypted);
        } catch (err) {
            logger.error({ jid: session.jid }, "Failed to decrypt API key");
            return null;
        }
    }

    saveApiKey(jid, apiKey) {
        const encrypted = encrypt(apiKey.trim());
        return this.update(jid, {
            apiKeyEncrypted: encrypted,
            apiKeyStatus: API_KEY_STATUS.VALID,
            state: SessionState.CONNECTED,
            lastSync: new Date().toISOString(),
        });
    }

    removeApiKey(jid) {
        return this.update(jid, {
            apiKeyEncrypted: null,
            apiKeyStatus: API_KEY_STATUS.NONE,
            pendingTrade: null,
            state: SessionState.IDLE,
            lastSync: null,
        });
    }

    setApiKeyStatus(jid, status) {
        return this.update(jid, { apiKeyStatus: status });
    }

    setPendingTrade(jid, trade) {
        return this.update(jid, { pendingTrade: trade });
    }

    clearPendingTrade(jid) {
        return this.update(jid, { pendingTrade: null });
    }

    addToConversation(jid, role, content) {
        const session = this.getOrCreate(jid);
        const conversation = [
            ...(session.conversation || []),
            { role, content, at: new Date().toISOString() },
        ].slice(-MAX_CONVERSATION);

        return this.update(jid, { conversation });
    }

    recordQuery(jid, query) {
        return this.update(jid, {
            lastQuery: query,
            lastQueryAt: new Date().toISOString(),
            lastSync: new Date().toISOString(),
        });
    }

    /** Safe view for admin panel — never exposes the API key */
    toPublicView(session) {
        if (!session) return null;

        return {
            jid: session.jid,
            phone: session.phone,
            state: session.state,
            wallbitLinked: !!session.apiKeyEncrypted,
            apiKeyStatus: session.apiKeyStatus,
            hasPendingTrade: !!session.pendingTrade,
            pendingTrade: session.pendingTrade
                ? {
                      side: session.pendingTrade.side,
                      symbol: session.pendingTrade.symbol,
                      amount: session.pendingTrade.amount,
                      currency: session.pendingTrade.currency,
                  }
                : null,
            lastSync: session.lastSync,
            lastQuery: session.lastQuery,
            lastQueryAt: session.lastQueryAt,
            lastActivity: session.lastActivity,
            created_at: session.created_at,
        };
    }

    allPublic() {
        return db.all("sessions").map((s) => this.toPublicView(s));
    }

    requireApiKey(jid) {
        const apiKey = this.getDecryptedApiKey(jid);

        if (!apiKey) {
            return { ok: false, apiKey: null };
        }

        return { ok: true, apiKey };
    }
}

export default new SessionManager();
