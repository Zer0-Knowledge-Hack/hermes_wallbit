import pino from "pino";
import config from "../config/env.js";

const logger = pino({
    level: config.nodeEnv === "production" ? "info" : "debug",
    redact: {
        paths: [
            "apiKey",
            "api_key",
            "X-API-Key",
            "encryptedApiKey",
            "password",
            "token",
        ],
        remove: true,
    },
});

export default logger;
