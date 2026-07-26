import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import config from "../config/env.js";
import logger from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const whatsappEnvPath = path.resolve(__dirname, "../../.env");
const workerDevVarsPath = path.resolve(__dirname, "../../../.dev.vars");
const frontendDevVarsPath = path.resolve(__dirname, "../../.dev.vars");

/**
 * Actualiza o añade una clave en un archivo de entorno (.env / .dev.vars).
 */
function updateEnvFile(filePath, key, value) {
    try {
        let content = "";
        if (fs.existsSync(filePath)) {
            content = fs.readFileSync(filePath, "utf-8");
        }

        const regex = new RegExp(`^${key}=.*$`, "m");
        const newLine = `${key}=${value}`;

        if (regex.test(content)) {
            content = content.replace(regex, newLine);
        } else {
            content = content.trimEnd() + (content.length > 0 ? "\n" : "") + newLine + "\n";
        }

        fs.writeFileSync(filePath, content, "utf-8");
        logger.info({ filePath, key }, "Archivo de entorno sincronizado exitosamente");
    } catch (err) {
        logger.error({ err: err.message, filePath }, "Error actualizando archivo de entorno");
    }
}

/**
 * Inicia el túnel Cloudflare y sincroniza URLs.
 */
export async function startTunnel({ startServer = false } = {}) {
    if (startServer) {
        logger.info("Iniciando servidor WhatsApp en paralelo con el túnel...");
        await import("../index.js");
    }

    const port = config.port || 3000;
    const targetUrl = `http://localhost:${port}`;

    logger.info({ targetUrl }, "Iniciando Cloudflare Tunnel...");

    // En Windows se requiere shell: true para ejecutar npx o comandos del sistema
    const tunnelProcess = spawn("npx", ["-y", "cloudflared", "tunnel", "--url", targetUrl], {
        shell: true,
    });

    let urlFound = false;

    const handleOutput = (data) => {
        const text = data.toString();
        // Regex para capturar URL de trycloudflare.com
        const match = text.match(/https:\/\/([a-zA-Z0-9-]+)\.trycloudflare\.com/);

        if (match && !urlFound) {
            urlFound = true;
            const publicUrl = match[0];

            console.log("\n==================================================");
            console.log("🌐 TÚNEL HTTPS ACTIVO (Cloudflare Tunnel)");
            console.log(`👉 URL Pública: ${publicUrl}`);
            console.log("==================================================\n");

            logger.info({ publicUrl }, "Túnel HTTPS establecido exitosamente");

            // 1. Actualizar configuración en memoria del servidor actual
            config.baseUrl = publicUrl;

            // 2. Persistir en whatsapp/.env
            updateEnvFile(whatsappEnvPath, "BASE_URL", publicUrl);

            // 3. Persistir en el Cloudflare Worker (.dev.vars)
            updateEnvFile(workerDevVarsPath, "WHATSAPP_API_URL", publicUrl);

            // 4. Persistir en whatsapp/.dev.vars para el frontend worker
            updateEnvFile(frontendDevVarsPath, "BACKEND_URL", publicUrl);

            // 5. Actualizar automáticamente el secret en Cloudflare Worker (whatshat-frontend)
            try {
                logger.info("Actualizando variable BACKEND_URL en Cloudflare Worker (whatshat-frontend)...");
                const wranglerConfigPath = path.resolve(__dirname, "../../wrangler-frontend.toml");
                execSync(`npx wrangler secret put BACKEND_URL --config "${wranglerConfigPath}"`, {
                    input: publicUrl,
                    stdio: ["pipe", "ignore", "ignore"],
                });
                logger.info("✅ BACKEND_URL actualizado exitosamente en Cloudflare.");
            } catch (err) {
                logger.warn({ err: err.message }, "No se pudo actualizar BACKEND_URL en Cloudflare automáticamente.");
            }
        }
    };

    tunnelProcess.stdout.on("data", handleOutput);
    tunnelProcess.stderr.on("data", handleOutput);

    tunnelProcess.on("close", (code) => {
        logger.warn({ code }, "El proceso del túnel Cloudflare ha terminado");
        if (code !== 0 && !urlFound) {
            logger.error("No se pudo establecer el túnel Cloudflare. Verifique su conexión o instalación.");
        }
    });

    return tunnelProcess;
}

// Permitir ejecución directa desde CLI: node src/utils/tunnel.js [--start]
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const shouldStartServer = process.argv.includes("--start");
    startTunnel({ startServer: shouldStartServer });
}
