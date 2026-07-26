import { BaseCommand, sendText } from "./base.command.js";
import sessionManager from "../session/session.manager.js";
import auditService from "../services/audit.service.js";

class ResetCommand extends BaseCommand {
    constructor() {
        super("reset", "Reiniciar historial de conversación", ["/reset", "reiniciar", "/reiniciar"]);
    }

    async execute(ctx) {
        const id = ctx.jid || ctx.from;

        sessionManager.update(id, { conversation: [] });
        auditService.log("reset_conversation", "Historial de conversación reiniciado", { jid: id });

        await sendText(ctx,
            `✨ *Historial reiniciado*\n\nListo, arrancamos de cero nuestra conversación. Puedes hacerme cualquier consulta o usar *menu*.`
        );
    }
}

export default new ResetCommand();
