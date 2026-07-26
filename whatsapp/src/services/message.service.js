import db from "../database/index.js";
import { normalizeJid, normalizeWhatsApp, phoneFromJid } from "../utils/phone.js";

class MessageService {
    saveIncoming(message) {
        const jid = normalizeJid(message.key?.remoteJid);
        const phone = phoneFromJid(jid);
        const rawId = message.key?.id;

        if (rawId) {
            const dup = db.find("messages", (m) => m.raw_id === rawId && m.jid === jid);
            if (dup) return null;
        }

        const text =
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            message.message?.imageMessage?.caption ||
            "";

        const type = this.detectType(message);

        const record = db.insert("messages", {
            jid,
            whatsapp: phone,
            direction: "incoming",
            type,
            content: text,
            raw_id: rawId,
            timestamp: new Date(
                (message.messageTimestamp || Date.now() / 1000) * 1000
            ).toISOString(),
        });

        this.upsertContact(jid, phone, text);
        return record;
    }

    saveOutgoing(jid, content, type = "text") {
        const normalized = normalizeJid(jid);
        const phone = phoneFromJid(normalized);

        return db.insert("messages", {
            jid: normalized,
            whatsapp: phone,
            direction: "outgoing",
            type,
            content,
            timestamp: new Date().toISOString(),
        });
    }

    detectType(message) {
        const msg = message.message || {};

        if (msg.imageMessage) return "image";
        if (msg.videoMessage) return "video";
        if (msg.audioMessage) return "audio";
        if (msg.documentMessage) return "document";
        if (msg.locationMessage) return "location";
        if (msg.contactMessage) return "contact";
        return "text";
    }

    getContact(jid) {
        const normalized = normalizeJid(jid);
        const phone = phoneFromJid(normalized);
        return db.find("contacts", (c) => c.jid === normalized || c.whatsapp === phone) || null;
    }

    setDeliveryJid(jid, deliveryJid) {
        const normalized = normalizeJid(jid);
        const delivery = normalizeJid(deliveryJid);
        const phone = normalizeWhatsApp(delivery);
        db.upsert(
            "contacts",
            (c) => c.jid === normalized || c.whatsapp === phone || c.jid === normalized,
            {
                jid: normalized,
                whatsapp: phone,
                delivery_jid: delivery,
                name: phone,
                last_activity: new Date().toISOString(),
                status: "active",
            }
        );
    }

    upsertContact(jid, phone, lastMessage, deliveryJid = null) {
        db.upsert(
            "contacts",
            (c) => c.jid === jid || c.whatsapp === phone,
            {
                jid,
                whatsapp: phone,
                name: phone,
                last_message: lastMessage,
                last_activity: new Date().toISOString(),
                status: "active",
                ...(deliveryJid ? { delivery_jid: normalizeJid(deliveryJid) } : {}),
            }
        );
    }

    getConversations() {
        const contacts = db.all("contacts");
        const messages = db.all("messages");

        return contacts
            .map((contact) => {
                const chatMessages = messages.filter(
                    (m) => m.jid === contact.jid || m.whatsapp === contact.whatsapp
                );
                const unread = chatMessages.filter(
                    (m) => m.direction === "incoming" && !m.read
                ).length;
                const last = chatMessages.sort(
                    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
                )[0];

                return {
                    ...contact,
                    name: contact.delivery_jid
                        ? normalizeWhatsApp(contact.delivery_jid)
                        : (contact.name || contact.whatsapp),
                    unread,
                    last_message: last?.content || contact.last_message,
                    last_timestamp: last?.timestamp || contact.last_activity,
                };
            })
            .sort((a, b) => new Date(b.last_timestamp) - new Date(a.last_timestamp));
    }

    getChatHistory(jidOrPhone, limit = 100, offset = 0) {
        const jid = jidOrPhone.includes("@")
            ? normalizeJid(jidOrPhone)
            : null;
        const phone = normalizeWhatsApp(jidOrPhone);

        return db
            .filter(
                "messages",
                (m) => (jid && m.jid === jid) || m.whatsapp === phone
            )
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            .slice(offset, offset + limit);
    }

    getStats() {
        const messages = db.all("messages");
        return {
            total: messages.length,
            incoming: messages.filter((m) => m.direction === "incoming").length,
            outgoing: messages.filter((m) => m.direction === "outgoing").length,
        };
    }
}

export default new MessageService();
