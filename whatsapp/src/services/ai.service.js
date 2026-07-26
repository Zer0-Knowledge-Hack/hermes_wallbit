import config from "../config/env.js";
import logger from "../utils/logger.js";

/**
 * Capa de IA desacoplada — conectada a nuestro Cloudflare Worker para
 * Function Calling con el modelo qwen3-30b y la API real de Wallbit.
 */
class AIService {
    async chat(jid, apiKey, text, history = []) {
        if (!config.workerUrl) {
            return {
                ok: false,
                text: "El agente de IA no está configurado (falta WORKER_URL). Puedes utilizar los comandos directos como *saldo*, *invertir* o *menu*.",
                usedTools: [],
            };
        }

        try {
            const formattedHistory = history.map((msg) => ({
                role: msg.role === "assistant" ? "assistant" : "user",
                content: msg.content,
            }));

            const response = await fetch(`${config.workerUrl}/api/whatsapp/ai`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Webhook-Secret": config.webhookSecret || "",
                },
                body: JSON.stringify({
                    jid,
                    apiKey,
                    text,
                    history: formattedHistory,
                }),
            });

            if (!response.ok) {
                logger.error({ status: response.status }, "Error en consulta a IA Worker");
                return {
                    ok: false,
                    text: "Tuve problemas para consultar al asistente conversacional en este momento. Puedes usar los comandos directos como *saldo*, *invertir* o *menu*.",
                    usedTools: [],
                };
            }

            const data = await response.json();
            return {
                ok: true,
                text: data.text || "No obtuve respuesta del asistente.",
                usedTools: Array.isArray(data.usedTools) ? data.usedTools : [],
            };
        } catch (error) {
            logger.error({ err: error.message }, "Fallo de conexión con IA Worker");
            return {
                ok: false,
                text: "No pude comunicarme con el servidor de inteligencia artificial. Inténtalo de nuevo más tarde o usa *menu*.",
                usedTools: [],
            };
        }
    }

    async analyzePortfolio(portfolioData) {
        if (!portfolioData) {
            return "No tengo datos de portafolio para analizar. Conecta tu cuenta Wallbit primero con *vincular*.";
        }

        const positions = portfolioData?.data?.assets || portfolioData?.assets || [];
        const usdBalance = portfolioData?.data?.usd_balance ?? portfolioData?.usd_balance ?? 0;

        if (!positions.length) {
            return `Tu cuenta de inversión tiene ${usdBalance} USD disponibles pero no tienes posiciones abiertas actualmente.`;
        }

        const summary = positions
            .map((p) => `• ${p.symbol || p.ticker}: ${p.shares || p.quantity || 0} acciones`)
            .join("\n");

        return `📊 Análisis de portafolio:\n\nPosiciones:\n${summary}\n\nSaldo USD disponible: ${usdBalance}\n\nNota: Este es un análisis informativo. No constituye asesoramiento financiero.`;
    }

    async explainAsset(assetData) {
        if (!assetData?.data && !assetData?.symbol) {
            return "No encontré información sobre ese activo.";
        }

        const asset = assetData.data || assetData;
        const name = asset.name || asset.symbol;
        const sector = asset.sector || "N/A";
        const price = asset.price || asset.current_price || "N/A";
        const description = asset.description || "Sin descripción disponible.";

        return `📈 *${name}* (${asset.symbol})\n\nSector: ${sector}\nPrecio: ${price}\n\n${description.slice(0, 500)}`;
    }

    async answerQuestion(question, context = {}) {
        const q = question.toLowerCase();

        if (q.includes("portafolio") || q.includes("portfolio")) {
            return this.analyzePortfolio(context.portfolio);
        }

        if (q.includes("riesgo")) {
            return "⚠️ Todo portafolio con activos financieros conlleva riesgo de mercado. Diversificar entre sectores y mantener liquidez puede ayudar a gestionar el riesgo. Consulta con un asesor financiero para recomendaciones personalizadas.";
        }

        if (q.includes("hoy") || q.includes("transaccion")) {
            const txs = context.transactions?.data || context.transactions || [];
            if (!txs.length) return "No hay transacciones recientes para mostrar.";
            return `Hoy tienes ${txs.length} transacción(es) registrada(s). Usa el comando *transactions* para ver el detalle.`;
        }

        return "Soy tu asistente financiero de Wallbit. Puedo explicar activos, analizar tu cartera o ayudarte a invertir.\n\nPrueba escribir: *saldo*, *invertir*, o hazme una consulta en lenguaje natural.";
    }
}

export default new AIService();
