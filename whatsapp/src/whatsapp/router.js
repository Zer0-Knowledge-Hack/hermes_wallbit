import conversationManager from "../conversation/conversation.manager.js";
import messageService from "../services/message.service.js";
import auditService from "../services/audit.service.js";
import sessionManager from "../session/session.manager.js";
import { getIo } from "../socket/index.js";
import { normalizeJid } from "../utils/phone.js";
import { botReply, learnDeliveryJid } from "../utils/bot-reply.js";
import logger from "../utils/logger.js";

function extractText(message) {
    const msg = message.message;
    if (!msg) return "";

    return (
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        msg.buttonsResponseMessage?.selectedDisplayText ||
        msg.listResponseMessage?.title ||
        msg.templateButtonReplyMessage?.selectedDisplayText ||
        ""
    ).trim();
}

/**
 * WhatsApp message entry point
 */
class MessageRouter {
    async handle(sock, message) {
        const jid = normalizeJid(message.key.remoteJid);

        if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") return;

        const text = extractText(message);
        if (!text) return;

        sessionManager.getOrCreate(jid);
        await learnDeliveryJid(sock, message.key, jid);

        const saved = messageService.saveIncoming(message);
        if (!saved) return;

        auditService.logMessage(jid, "incoming");

        getIo()?.emit("message:new", saved);
        getIo()?.emit("chat:update", messageService.getConversations());
        getIo()?.emit("session:update", sessionManager.toPublicView(sessionManager.get(jid)));

        try {
            await conversationManager.handle(sock, jid, text, message);
        } catch (err) {
            logger.error({ err: err.message, stack: err.stack, jid }, "Error processing message");
            try {
                await botReply(sock, jid, "❌ Hubo un error procesando tu mensaje. Escribe *menu* o *saldo* para continuar.");
            } catch (sendErr) {
                logger.error({ err: sendErr.message, jid }, "Failed to send error reply");
            }
            getIo()?.emit("error", { jid, message: err.message });
        }
    }
}

export default new MessageRouter();
