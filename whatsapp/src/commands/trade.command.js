import { BaseCommand, requireWallbit } from "./base.command.js";
import conversationManager from "../conversation/conversation.manager.js";
import auditService from "../services/audit.service.js";

class TradeCommand extends BaseCommand {
    constructor() {
        super("trade", "Invertir en un activo", ["invest", "invertir", "comprar"]);
    }

    async execute(ctx) {
        const id = ctx.jid || ctx.from;
        const apiKey = await requireWallbit(ctx);
        if (!apiKey) return;

        auditService.log("trade_flow_start", ctx.text, { jid: id });

        await conversationManager.startInvestFlow(ctx.sock, id);
    }
}

export default new TradeCommand();
