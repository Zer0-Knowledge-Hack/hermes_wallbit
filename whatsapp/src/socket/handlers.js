import whatsappService from "../services/whatsapp.service.js";
import messageService from "../services/message.service.js";
import auditService from "../services/audit.service.js";
import sessionManager from "../session/session.manager.js";
import { botReply } from "../utils/bot-reply.js";
import { getIo } from "./index.js";

export function registerSocketHandlers(io) {
    io.on("connection", (socket) => {
        const waInfo = whatsappService.getConnectionInfo();
        socket.emit("whatsapp:status", waInfo);
        if (waInfo.qr) socket.emit("whatsapp:qr", waInfo.qr);
        socket.emit("dashboard:stats", getDashboardStats());
        socket.emit("chat:list", messageService.getConversations());
        socket.emit("wallbit:users", sessionManager.allPublic());

        socket.on("chat:history", ({ jid, whatsapp, limit, offset }) => {
            const key = jid || whatsapp;
            socket.emit(
                "chat:history",
                messageService.getChatHistory(key, limit, offset)
            );
        });

        socket.on("wallbit:users:refresh", () => {
            socket.emit("wallbit:users", sessionManager.allPublic());
        });

        socket.on("message:send", async ({ jid, text }) => {
            try {
                const sock = whatsappService.getSocket();
                if (!sock) throw new Error("WhatsApp no conectado");

                await botReply(sock, jid, text);
                auditService.logMessage(jid, "outgoing");
            } catch (err) {
                socket.emit("message:error", { error: err.message });
                io.emit("error", { jid, message: err.message });
            }
        });

        socket.on("whatsapp:restart", async () => {
            const { restartBot } = await import("../whatsapp/connection.js");
            await restartBot();
        });

        socket.on("whatsapp:reset_session", async () => {
            const { resetSessionData } = await import("../whatsapp/connection.js");
            await resetSessionData();
        });
    });
}

export function getDashboardStats() {
    const msgStats = messageService.getStats();
    const sessions = sessionManager.allPublic();
    const linked = sessions.filter((s) => s.wallbitLinked);
    const pendingTrades = sessions.filter((s) => s.hasPendingTrade);
    const waInfo = whatsappService.getConnectionInfo();
    const apiCalls = auditService.getRecent(500).filter((l) => l.type === "wallbit_api_call").length;
    const errors = auditService.getRecent(500).filter((l) => l.type === "error").length;

    return {
        whatsapp: waInfo,
        messages: msgStats,
        users: {
            total: sessions.length,
            connected: linked.length,
            pendingTrades: pendingTrades.length,
        },
        apiCalls,
        errors,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
    };
}

export function broadcastDashboard() {
    getIo()?.emit("dashboard:stats", getDashboardStats());
    getIo()?.emit("wallbit:users", sessionManager.allPublic());
}
