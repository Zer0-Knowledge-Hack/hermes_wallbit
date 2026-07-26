import sessionManager from "../session/session.manager.js";
import messageService from "../services/message.service.js";
import { getIo } from "../socket/index.js";
import { normalizeJid, resolveDeliveryJid, isLidJid } from "./phone.js";
import logger from "./logger.js";

/** Resolve where to deliver outgoing WhatsApp messages for a session/contact. */
export async function getDeliveryJid(sock, jid) {
    const normalized = normalizeJid(jid);
    const session = sessionManager.get(normalized);
    if (session?.deliveryJid) return session.deliveryJid;

    const contact = messageService.getContact(normalized);
    if (contact?.delivery_jid) return contact.delivery_jid;

    if (isLidJid(normalized) && sock?.signalRepository?.lidMapping?.getPNForLID) {
        try {
            const pn = await sock.signalRepository.lidMapping.getPNForLID(normalized);
            if (pn) {
                const delivery = normalizeJid(String(pn));
                sessionManager.setDeliveryJid(normalized, delivery);
                messageService.setDeliveryJid(normalized, delivery);
                return delivery;
            }
        } catch {
            // fall through
        }
    }

    if (!isLidJid(normalized)) return normalized;
    return "";
}

/**
 * Send a bot message to WhatsApp and mirror it in the CRM Chats panel.
 */
export async function botReply(sock, jid, text) {
    const normalized = normalizeJid(jid);
    const deliveryJid = await getDeliveryJid(sock, normalized);

    if (!deliveryJid) {
        logger.error({ jid: normalized }, "No delivery JID — cannot send to WhatsApp phone");
        throw new Error("No se pudo resolver el número del contacto para enviar por WhatsApp");
    }

    await sock.sendMessage(deliveryJid, { text });
    logger.info({ sessionJid: normalized, deliveryJid, chars: text.length }, "WhatsApp message sent");

    sessionManager.addToConversation(normalized, "assistant", text);
    const saved = messageService.saveOutgoing(normalized, text);
    getIo()?.emit("message:new", saved);
    getIo()?.emit("chat:update", messageService.getConversations());
    return saved;
}

/** Prefer ctx.reply (from ConversationManager) or fall back to botReply. */
export async function sendText(ctx, text) {
    if (ctx.reply) {
        await ctx.reply(text);
        return;
    }
    const id = ctx.jid || ctx.from;
    await botReply(ctx.sock, id, text);
}

/** Store delivery mapping when we learn it from an incoming message. */
export async function learnDeliveryJid(sock, messageKey, sessionJid) {
    const deliveryJid = await resolveDeliveryJid(sock, messageKey, sessionJid);
    if (!deliveryJid) {
        logger.warn(
            {
                sessionJid,
                remoteJid: messageKey?.remoteJid,
                remoteJidAlt: messageKey?.remoteJidAlt,
                senderPn: messageKey?.senderPn,
            },
            "Could not resolve delivery JID from incoming message"
        );
        return null;
    }

    sessionManager.setDeliveryJid(sessionJid, deliveryJid);
    messageService.setDeliveryJid(sessionJid, deliveryJid);
    logger.info({ sessionJid, deliveryJid }, "Delivery JID resolved");
    return deliveryJid;
}
