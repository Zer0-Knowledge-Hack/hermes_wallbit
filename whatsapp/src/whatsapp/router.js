import conversationManager from "../conversation/conversation.manager.js";
import messageService from "../services/message.service.js";
import auditService from "../services/audit.service.js";
import sessionManager from "../session/session.manager.js";
import { getIo } from "../socket/index.js";
import { normalizeJid } from "../utils/phone.js";
import logger from "../utils/logger.js";

/**
 * WhatsApp message entry point — delegates conversational logic to ConversationManager.
 */
class MessageRouter {
    async handle(sock, message) {
        const jid = normalizeJid(message.key.remoteJid);

        // Ignore group chats and status broadcasts
        if (jid.endsWith("@g.us") || jid === "status@broadcast") return;

        const text =
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            "";

        if (!text) return;

        sessionManager.getOrCreate(jid);

        const saved = messageService.saveIncoming(message);
        auditService.logMessage(jid, "incoming");

        getIo()?.emit("message:new", saved);
        getIo()?.emit("chat:update", messageService.getConversations());
        getIo()?.emit("session:update", sessionManager.toPublicView(sessionManager.get(jid)));

        try {
            await conversationManager.handle(sock, jid, text, message);
        } catch (err) {
            logger.error({ err: err.message, jid }, "Error processing message");
            getIo()?.emit("error", { jid, message: err.message });
        }
    }
}

export default new MessageRouter();
