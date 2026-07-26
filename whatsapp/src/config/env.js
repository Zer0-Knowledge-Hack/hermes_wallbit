import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const config = {
    port: parseInt(process.env.PORT || "3000", 10),
    nodeEnv: process.env.NODE_ENV || "development",
    baseUrl: process.env.BASE_URL || "http://localhost:3000",
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
