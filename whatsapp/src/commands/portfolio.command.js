import { BaseCommand, requireWallbit, recordQuery, sendText } from "./base.command.js";
import wallbit from "../wallbit/wallbit.js";
import { formatPortfolioMessage } from "../utils/wallbit-messages.js";
import auditService from "../services/audit.service.js";

class PortfolioCommand extends BaseCommand {
    constructor() {
        super("portfolio", "Ver portafolio de inversión", ["portafolio", "cartera"]);
    }

    async execute(ctx) {
        const id = ctx.jid || ctx.from;
        const apiKey = await requireWallbit(ctx);
        if (!apiKey) return;

        await sendText(ctx, "⏳ Consultando tu cartera...");

        const result = await wallbit.getPortfolio(apiKey);
        auditService.logApiCall(id, "/balance/stocks", result.status);

        if (!result.ok) {
            await sendText(ctx, `❌ ${result.message}`);
            return;
        }

        recordQuery(id, "portfolio");
        await sendText(ctx, formatPortfolioMessage(result));
    }
}

export default new PortfolioCommand();
