import { Router } from "express";
import dashboardRoutes from "./api/dashboard.routes.js";
import wallbitRoutes from "./api/wallbit.routes.js";
import apikeysRoutes from "./api/apikeys.routes.js";
import geminiRoutes from "./api/gemini.routes.js";
import settingsRoutes from "./api/settings.routes.js";
import analyticsRoutes from "./api/analytics.routes.js";
import usersRoutes from "./api/users.routes.js";
import logsRoutes from "./api/logs.routes.js";
import aiRoutes from "./api/ai.routes.js";

import db from "../database/index.js";
import messageService from "../services/message.service.js";
import whatsappService from "../services/whatsapp.service.js";
import auditService from "../services/audit.service.js";
import sessionManager from "../session/session.manager.js";
import { getDashboardStats } from "../socket/handlers.js";
import { normalizeJid, normalizeWhatsApp } from "../utils/phone.js";
import { botReply } from "../utils/bot-reply.js";

const router = Router();

router.use("/dashboard", dashboardRoutes);
router.use("/wallbit", wallbitRoutes);
router.use("/keys", apikeysRoutes);
router.use("/gemini", geminiRoutes);
router.use("/settings", settingsRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/users", usersRoutes);
router.use("/logs", logsRoutes);
router.use("/ai", aiRoutes);

router.get("/status", (req, res) => {
    res.json({ success: true, ...getDashboardStats() });
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
    res.json({ success: true, data: messageService.getChatHistory(key, limit, offset) });
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

router.post("/whatsapp/reset", async (req, res) => {
    try {
        const { resetSessionData } = await import("../whatsapp/connection.js");
        await resetSessionData();
        res.json({ success: true, message: "Sesión borrada. Escanea el nuevo QR." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post("/messages/send", async (req, res) => {
    try {
        const { jid, text } = req.body;
        if (!jid || !text) return res.status(400).json({ success: false, message: "jid y text requeridos" });
        const normalized = normalizeJid(jid);
        const sock = whatsappService.getSocket();
        if (!sock) return res.status(503).json({ success: false, message: "WhatsApp no conectado" });
        const saved = await botReply(sock, normalized, text);
        res.json({ success: true, data: saved });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Legacy endpoints
router.get("/wallbit/users", (req, res) => {
    res.json({ success: true, data: sessionManager.allPublic() });
});

export default router;
