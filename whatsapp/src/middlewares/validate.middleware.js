/**
 * Sanitiza texto de entrada eliminando caracteres de control
 */
export function sanitizeText(text) {
    if (typeof text !== "string") return "";
    return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

/**
 * Valida que un JID tenga formato básico de WhatsApp
 */
export function isValidJid(jid) {
    return typeof jid === "string" && jid.includes("@");
}
