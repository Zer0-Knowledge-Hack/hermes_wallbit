import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    Browsers,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import fs from "fs/promises";

import config from "../config/env.js";
import whatsappService from "../services/whatsapp.service.js";
import messageRouter from "./router.js";
import { getIo } from "../socket/index.js";
import auditService from "../services/audit.service.js";
import logger from "../utils/logger.js";
import db from "../database/index.js";

let reconnecting = false;

export async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        browser: Browsers.ubuntu("Chrome"),
        printQRInTerminal: false,
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

        if (connection === "close") {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            logger.warn({ reason: lastDisconnect?.error, shouldReconnect }, "Conexión cerrada");

            try {
                sock.ev.removeAllListeners();
            } catch {
                // ignorar
            }

            if (shouldReconnect && !reconnecting) {
                reconnecting = true;
                setTimeout(() => {
                    reconnecting = false;
                    startBot();
                }, 3000);
            } else if (!shouldReconnect && !reconnecting) {
                reconnecting = true;
                logger.warn("Sesión cerrada por servidor o inválida (loggedOut/401). Limpiando sesión y generando nuevo QR en 3s...");
                setTimeout(() => {
                    reconnecting = false;
                    resetSessionData();
                }, 3000);
            }
        }

        if (connection === "open") {
            const user = sock.user;
            const phone = user?.id?.split(":")[0] || user?.id?.split("@")[0] || "desconocido";
            const name = user?.name || phone;

            whatsappService.setConnectionInfo({
                status: "connected",
                phone,
                name,
                qr: null,
            });

            logger.info({ phone, name }, "WhatsApp conectado exitosamente");

            getIo()?.emit("whatsapp:status", {
                status: "connected",
                phone,
                name,
                qr: null,
            });
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
        whatsappService.setSocket(null);
        try {
            sock.ev.removeAllListeners();
            await sock.logout();
        } catch {
            // ignorar
        }
    }
    return startBot();
}

export async function resetSessionData() {
    const sock = whatsappService.getSocket();
    if (sock) {
        whatsappService.setSocket(null);
        try {
            sock.ev.removeAllListeners();
            sock.end(undefined);
        } catch {
            // ignorar
        }
    }
    whatsappService.setConnectionInfo({ status: "disconnected", qr: null, phone: null, name: null });
    getIo()?.emit("whatsapp:status", { status: "disconnected", qr: null });

    try {
        await fs.rm(config.authDir, { recursive: true, force: true });
        await fs.mkdir(config.authDir, { recursive: true });
        logger.info("Carpeta auth borrada exitosamente");
    } catch (err) {
        logger.error({ err: err.message }, "Error al borrar carpeta auth");
    }

    try {
        db.reset();
        logger.info("Base de datos y carpeta data reiniciadas exitosamente");
    } catch (err) {
        logger.error({ err: err.message }, "Error al reiniciar base de datos");
    }

    return startBot();
}
