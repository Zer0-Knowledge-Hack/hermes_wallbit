import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.dev.vars") });

function normalizeUrl(url, defaultUrl) {
    if (!url) return defaultUrl;
    const trimmed = url.trim().replace(/\/$/, "");
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    if (trimmed.startsWith("localhost") || trimmed.startsWith("127.0.0.1")) return `http://${trimmed}`;
    return `https://${trimmed}`;
}

const config = {
    port: parseInt(process.env.PORT || "3000", 10),
    nodeEnv: process.env.NODE_ENV || "development",
    baseUrl: normalizeUrl(process.env.BASE_URL, "http://localhost:3000"),
    workerUrl: normalizeUrl(process.env.WORKER_URL, "http://localhost:8787"),
    webhookSecret: process.env.WEBHOOK_SECRET || "",
    encryptionKey: process.env.ENCRYPTION_KEY || "",
    jwtSecret: process.env.JWT_SECRET || "dev-jwt-secret-change-me",
    wallbit: {
        baseUrl: process.env.WALLBIT_API_BASE || "https://api.wallbit.io",
        prefix: process.env.WALLBIT_API_PREFIX || "/api/public/v1",
    },
    connectLinkExpiryMinutes: parseInt(process.env.CONNECT_LINK_EXPIRY_MINUTES || "5", 10),
    admin: {
        user: process.env.ADMIN_USER || "admin",
        password: process.env.ADMIN_PASSWORD || "admin123",
    },
    authDir: path.resolve(__dirname, "../../auth"),
    dataDir: path.resolve(__dirname, "../../data"),
};

export default config;
