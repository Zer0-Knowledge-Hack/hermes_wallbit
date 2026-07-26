import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";

import config from "../config/env.js";
import whatsappService from "../services/whatsapp.service.js";
import messageRouter from "./router.js";
import { getIo } from "../socket/index.js";
import auditService from "../services/audit.service.js";
import logger from "../utils/logger.js";

let reconnecting = false;

export async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
    });

    whatsappService.setSocket(sock);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            const image = await QRCode.toDataURL(qr);
            whatsappService.setConnectionInfo({ status: "qr", qr: image });
            getIo()?.emit("whatsapp:qr", image);
            getIo()?.emit("whatsapp:status", { status: "qr", qr: image });
        }

        if (connection === "open") {
            const phone = sock.user?.id?.replace(/@.*/, "") || null;
            const name = sock.user?.name || null;

            whatsappService.setConnectionInfo({
                status: "connected",
                phone,
                name,
                connectedAt: new Date().toISOString(),
                qr: null,
            });

            getIo()?.emit("whatsapp:status", {
                status: "connected",
                phone,
                name,
                connectedAt: new Date().toISOString(),
            });

            auditService.log("whatsapp_connect", "WhatsApp conectado", { phone });
            logger.info({ phone, name }, "WhatsApp conectado");
        }

        if (connection === "close") {
            whatsappService.setConnectionInfo({ status: "disconnected", qr: null });

            getIo()?.emit("whatsapp:status", { status: "disconnected" });
            auditService.log("whatsapp_disconnect", "WhatsApp desconectado");

            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect && !reconnecting) {
                reconnecting = true;
                logger.info("Reconectando WhatsApp...");
                setTimeout(() => {
                    reconnecting = false;
                    startBot();
                }, 3000);
            }
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const message = messages[0];

        if (!message?.message) return;
        if (message.key.fromMe) return;

        try {
            await messageRouter.handle(sock, message);
        } catch (err) {
            logger.error({ err: err.message }, "Error procesando mensaje");
        }
    });

    return sock;
}

export async function restartBot() {
    const sock = whatsappService.getSocket();
    if (sock) {
        try {
            await sock.logout();
        } catch {
            // ignorar
        }
    }
    return startBot();
}
