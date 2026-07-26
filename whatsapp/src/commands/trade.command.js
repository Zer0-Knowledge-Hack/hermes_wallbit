import { BaseCommand, requireWallbit } from "./base.command.js";
import conversationManager from "../conversation/conversation.manager.js";
import auditService from "../services/audit.service.js";

class TradeCommand extends BaseCommand {
    constructor() {
        super("trade", "Invertir en un activo", ["invest", "invertir", "comprar"]);
    }

    async execute({ sock, from, jid, text }) {
        const id = jid || from;
        const apiKey = await requireWallbit(sock, id);
        if (!apiKey) return;

        auditService.log("trade_flow_start", text, { jid: id });

        await conversationManager.startInvestFlow(sock, id);
    }
}

export default new TradeCommand();
