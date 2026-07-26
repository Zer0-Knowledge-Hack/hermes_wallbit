import { BaseCommand, requireWallbit, recordQuery } from "./base.command.js";
import wallbit from "../wallbit/wallbit.js";
import { formatMoney } from "../utils/format.js";
import auditService from "../services/audit.service.js";
import { getIo } from "../socket/index.js";

class BalanceCommand extends BaseCommand {
    constructor() {
        super("balance", "Consultar saldo checking", ["saldo", "/saldo", "/balance"]);
    }

    async execute({ sock, from, jid }) {
        const id = jid || from;
        const apiKey = await requireWallbit(sock, id);
        if (!apiKey) return;

        const result = await wallbit.getBalance(apiKey);
        auditService.logApiCall(id, "/balance/checking", result.status);

        if (!result.ok) {
            await sock.sendMessage(id, { text: `❌ ${result.message}` });
            return;
        }

        recordQuery(id, "balance");

        const balances = result.data?.data || result.data || [];
        const lines = Array.isArray(balances)
            ? balances.map((b) => `• ${b.currency || "USD"}: ${formatMoney(b.amount || b.balance, b.currency || "USD")}`)
            : [`• USD: ${formatMoney(balances.amount || 0)}`];

        await sock.sendMessage(id, {
            text: `💰 *Saldo Checking*\n\n${lines.join("\n")}`,
        });

        getIo()?.emit("balance:updated", { jid: id, endpoint: "/balance/checking" });
    }
}

export default new BalanceCommand();
