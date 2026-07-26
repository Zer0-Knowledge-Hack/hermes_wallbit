import express from "express";
import http from "http";
import { Server } from "socket.io";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import config from "./config/env.js";
import logger from "./utils/logger.js";
import { initializeSocket } from "./socket/index.js";
import { registerSocketHandlers, broadcastDashboard } from "./socket/handlers.js";
import { startBot } from "./whatsapp/connection.js";

import webRoutes from "./routes/index.js";
import apiRoutes from "./routes/api.routes.js";
import connectRoutes from "./routes/connect.routes.js";

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

initializeSocket(io);
registerSocketHandlers(io);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
}));

app.use("/", webRoutes);
app.use("/api", apiRoutes);
app.use("/", connectRoutes);

app.use((err, req, res, next) => {
    logger.error({ err: err.message }, "Error no manejado");
    res.status(500).json({ success: false, message: "Error interno del servidor" });
});

startBot().catch((err) => {
    logger.error({ err: err.message }, "Error iniciando WhatsApp bot");
});

if (!process.env.VERCEL) {
    setInterval(() => broadcastDashboard(), 10000);

    server.listen(config.port, "0.0.0.0", () => {
        logger.info({ port: config.port, env: config.nodeEnv }, "Wallbit WhatsApp Assistant iniciado en 0.0.0.0");
    });
}

export default app;
