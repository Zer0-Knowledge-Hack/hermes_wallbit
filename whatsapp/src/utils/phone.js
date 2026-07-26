/**
 * Strip WhatsApp device suffix (e.g. 59171234567:0@s.whatsapp.net → 59171234567@s.whatsapp.net)
 */
export function stripDeviceSuffix(jid) {
    if (!jid || !jid.includes("@")) return jid || "";
    const [user, domain] = jid.split("@");
    const bareUser = user.split(":")[0];
    return `${bareUser}@${domain}`;
}

/**
 * Canonical WhatsApp JID for Baileys (e.g. 59171234567@s.whatsapp.net).
 * Group and LID suffixes are preserved; bare numbers get @s.whatsapp.net.
 */
export function normalizeJid(jid) {
    if (!jid) return "";

    const trimmed = stripDeviceSuffix(String(jid).trim());

    if (trimmed.includes("@")) {
        return trimmed;
    }

    const digits = trimmed.replace(/\D/g, "");
    return digits ? `${digits}@s.whatsapp.net` : "";
}

/**
 * Resolve the JID to use for sendMessage.
 * Incoming DMs often use @lid; replies must use @s.whatsapp.net (remoteJidAlt / senderPn).
 */
export async function resolveDeliveryJid(sock, messageKey, fallbackJid = "") {
    const key = messageKey || {};

    if (key.remoteJidAlt && key.remoteJidAlt.includes("@s.whatsapp.net")) {
        return normalizeJid(key.remoteJidAlt);
    }

    const senderPn = key.senderPn || key.participantAlt;
    if (senderPn) {
        const raw = String(senderPn).trim();
        if (raw.includes("@")) return normalizeJid(raw);
        const digits = raw.replace(/\D/g, "");
        if (digits.length >= 8) return `${digits}@s.whatsapp.net`;
    }

    const remote = key.remoteJid || fallbackJid;
    if (remote?.endsWith("@lid") && sock?.signalRepository?.lidMapping?.getPNForLID) {
        try {
            const pn = await sock.signalRepository.lidMapping.getPNForLID(remote);
            if (pn) return normalizeJid(String(pn));
        } catch {
            // fall through
        }
    }

    if (remote?.endsWith("@s.whatsapp.net")) {
        return normalizeJid(remote);
    }

    // Never send to @lid — it won't reach the user's phone reliably
    if (remote?.endsWith("@lid")) {
        return "";
    }

    return normalizeJid(fallbackJid || remote);
}

export function isLidJid(jid) {
    return String(jid || "").endsWith("@lid");
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

export function phoneFromJid(jid) {
    if (!jid) return "";
    if (isLidJid(jid)) return jid.replace("@lid", "");
    return normalizeWhatsApp(jid);
}

/**
 * Converts a normalized phone to a WhatsApp JID
 */
export function toJid(phone) {
    const digits = phone.replace(/\D/g, "");
    return `${digits}@s.whatsapp.net`;
}
