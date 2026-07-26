import sessionManager from "../session/session.manager.js";
import { SessionState, API_KEY_STATUS } from "../session/states.js";
import wallbit from "../wallbit/wallbit.js";
import investmentService from "../services/investment.service.js";
import { findCommand } from "../commands/index.js";
import auditService from "../services/audit.service.js";
import { botReply } from "../utils/bot-reply.js";
import messageService from "../services/message.service.js";
import aiService from "../services/ai.service.js";
import { getIo } from "../socket/index.js";
import { normalizeJid } from "../utils/phone.js";
import {
    formatConnectedWelcome,
    formatOnboardingWelcome,
    formatAwaitingApiKeyHint,
    formatTradeConfirm,
    buildTradePayload,
} from "../utils/wallbit-messages.js";
import config from "../config/env.js";
import logger from "../utils/logger.js";

const GREETINGS = new Set([
    "hola", "hello", "hi", "buenas", "buenos dias", "buenos días",
    "buenas tardes", "buenas noches", "hey", "ola",
]);

const CONFIRM_YES = new Set(["si", "sí", "yes", "y", "1", "confirmar", "confirmo"]);
const CONFIRM_NO = new Set(["no", "n", "2", "cancelar", "cancel"]);

const CONNECT_ALIASES = new Set(["conectar", "connect", "config", "configurar", "vincular", "/vincular"]);
const MENU_COMMANDS = new Set(["menu", "menú", "start", "inicio", "help", "ayuda", "?"]);

/** Only treat input as an API key when it plausibly is one — not "hola" or "menu". */
function looksLikeApiKey(text) {
    const t = text.trim();
    if (t.length < 20 || /\s/.test(t)) return false;
    if (/^wlb_(live|test)_[A-Za-z0-9]+$/i.test(t)) return true;
    return /^[A-Za-z0-9_-]{24,}$/.test(t);
}

class ConversationManager {
    async handle(sock, jid, text, rawMessage) {
        const normalizedJid = normalizeJid(jid);
        const trimmed = text.trim();
        const lower = trimmed.toLowerCase();

        sessionManager.getOrCreate(normalizedJid);
        sessionManager.addToConversation(normalizedJid, "user", trimmed);

        const state = sessionManager.get(normalizedJid)?.state;

        if (state === SessionState.WAITING_API_KEY) {
            return this.handleWaitingApiKey(sock, normalizedJid, trimmed, lower, rawMessage);
        }
        if (state === SessionState.WAITING_SYMBOL) {
            return this.handleSymbolInput(sock, normalizedJid, trimmed);
        }
        if (state === SessionState.WAITING_AMOUNT) {
            return this.handleAmountInput(sock, normalizedJid, trimmed);
        }
        if (state === SessionState.WAITING_CONFIRMATION || state === SessionState.WAITING_CONFIRM_TRADE) {
            return this.handleTradeConfirmation(sock, normalizedJid, lower);
        }

        if (GREETINGS.has(lower)) {
            if (!sessionManager.hasApiKey(normalizedJid)) {
                return this.sendWelcome(sock, normalizedJid);
            }
            return this.reply(sock, normalizedJid, formatConnectedWelcome());
        }

        if (["conectar", "connect", "config", "configurar", "vincular"].includes(lower)) {
            if (!sessionManager.hasApiKey(normalizedJid)) {
                return this.startConnectFlow(sock, normalizedJid);
            }
            return this.reply(sock, normalizedJid, "✅ Ya tienes tu cuenta vinculada.\n\nEscribe *menu* para ver opciones o *saldo* para consultar.");
        }

        const command = findCommand(trimmed);
        if (command) {
            return this.runCommand(sock, normalizedJid, trimmed, rawMessage);
        }

        if (!sessionManager.hasApiKey(normalizedJid)) {
            await this.reply(sock, normalizedJid, formatOnboardingWelcome());
            return;
        }

        return this.handleNaturalLanguage(sock, normalizedJid, trimmed);
    }

    saveOutgoingFromCommand(jid) {
        // Commands send via sock directly — ensure dashboard sees activity
        getIo()?.emit("chat:update", messageService.getConversations());
    }

    async sendWelcome(sock, jid) {
        sessionManager.updateState(jid, SessionState.IDLE);
        await this.reply(sock, jid, formatOnboardingWelcome());
        this.emitSessionUpdate(jid);
    }

    async startConnectFlow(sock, jid) {
        sessionManager.updateState(jid, SessionState.WAITING_API_KEY);
        await this.reply(
            sock,
            jid,
            `🔐 *Vincular cuenta Wallbit*

Pega aquí tu *API Key* (X-API-Key).

🔒 La ciframos con AES-256-GCM.
🚫 Nunca la compartimos ni la mostramos.

Obtén tu clave en:
https://developer.wallbit.io/dashboard

_Escribe *cancelar* para volver al menú._`
        );
        this.emitSessionUpdate(jid, { event: "wallbit:awaiting_key" });
    }

    async handleWaitingApiKey(sock, jid, trimmed, lower, rawMessage) {
        if (CONFIRM_NO.has(lower)) {
            sessionManager.updateState(jid, SessionState.IDLE);
            await this.reply(sock, jid, formatOnboardingWelcome());
            this.emitSessionUpdate(jid, { event: "wallbit:cancelled" });
            return;
        }

        if (GREETINGS.has(lower)) {
            await this.reply(sock, jid, `${formatOnboardingWelcome()}\n\n${formatAwaitingApiKeyHint()}`);
            return;
        }

        if (CONNECT_ALIASES.has(lower)) {
            return this.startConnectFlow(sock, jid);
        }

        if (MENU_COMMANDS.has(lower)) {
            return this.runCommand(sock, jid, trimmed, rawMessage);
        }

        const command = findCommand(trimmed);
        if (command && (command.name === "menu" || command.name === "help")) {
            return this.runCommand(sock, jid, trimmed, rawMessage);
        }

        if (command) {
            await this.reply(
                sock,
                jid,
                "⏳ Primero vincula tu cuenta pegando tu *API Key*.\n\nEscribe *cancelar* para volver al menú."
            );
            return;
        }

        if (!looksLikeApiKey(trimmed)) {
            await this.reply(
                sock,
                jid,
                `🤔 Eso no parece una API Key.

${formatAwaitingApiKeyHint()}`
            );
            return;
        }

        return this.handleApiKeyInput(sock, jid, trimmed);
    }

    async runCommand(sock, jid, trimmed, rawMessage) {
        const command = findCommand(trimmed);
        if (!command) return;

        try {
            await command.execute({
                sock,
                from: jid,
                jid,
                text: trimmed,
                message: rawMessage,
                reply: (text) => this.reply(sock, jid, text),
            });
            this.saveOutgoingFromCommand(jid);
        } catch (err) {
            logger.error({ err: err.message, jid }, "Command error");
            await this.reply(sock, jid, `❌ Error: ${err.message}`);
        }
    }

    async handleApiKeyInput(sock, jid, apiKey) {
        const key = apiKey.trim();

        if (key.length < 10) {
            await this.reply(sock, jid, "❌ Esa clave parece incompleta. Pega tu API Key completa de Wallbit.");
            return;
        }

        await this.reply(sock, jid, "⏳ Validando tu API Key con Wallbit...");

        const result = await wallbit.validateApiKey(key);
        auditService.logApiCall(jid, "/balance/checking", result.status);

        if (!result.ok) {
            sessionManager.setApiKeyStatus(jid, API_KEY_STATUS.ERROR);
            await this.reply(
                sock,
                jid,
                `❌ *API Key inválida*

${result.message || "No pudimos autenticarnos con Wallbit."}

Verifica tu clave e inténtalo de nuevo.`
            );
            this.emitSessionUpdate(jid, { event: "wallbit:key_error", error: result.message });
            return;
        }

        sessionManager.saveApiKey(jid, key);
        sessionManager.recordQuery(jid, "connect");
        auditService.log("wallbit_connect", "Cuenta Wallbit conectada", { jid });

        await this.reply(sock, jid, formatConnectedWelcome());
        this.emitSessionUpdate(jid, { event: "wallbit:connected" });
        getIo()?.emit("wallbit:linked", { jid, linked: true });
    }

    async handleSymbolInput(sock, jid, symbol) {
        const clean = symbol.trim().toUpperCase().replace(/[^A-Z0-9.]/g, "");
        if (!clean) {
            await this.reply(sock, jid, "Indica un símbolo válido.\n\nEjemplos: *AAPL*, *SPY*, *TSLA*");
            return;
        }

        const { ok, apiKey } = sessionManager.requireApiKey(jid);
        if (!ok) return;

        await this.reply(sock, jid, `⏳ Consultando precio de *${clean}*...`);
        const assetRes = await wallbit.getAsset(apiKey, clean);
        auditService.logApiCall(jid, `/assets/${clean}`, assetRes.status);

        if (!assetRes.ok) {
            await this.reply(sock, jid, `❌ No encontré *${clean}*: ${assetRes.message}\n\nPrueba otro símbolo.`);
            return;
        }

        const asset = assetRes.data?.data ?? assetRes.data ?? {};
        const price = asset.price ?? asset.current_price;

        sessionManager.setPendingTrade(jid, {
            direction: "BUY",
            order_type: "MARKET",
            symbol: clean,
            priceNow: price,
        });
        sessionManager.updateState(jid, SessionState.WAITING_AMOUNT);

        const priceLine = price != null ? `\n💵 Precio actual: *$${Number(price).toFixed(2)}*` : "";
        await this.reply(sock, jid, `📈 *${clean}* — ${asset.name || "Activo"}${priceLine}\n\n¿Cuánto deseas invertir? (USD, ej: *100*)`);
        this.emitSessionUpdate(jid, { event: "trade:awaiting_amount" });
    }

    async handleAmountInput(sock, jid, amountText) {
        const amount = parseFloat(amountText.replace(/[^0-9.]/g, ""));
        if (!amount || amount <= 0) {
            await this.reply(sock, jid, "Indica un monto válido en USD.\n\nEjemplo: *100* o *250.50*");
            return;
        }

        const session = sessionManager.get(jid);
        const pending = session?.pendingTrade;
        if (!pending?.symbol) {
            sessionManager.updateState(jid, SessionState.CONNECTED);
            await this.reply(sock, jid, "Operación cancelada. Escribe *invertir* para comenzar de nuevo.");
            return;
        }

        const { ok, apiKey } = sessionManager.requireApiKey(jid);
        if (!ok) {
            await this.reply(sock, jid, "⚠️ Vincula tu cuenta primero con *vincular*.");
            return;
        }

        const fees = await wallbit.getFees(apiKey, { type: "TRADE" });
        auditService.logApiCall(jid, "/fees", fees.status);

        const tradePlan = {
            symbol: pending.symbol,
            direction: pending.direction || "BUY",
            order_type: pending.order_type || "MARKET",
            amount,
            currency: "USD",
            priceNow: pending.priceNow,
            fees: fees.ok ? fees.data : null,
            createdAt: new Date().toISOString(),
        };

        sessionManager.setPendingTrade(jid, tradePlan);
        sessionManager.updateState(jid, SessionState.WAITING_CONFIRMATION);

        await this.reply(sock, jid, formatTradeConfirm(tradePlan, fees.data));
        this.emitSessionUpdate(jid, { event: "trade:pending", pendingTrade: tradePlan });
        getIo()?.emit("trade:pending", { jid, pendingTrade: tradePlan });
    }

    async handleTradeConfirmation(sock, jid, answer) {
        if (CONFIRM_YES.has(answer)) {
            await this.executePendingTrade(sock, jid);
            return;
        }
        if (CONFIRM_NO.has(answer)) {
            sessionManager.clearPendingTrade(jid);
            sessionManager.updateState(jid, SessionState.CONNECTED);
            await this.reply(sock, jid, "❌ Operación cancelada. Tu dinero no se movió.");
            this.emitSessionUpdate(jid, { event: "trade:cancelled" });
            getIo()?.emit("trade:cancelled", { jid });
            return;
        }
        await this.reply(sock, jid, "Responde *SI* para confirmar o *NO* para cancelar.");
    }

    async executePendingTrade(sock, jid) {
        const plan = sessionManager.get(jid)?.pendingTrade;
        if (!plan) {
            sessionManager.updateState(jid, SessionState.CONNECTED);
            await this.reply(sock, jid, "No hay operación pendiente.");
            return;
        }

        const { ok, apiKey } = sessionManager.requireApiKey(jid);
        if (!ok) {
            await this.reply(sock, jid, "⚠️ Cuenta no conectada.");
            return;
        }

        await this.reply(sock, jid, "⏳ Ejecutando orden en Wallbit...");

        const payload = buildTradePayload({
            symbol: plan.symbol,
            direction: plan.direction || "BUY",
            amount: plan.amount,
            currency: plan.currency || "USD",
            orderType: plan.order_type || "MARKET",
        });

        const result = await wallbit.createTrade(apiKey, payload);
        auditService.logApiCall(jid, "/trades", result.status);

        sessionManager.clearPendingTrade(jid);
        sessionManager.updateState(jid, SessionState.CONNECTED);
        sessionManager.recordQuery(jid, `trade:${payload.direction}:${payload.symbol}`);

        if (!result.ok) {
            await this.reply(sock, jid, `❌ *Error al ejecutar*\n\n${result.message}`);
            this.emitSessionUpdate(jid, { event: "trade:error", error: result.message });
            getIo()?.emit("trade:error", { jid, error: result.message });
            return;
        }

        await this.reply(
            sock,
            jid,
            `✅ *¡Inversión ejecutada!*

🎯 ${payload.direction} *${payload.symbol}*
💵 ${payload.amount} USD
📦 Orden: ${payload.order_type}

Consulta tu *portafolio* para ver la posición actualizada.`
        );

        this.emitSessionUpdate(jid, { event: "trade:confirmed" });
        getIo()?.emit("trade:confirmed", { jid, plan: payload, result: { status: result.status } });
    }

    async startInvestFlow(sock, jid) {
        sessionManager.setPendingTrade(jid, { direction: "BUY", order_type: "MARKET" });
        sessionManager.updateState(jid, SessionState.WAITING_SYMBOL);
        await this.reply(
            sock,
            jid,
            `📈 *Invertir en Wallbit*

¿En qué activo deseas invertir?

Ejemplos: *AAPL*, *SPY*, *TSLA*, *MSFT*

_Escribe el símbolo del activo._`
        );
        this.emitSessionUpdate(jid, { event: "trade:awaiting_symbol" });
    }

    async handleNaturalLanguage(sock, jid, text) {
        const { ok, apiKey } = sessionManager.requireApiKey(jid);
        if (!ok) {
            await this.reply(sock, jid, formatOnboardingWelcome());
            return;
        }

        try {
            // Try AI worker if configured
            if (config.workerUrl && config.workerUrl !== "http://localhost:8787") {
                const session = sessionManager.get(jid);
                const history = session?.conversation || [];
                const res = await aiService.chat(jid, apiKey, text, history);

                if (res.ok && res.text) {
                    await this.reply(sock, jid, res.text);

                    const planTool = res.usedTools?.find((t) => t.name === "plan_investment");
                    if (planTool?.output?.symbol && planTool.output?.amount_usd) {
                        const tradePlan = {
                            symbol: planTool.output.symbol,
                            amount: planTool.output.amount_usd,
                            direction: "BUY",
                            order_type: "MARKET",
                            currency: "USD",
                            priceNow: planTool.output.price_now,
                        };
                        sessionManager.setPendingTrade(jid, tradePlan);
                        sessionManager.updateState(jid, SessionState.WAITING_CONFIRMATION);
                        await this.reply(sock, jid, formatTradeConfirm(tradePlan, null));
                    }
                    return;
                }
            }

            // Local fallback — real API only
            const local = await investmentService.handle(apiKey, text);
            if (local) {
                await this.reply(sock, jid, local);
                return;
            }

            await this.reply(sock, jid, formatConnectedWelcome());
        } catch (err) {
            logger.error({ err: err.message, jid }, "Natural language handler error");
            const fallback = await investmentService.handle(apiKey, text);
            await this.reply(sock, jid, fallback || `❌ Ocurrió un error: ${err.message}\n\nEscribe *menu* para ver opciones.`);
        }
    }

    async reply(sock, jid, text) {
        return botReply(sock, jid, text);
    }

    emitSessionUpdate(jid, extra = {}) {
        const session = sessionManager.get(jid);
        const payload = { ...sessionManager.toPublicView(session), ...extra };
        getIo()?.emit("session:update", payload);
        getIo()?.emit("user:state", { jid, state: session?.state });
    }
}

export default new ConversationManager();
