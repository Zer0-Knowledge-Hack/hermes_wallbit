import sessionManager from "../session/session.manager.js";
import { SessionState, API_KEY_STATUS } from "../session/states.js";
import wallbit from "../wallbit/wallbit.js";
import { findCommand } from "../commands/index.js";
import auditService from "../services/audit.service.js";
import messageService from "../services/message.service.js";
import aiService from "../services/ai.service.js";
import { getIo } from "../socket/index.js";
import { normalizeJid } from "../utils/phone.js";

const GREETINGS = new Set([
    "hola",
    "hello",
    "hi",
    "buenas",
    "buenos dias",
    "buenos días",
    "buenas tardes",
    "buenas noches",
    "hey",
]);

const CONFIRM_YES = new Set(["si", "sí", "yes", "y", "1", "confirmar", "confirmo"]);
const CONFIRM_NO = new Set(["no", "n", "2", "cancelar", "cancel"]);

/**
 * Routes inbound text by session state, then by command.
 * State machine ensures the next message is always interpreted correctly.
 */
class ConversationManager {
    async handle(sock, jid, text, rawMessage) {
        const normalizedJid = normalizeJid(jid);
        const trimmed = text.trim();
        const lower = trimmed.toLowerCase();

        sessionManager.getOrCreate(normalizedJid);
        sessionManager.addToConversation(normalizedJid, "user", trimmed);

        const state = sessionManager.get(normalizedJid)?.state;

        // State handlers take priority over free-form commands
        if (state === SessionState.WAITING_API_KEY) {
            return this.handleApiKeyInput(sock, normalizedJid, trimmed);
        }

        if (state === SessionState.WAITING_SYMBOL) {
            return this.handleSymbolInput(sock, normalizedJid, trimmed);
        }

        if (state === SessionState.WAITING_AMOUNT) {
            return this.handleAmountInput(sock, normalizedJid, trimmed);
        }

        if (
            state === SessionState.WAITING_CONFIRMATION ||
            state === SessionState.WAITING_CONFIRM_TRADE
        ) {
            return this.handleTradeConfirmation(sock, normalizedJid, lower);
        }

        // Greeting / first contact onboarding
        if (GREETINGS.has(lower) && !sessionManager.hasApiKey(normalizedJid)) {
            return this.sendWelcome(sock, normalizedJid);
        }

        // Explicit connect trigger
        if (
            ["conectar", "connect", "config", "configurar", "vincular"].includes(lower) &&
            !sessionManager.hasApiKey(normalizedJid)
        ) {
            return this.startConnectFlow(sock, normalizedJid);
        }

        const command = findCommand(trimmed);

        if (command) {
            await command.execute({
                sock,
                from: normalizedJid,
                jid: normalizedJid,
                text: trimmed,
                message: rawMessage,
            });
            return;
        }

        // Unconnected user — guide to connect
        if (!sessionManager.hasApiKey(normalizedJid)) {
            await this.reply(sock, normalizedJid, "👋 Escribe *vincular* (o *conectar*) para conectar tu cuenta Wallbit.");
            return;
        }

        return this.handleWithAi(sock, normalizedJid, trimmed);
    }

    async sendWelcome(sock, jid) {
        sessionManager.updateState(jid, SessionState.IDLE);

        await this.reply(
            sock,
            jid,
            `Bienvenido.

Para comenzar necesito conectar tu cuenta Wallbit.

Escribe:

*conectar*`
        );

        this.emitSessionUpdate(jid);
    }

    async startConnectFlow(sock, jid) {
        sessionManager.updateState(jid, SessionState.WAITING_API_KEY);

        await this.reply(
            sock,
            jid,
            `Perfecto.

Pega aquí tu API Key de Wallbit.

La almacenaremos cifrada.

Nunca será compartida.

Obtén tu clave en:
https://developer.wallbit.io/dashboard`
        );

        this.emitSessionUpdate(jid, { event: "wallbit:awaiting_key" });
    }

    async handleApiKeyInput(sock, jid, apiKey) {
        await this.reply(sock, jid, "Validando...");

        const result = await wallbit.validateApiKey(apiKey.trim());
        auditService.logApiCall(jid, "/balance/checking", result.status);

        if (!result.ok) {
            sessionManager.setApiKeyStatus(jid, API_KEY_STATUS.ERROR);

            await this.reply(
                sock,
                jid,
                `❌ ${result.message || "API Key inválida o expirada"}

Por favor verifica la clave e inténtalo nuevamente.`
            );

            this.emitSessionUpdate(jid, { event: "wallbit:key_error", error: result.message });
            return;
        }

        sessionManager.saveApiKey(jid, apiKey.trim());
        sessionManager.recordQuery(jid, "connect");

        dbInsertAudit(jid, "wallbit_connect", "Cuenta Wallbit conectada");

        await this.reply(
            sock,
            jid,
            `Cuenta conectada.

Ahora puedes utilizar:

*balance*

*portfolio*

*transactions*

*assets*

*wallet*

*invest*`
        );

        this.emitSessionUpdate(jid, { event: "wallbit:connected" });
        getIo()?.emit("wallbit:linked", { jid, linked: true });
    }

    async handleSymbolInput(sock, jid, symbol) {
        const clean = symbol.trim().toUpperCase().replace(/[^A-Z0-9.]/g, "");

        if (!clean) {
            await this.reply(sock, jid, "Indica un símbolo válido (ej: *AAPL*, *SPY*).");
            return;
        }

        const pending = sessionManager.get(jid)?.pendingTrade || { side: "buy" };
        sessionManager.setPendingTrade(jid, { ...pending, symbol: clean });
        sessionManager.updateState(jid, SessionState.WAITING_AMOUNT);

        await this.reply(sock, jid, `¿Cuánto deseas invertir en *${clean}*? (en USD, ej: 100)`);

        this.emitSessionUpdate(jid, { event: "trade:awaiting_amount" });
    }

    async handleAmountInput(sock, jid, amountText) {
        const amount = parseFloat(amountText.replace(/[^0-9.]/g, ""));

        if (!amount || amount <= 0) {
            await this.reply(sock, jid, "Indica un monto válido en USD (ej: 100).");
            return;
        }

        const session = sessionManager.get(jid);
        const pending = session?.pendingTrade;

        if (!pending?.symbol) {
            sessionManager.updateState(jid, SessionState.CONNECTED);
            await this.reply(sock, jid, "Operación cancelada. Escribe *invest* para comenzar de nuevo.");
            return;
        }

        const { ok, apiKey } = sessionManager.requireApiKey(jid);

        if (!ok) {
            await this.reply(sock, jid, "⚠️ Debes conectar tu cuenta Wallbit primero.");
            return;
        }

        const fees = await wallbit.getFees(apiKey, {
            side: pending.side || "buy",
            symbol: pending.symbol,
            amount,
            currency: "USD",
        });

        auditService.logApiCall(jid, "/fees", fees.status);

        const tradePlan = {
            side: pending.side || "buy",
            symbol: pending.symbol,
            amount,
            currency: "USD",
            fees: fees.ok ? fees.data : null,
            createdAt: new Date().toISOString(),
        };

        sessionManager.setPendingTrade(jid, tradePlan);
        sessionManager.updateState(jid, SessionState.WAITING_CONFIRMATION);

        const feeLine = fees.ok
            ? `\nComisión estimada: ${JSON.stringify(fees.data?.data ?? fees.data)}`
            : "";

        await this.reply(
            sock,
            jid,
            `📋 *Confirmar operación*

Compra: *${tradePlan.symbol}*
Monto: *$${amount.toFixed(2)} USD*${feeLine}

Responde *SI* para ejecutar o *NO* para cancelar.`
        );

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

            await this.reply(sock, jid, "❌ Operación cancelada.");

            this.emitSessionUpdate(jid, { event: "trade:cancelled" });
            getIo()?.emit("trade:cancelled", { jid });
            return;
        }

        await this.reply(sock, jid, "Responde *SI* para confirmar o *NO* para cancelar.");
    }

    async executePendingTrade(sock, jid) {
        const session = sessionManager.get(jid);
        const plan = session?.pendingTrade;

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

        await this.reply(sock, jid, "⏳ Ejecutando operación...");

        const result = await wallbit.createTrade(apiKey, {
            side: plan.side,
            symbol: plan.symbol,
            amount: plan.amount,
            currency: plan.currency,
        });

        auditService.logApiCall(jid, "/trades", result.status);

        sessionManager.clearPendingTrade(jid);
        sessionManager.updateState(jid, SessionState.CONNECTED);
        sessionManager.recordQuery(jid, `trade:${plan.side}:${plan.symbol}`);

        if (!result.ok) {
            await this.reply(sock, jid, `❌ Error al ejecutar: ${result.message}`);
            this.emitSessionUpdate(jid, { event: "trade:error", error: result.message });
            getIo()?.emit("trade:error", { jid, error: result.message });
            return;
        }

        await this.reply(
            sock,
            jid,
            `✅ Operación ejecutada.

${plan.side.toUpperCase()} *${plan.symbol}* — $${plan.amount.toFixed(2)} USD`
        );

        this.emitSessionUpdate(jid, { event: "trade:confirmed" });
        getIo()?.emit("trade:confirmed", { jid, plan, result: { status: result.status } });
    }

    /** Starts the invest flow (buy) */
    async startInvestFlow(sock, jid) {
        sessionManager.setPendingTrade(jid, { side: "buy" });
        sessionManager.updateState(jid, SessionState.WAITING_SYMBOL);

        await this.reply(sock, jid, "📈 *Invertir*\n\n¿En qué activo deseas invertir? (ej: AAPL, SPY)");

        this.emitSessionUpdate(jid, { event: "trade:awaiting_symbol" });
    }

    async handleWithAi(sock, jid, text) {
        const { ok, apiKey } = sessionManager.requireApiKey(jid);
        if (!ok) {
            await this.reply(sock, jid, "👋 Escribe *vincular* (o *conectar*) para vincular tu cuenta Wallbit.");
            return;
        }

        const session = sessionManager.get(jid);
        const history = session?.conversation || [];

        await sock.sendMessage(jid, { text: "⏳ *Consultando con inteligencia artificial...*" });

        const res = await aiService.chat(jid, apiKey, text, history);

        await this.reply(sock, jid, res.text);

        const plan = res.usedTools?.find((tool) => tool.name === "plan_investment");
        if (plan && plan.output) {
            const output = plan.output;
            if (
                typeof output.symbol === "string" &&
                typeof output.amount_usd === "number" &&
                output.enough_balance !== false
            ) {
                const tradePlan = {
                    symbol: output.symbol,
                    amount: output.amount_usd,
                    side: "buy",
                    currency: "USD",
                };

                sessionManager.stageTrade(jid, tradePlan);
                sessionManager.updateState(jid, SessionState.WAITING_CONFIRMATION);

                await this.reply(
                    sock,
                    jid,
                    `📋 *Confirmar operación propuesta por IA*\n\nCompra: *${tradePlan.symbol}*\nMonto: *$${tradePlan.amount.toFixed(2)} USD*\nPrecio aprox.: *$${output.price_now || 0} USD*\n\nResponde *SI* para ejecutar o *NO* para cancelar.`
                );

                this.emitSessionUpdate(jid, { event: "trade:pending", pendingTrade: tradePlan });
                getIo()?.emit("trade:pending", { jid, pendingTrade: tradePlan });
            }
        }
    }

    async reply(sock, jid, text) {
        await sock.sendMessage(jid, { text });
        sessionManager.addToConversation(jid, "assistant", text);
        const saved = messageService.saveOutgoing(jid, text);
        getIo()?.emit("message:new", saved);
        getIo()?.emit("chat:update", messageService.getConversations());
    }

    emitSessionUpdate(jid, extra = {}) {
        const session = sessionManager.get(jid);
        const payload = { ...sessionManager.toPublicView(session), ...extra };
        getIo()?.emit("session:update", payload);
        getIo()?.emit("user:state", { jid, state: session?.state });
    }
}

function dbInsertAudit(jid, type, detail) {
    auditService.log(type, detail, { jid, whatsapp: sessionManager.get(jid)?.phone });
}

export default new ConversationManager();
