import db from "../database/index.js";
import { normalizeJid, normalizeWhatsApp } from "../utils/phone.js";

class AuditService {
    log(type, detail, meta = {}) {
        const jid = meta.jid ? normalizeJid(meta.jid) : null;
        const whatsapp = meta.whatsapp || (jid ? normalizeWhatsApp(jid) : null);

        return db.insert("audit_logs", {
            type,
            detail,
            ...meta,
            jid,
            whatsapp,
            timestamp: new Date().toISOString(),
        });
    }

    logApiCall(jidOrPhone, endpoint, status) {
        const jid = String(jidOrPhone).includes("@")
            ? normalizeJid(jidOrPhone)
            : null;

        this.log("wallbit_api_call", endpoint, {
            jid,
            whatsapp: jid ? normalizeWhatsApp(jid) : normalizeWhatsApp(jidOrPhone),
            status,
        });
    }

    logMessage(jidOrPhone, direction, messageType = "text") {
        const jid = String(jidOrPhone).includes("@")
            ? normalizeJid(jidOrPhone)
            : null;

        this.log("message", `${direction}:${messageType}`, {
            jid,
            whatsapp: jid ? normalizeWhatsApp(jid) : normalizeWhatsApp(jidOrPhone),
        });
    }

    getRecent(limit = 50) {
        return db
            .all("audit_logs")
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, limit);
    }
}

export default new AuditService();
