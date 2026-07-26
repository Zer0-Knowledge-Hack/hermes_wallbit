import config from "../config/env.js";
import logger from "../utils/logger.js";

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 3;

/**
 * Cliente HTTP centralizado para la API de Wallbit.
 * Todas las peticiones deben pasar por WallbitClient.request()
 */
class WallbitClient {
    constructor() {
        this.baseUrl = config.wallbit.baseUrl;
        this.prefix = config.wallbit.prefix;
    }

    buildUrl(path, query = {}) {
        const url = new URL(`${this.baseUrl}${this.prefix}${path}`);

        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== null && value !== "") {
                url.searchParams.set(key, String(value));
            }
        }

        return url.toString();
    }

    async request(apiKey, method, path, { query, body, retries = MAX_RETRIES } = {}) {
        const url = this.buildUrl(path, query);
        let attempt = 0;

        while (attempt <= retries) {
            try {
                const response = await fetch(url, {
                    method,
                    headers: {
                        "X-API-Key": apiKey,
                        Accept: "application/json",
                        ...(body ? { "Content-Type": "application/json" } : {}),
                    },
                    ...(body ? { body: JSON.stringify(body) } : {}),
                });

                const text = await response.text();
                let data = null;

                try {
                    data = text ? JSON.parse(text) : null;
                } catch {
                    data = { raw: text };
                }

                if (response.ok) {
                    return { ok: true, status: response.status, data };
                }

                const error = {
                    ok: false,
                    status: response.status,
                    data,
                    message: this.parseErrorMessage(response.status, data),
                };

                if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
                    attempt++;
                    await this.delay(500 * attempt);
                    continue;
                }

                return error;
            } catch (err) {
                if (attempt < retries) {
                    attempt++;
                    await this.delay(500 * attempt);
                    continue;
                }

                logger.error({ err: err.message, path }, "Error de red Wallbit");
                return { ok: false, status: 0, message: "Error de conexión con Wallbit", data: null };
            }
        }
    }

    parseErrorMessage(status, data) {
        const msg = data?.message || data?.error || data?.detail;

        switch (status) {
            case 401:
                return "API Key inválida o expirada";
            case 403:
                return "Permisos insuficientes para esta operación";
            case 412:
                return "Requisito previo no cumplido (KYC u otro)";
            case 422:
                return msg || "Datos de solicitud inválidos";
            case 429:
                return "Límite de peticiones excedido. Intenta más tarde";
            default:
                return msg || `Error HTTP ${status}`;
        }
    }

    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    get(apiKey, path, query) {
        return this.request(apiKey, "GET", path, { query });
    }

    post(apiKey, path, body) {
        return this.request(apiKey, "POST", path, { body });
    }

    delete(apiKey, path) {
        return this.request(apiKey, "DELETE", path);
    }
}

export default new WallbitClient();
