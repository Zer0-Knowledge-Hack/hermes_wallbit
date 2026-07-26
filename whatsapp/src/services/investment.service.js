import wallbit from "../wallbit/wallbit.js";
import {
    formatBalanceMessage,
    formatPortfolioMessage,
    formatAssetMessage,
    buildTradePayload,
} from "../utils/wallbit-messages.js";

/**
 * Local handler — only returns text backed by real Wallbit API calls.
 * Used when the AI worker is unavailable.
 */
class InvestmentService {
    async handle(apiKey, text) {
        const lower = text.trim().toLowerCase();

        if (this.matches(lower, ["saldo", "balance", "cuanto tengo", "cuánto tengo", "disponible", "dinero"])) {
            const res = await wallbit.getBalance(apiKey);
            if (!res.ok) return `❌ No pude consultar tu saldo: ${res.message}`;
            return formatBalanceMessage(res);
        }

        if (this.matches(lower, ["portafolio", "portfolio", "cartera", "inversiones", "posiciones", "acciones"])) {
            const res = await wallbit.getPortfolio(apiKey);
            if (!res.ok) return `❌ No pude consultar tu cartera: ${res.message}`;
            return formatPortfolioMessage(res);
        }

        if (this.matches(lower, ["transacciones", "transactions", "movimientos", "historial"])) {
            const res = await wallbit.getTransactions(apiKey, { page: 1, limit: 5 });
            if (!res.ok) return `❌ No pude consultar transacciones: ${res.message}`;
            const txs = res.data?.data ?? res.data ?? [];
            if (!Array.isArray(txs) || !txs.length) {
                return "📋 No encontré transacciones recientes en tu cuenta.";
            }
            const lines = txs.slice(0, 5).map((t) => {
                const amt = t.amount != null ? `$${t.amount}` : "—";
                return `• ${t.type || t.description || "TX"} — ${amt} (${t.status || ""})`;
            });
            return `📋 *Últimas transacciones*\n\n${lines.join("\n")}`;
        }

        if (this.matches(lower, ["activos", "assets", "catalogo", "catálogo"])) {
            const res = await wallbit.getAssets(apiKey, { limit: 10 });
            if (!res.ok) return `❌ No pude listar activos: ${res.message}`;
            const assets = res.data?.data ?? res.data ?? [];
            if (!Array.isArray(assets) || !assets.length) return "No hay activos disponibles.";
            const lines = assets.slice(0, 10).map((a) => `• *${a.symbol}* — ${a.name || ""}`);
            return `📈 *Activos disponibles*\n\n${lines.join("\n")}\n\n_Para ver uno: *activo AAPL*_\n_Para invertir: *invertir*_`;
        }

        const assetMatch = lower.match(/(?:activo|asset|precio|cotizaci[oó]n|info)\s+([a-z0-9.]+)/i)
            || lower.match(/^([a-z]{1,5})$/i);
        if (assetMatch) {
            const symbol = assetMatch[1].toUpperCase();
            if (symbol.length >= 1 && symbol.length <= 6) {
                const res = await wallbit.getAsset(apiKey, symbol);
                if (!res.ok) return `❌ No encontré el activo *${symbol}*: ${res.message}`;
                return formatAssetMessage(res, symbol);
            }
        }

        if (this.matches(lower, ["invertir", "invest", "comprar", "recomienda", "recomendación", "recomendacion"])) {
            return `📈 *Invertir en Wallbit*

Para invertir de forma segura:

1️⃣ Escribe *invertir*
2️⃣ Indica el activo (ej: *AAPL*, *SPY*)
3️⃣ Indica el monto en USD
4️⃣ Confirma con *SI*

_Todas las cifras se consultan en tiempo real antes de ejecutar._`;
        }

        if (this.matches(lower, ["ayuda", "help", "menu", "menú", "comandos"])) {
            return null; // let command handler or menu take over
        }

        return `🤖 Puedo ayudarte con datos *reales* de tu cuenta:

• *saldo* — dinero disponible
• *portafolio* — tus posiciones
• *invertir* — comprar activos
• *activos* — catálogo
• *transacciones* — historial

Escribe uno de estos o *menu* para ver todas las opciones.`;
    }

    matches(text, keywords) {
        return keywords.some((k) => text.includes(k));
    }

    buildTradePayload(plan) {
        return buildTradePayload({
            symbol: plan.symbol,
            direction: plan.direction || (plan.side === "sell" ? "SELL" : "BUY"),
            amount: plan.amount,
            currency: plan.currency || "USD",
            orderType: plan.order_type || "MARKET",
        });
    }
}

export default new InvestmentService();
