import { BaseCommand } from "./base.command.js";
import sessionManager from "../session/session.manager.js";
import { SessionState } from "../session/states.js";
import conversationManager from "../conversation/conversation.manager.js";

class ConfigCommand extends BaseCommand {
    constructor() {
        super("config", "Reconfigurar API Key", ["conectar", "connect", "configurar", "vincular", "/vincular"]);
    }

    async execute({ sock, from, jid }) {
        const id = jid || from;

        if (sessionManager.hasApiKey(id)) {
            sessionManager.removeApiKey(id);

            await sock.sendMessage(id, {
                text: "🔐 API Key anterior eliminada.\n\nPega tu nueva API Key de Wallbit:",
            });

            sessionManager.updateState(id, SessionState.WAITING_API_KEY);
            conversationManager.emitSessionUpdate(id, { event: "wallbit:awaiting_key" });
            return;
        }

        await conversationManager.startConnectFlow(sock, id);
    }
}

export default new ConfigCommand();
