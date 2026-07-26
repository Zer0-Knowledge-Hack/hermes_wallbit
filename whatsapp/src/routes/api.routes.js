import { Router } from "express";
import db from "../database/index.js";
import messageService from "../services/message.service.js";
import whatsappService from "../services/whatsapp.service.js";
import auditService from "../services/audit.service.js";
import sessionManager from "../session/session.manager.js";
import { getDashboardStats } from "../socket/handlers.js";
import { normalizeJid, normalizeWhatsApp } from "../utils/phone.js";

const router = Router();

router.get("/status", (req, res) => {
    res.json({ success: true, ...getDashboardStats() });
});

router.get("/users", (req, res) => {
    const sessions = sessionManager.allPublic().map((s) => ({
        ...s,
        whatsapp: s.phone,
        wallbitConnected: s.wallbitLinked,
        state: s.state,
        last_activity: s.lastActivity,
    }));
    res.json({ success: true, data: sessions });
});

router.get("/wallbit/users", (req, res) => {
    res.json({ success: true, data: sessionManager.allPublic() });
});

router.get("/contacts", (req, res) => {
    res.json({ success: true, data: db.all("contacts") });
});

router.get("/conversations", (req, res) => {
    res.json({ success: true, data: messageService.getConversations() });
});

router.get("/messages/:jidOrPhone", (req, res) => {
    const key = req.params.jidOrPhone.includes("@")
        ? normalizeJid(decodeURIComponent(req.params.jidOrPhone))
        : normalizeWhatsApp(req.params.jidOrPhone);
    const limit = parseInt(req.query.limit || "100", 10);
    const offset = parseInt(req.query.offset || "0", 10);

    res.json({
        success: true,
        data: messageService.getChatHistory(key, limit, offset),
    });
});

router.get("/logs", (req, res) => {
    const limit = parseInt(req.query.limit || "100", 10);
    res.json({ success: true, data: auditService.getRecent(limit) });
});

router.get("/whatsapp", (req, res) => {
    res.json({ success: true, data: whatsappService.getConnectionInfo() });
});

router.post("/whatsapp/restart", async (req, res) => {
    try {
        const { restartBot } = await import("../whatsapp/connection.js");
        await restartBot();
        res.json({ success: true, message: "Reiniciando WhatsApp..." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post("/messages/send", async (req, res) => {
    try {
        const { jid, text } = req.body;

        if (!jid || !text) {
            return res.status(400).json({ success: false, message: "jid y text requeridos" });
        }

        const sock = whatsappService.getSocket();
        if (!sock) {
            return res.status(503).json({ success: false, message: "WhatsApp no conectado" });
        }

        const normalized = normalizeJid(jid);
        await sock.sendMessage(normalized, { text });
        const saved = messageService.saveOutgoing(normalized, text);

        res.json({ success: true, data: saved });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
