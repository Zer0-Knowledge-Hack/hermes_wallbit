/**
 * Canonical WhatsApp JID for Baileys (e.g. 59171234567@s.whatsapp.net).
 * Group and LID suffixes are preserved; bare numbers get @s.whatsapp.net.
 */
export function normalizeJid(jid) {
    if (!jid) return "";

    const trimmed = String(jid).trim();

    if (trimmed.includes("@")) {
        return trimmed;
    }

    const digits = trimmed.replace(/\D/g, "");
    return digits ? `${digits}@s.whatsapp.net` : "";
}

/**
 * Normalizes a JID or phone to international +XXXXXXXXXXX (display only).
 */
export function normalizeWhatsApp(jid) {
    if (!jid) return "";

    const raw = jid.replace(/@.*/, "").replace(/\D/g, "");

    if (!raw) return "";

    return `+${raw}`;
}

/** Phone string derived from a JID */
export function phoneFromJid(jid) {
    return normalizeWhatsApp(jid);
}

/**
 * Converts a normalized phone to a WhatsApp JID
 */
export function toJid(phone) {
    const digits = phone.replace(/\D/g, "");
    return `${digits}@s.whatsapp.net`;
}
