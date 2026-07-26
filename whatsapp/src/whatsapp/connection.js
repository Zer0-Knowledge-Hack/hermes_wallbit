import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
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
import messageService from "../services/message.service.js";
import sessionManager from "../session/session.manager.js";
import { normalizeJid } from "../utils/phone.js";

let reconnecting = false;
let activeSock = null;

function teardownSocket(sock) {
    if (!sock) return;
    try {
        sock.ev.removeAllListeners("connection.update");
        sock.ev.removeAllListeners("messages.upsert");
        sock.ev.removeAllListeners("creds.update");
        sock.ev.removeAllListeners("lid-mapping.update");
        sock.end(undefined);
    } catch {
        // ignore
    }
}

export async function startBot() {
    if (activeSock) {
        teardownSocket(activeSock);
        activeSock = null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
    });

    activeSock = sock;
    whatsappService.setSocket(sock);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("lid-mapping.update", (update) => {
        const items = Array.isArray(update) ? update : [update];
        for (const item of items) {
            if (!item) continue;
            const lid = item.lid || item.id;
            const pn = item.pn || item.phoneNumber;
            if (!lid || !pn) continue;

            const lidJid = String(lid).includes("@") ? normalizeJid(lid) : `${String(lid).replace(/\D/g, "")}@lid`;
            const delivery = normalizeJid(String(pn).includes("@") ? pn : `${String(pn).replace(/\D/g, "")}@s.whatsapp.net`);

            sessionManager.setDeliveryJid(lidJid, delivery);
            messageService.setDeliveryJid(lidJid, delivery);
            logger.info({ lidJid, delivery }, "LID→PN mapping stored");
        }
    });

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            const image = await QRCode.toDataURL(qr);
            whatsappService.setConnectionInfo({ status: "qr", qr: image });
            getIo()?.emit("whatsapp:qr", image);
            getIo()?.emit("whatsapp:status", { status: "qr", qr: image });
        }

        if (connection === "close") {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

            logger.warn({ reason: lastDisconnect?.error, shouldReconnect }, "Conexión cerrada");

            if (shouldReconnect && !reconnecting) {
                reconnecting = true;
                setTimeout(() => {
                    reconnecting = false;
                    startBot();
                }, 3000);
            } else if (!shouldReconnect) {
                whatsappService.setConnectionInfo({ status: "disconnected", qr: null });
                getIo()?.emit("whatsapp:status", { status: "disconnected", qr: null });
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
                connectedAt: new Date().toISOString(),
            });

            logger.info({ phone, name }, "WhatsApp conectado exitosamente");

            getIo()?.emit("whatsapp:status", {
                status: "connected",
                phone,
                name,
                qr: null,
                connectedAt: new Date().toISOString(),
            });
        }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        // Only handle live incoming messages — ignore history sync / duplicates
        if (type !== "notify") return;

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
    teardownSocket(activeSock);
    activeSock = null;
    whatsappService.setSocket(null);
    return startBot();
}

export async function resetSessionData() {
    teardownSocket(activeSock);
    activeSock = null;
    whatsappService.setSocket(null);
    whatsappService.setConnectionInfo({ status: "disconnected", qr: null, phone: null, name: null });
    getIo()?.emit("whatsapp:status", { status: "disconnected", qr: null });

    try {
        await fs.rm(config.authDir, { recursive: true, force: true });
        logger.info("Carpeta auth borrada exitosamente");
    } catch (err) {
        logger.error({ err: err.message }, "Error al borrar carpeta auth");
    }

    return startBot();
}
