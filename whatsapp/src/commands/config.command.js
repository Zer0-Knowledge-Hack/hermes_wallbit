import { BaseCommand, sendText } from "./base.command.js";
import sessionManager from "../session/session.manager.js";
import { SessionState } from "../session/states.js";
import conversationManager from "../conversation/conversation.manager.js";

class ConfigCommand extends BaseCommand {
    constructor() {
        super("config", "Reconfigurar API Key", ["conectar", "connect", "configurar", "vincular", "/vincular"]);
    }

    async execute(ctx) {
        const id = ctx.jid || ctx.from;

        if (sessionManager.hasApiKey(id)) {
            sessionManager.removeApiKey(id);

            await sendText(ctx, "🔐 API Key anterior eliminada.\n\nPega tu nueva API Key de Wallbit:");

            sessionManager.updateState(id, SessionState.WAITING_API_KEY);
            conversationManager.emitSessionUpdate(id, { event: "wallbit:awaiting_key" });
            return;
        }

        await conversationManager.startConnectFlow(ctx.sock, id);
    }
}

export default new ConfigCommand();
