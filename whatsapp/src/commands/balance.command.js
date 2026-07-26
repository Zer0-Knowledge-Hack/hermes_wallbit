import { BaseCommand, requireWallbit, recordQuery, sendText } from "./base.command.js";
import wallbit from "../wallbit/wallbit.js";
import { formatBalanceMessage } from "../utils/wallbit-messages.js";
import auditService from "../services/audit.service.js";
import { getIo } from "../socket/index.js";

class BalanceCommand extends BaseCommand {
    constructor() {
        super("balance", "Consultar saldo checking", ["saldo", "/saldo", "/balance"]);
    }

    async execute(ctx) {
        const id = ctx.jid || ctx.from;
        const apiKey = await requireWallbit(ctx);
        if (!apiKey) return;

        await sendText(ctx, "⏳ Consultando tu saldo...");

        const result = await wallbit.getBalance(apiKey);
        auditService.logApiCall(id, "/balance/checking", result.status);

        if (!result.ok) {
            await sendText(ctx, `❌ ${result.message}`);
            return;
        }

        recordQuery(id, "balance");
        await sendText(ctx, formatBalanceMessage(result));
        getIo()?.emit("balance:updated", { jid: id, endpoint: "/balance/checking" });
    }
}

export default new BalanceCommand();
