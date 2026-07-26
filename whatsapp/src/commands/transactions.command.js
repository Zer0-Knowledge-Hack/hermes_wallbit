import { BaseCommand, requireWallbit, recordQuery, sendText } from "./base.command.js";
import wallbit from "../wallbit/wallbit.js";
import auditService from "../services/audit.service.js";
import { formatMoney } from "../utils/format.js";

class TransactionsCommand extends BaseCommand {
    constructor() {
        super("transactions", "Historial de transacciones", ["transacciones", "txs"]);
    }

    async execute(ctx) {
        const id = ctx.jid || ctx.from;
        const apiKey = await requireWallbit(ctx);
        if (!apiKey) return;

        const parts = ctx.text.trim().toLowerCase().split(/\s+/);
        const filter = parts[1] || "";
        const query = { limit: 10 };

        if (filter === "today" || filter === "hoy") {
            query.from_date = new Date().toISOString().split("T")[0];
        } else if (["pending", "completed", "failed"].includes(filter)) {
            query.status = filter.toUpperCase();
        }

        const result = await wallbit.getTransactions(apiKey, query);
        auditService.logApiCall(id, "/transactions", result.status);

        if (!result.ok) {
            await sendText(ctx, `❌ ${result.message}`);
            return;
        }

        recordQuery(id, "transactions");

        const txs = result.data?.data || result.data || [];
        let response = "📋 *Transacciones recientes*\n\n";

        if (Array.isArray(txs) && txs.length) {
            for (const tx of txs.slice(0, 10)) {
                const amount = tx.amount ? formatMoney(tx.amount, tx.currency || "USD") : "—";
                response += `• ${tx.type || tx.description || "TX"} — ${amount}\n  ${tx.status || ""} ${tx.created_at || tx.date || ""}\n\n`;
            }
        } else {
            response += "No hay transacciones para mostrar.";
        }

        response += "\nFiltros: *transactions today*, *pending*, *completed*, *failed*";

        await sendText(ctx, response);
    }
}

export default new TransactionsCommand();
