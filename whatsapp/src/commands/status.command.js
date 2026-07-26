import { BaseCommand } from "./base.command.js";
import sessionManager from "../session/session.manager.js";
import authService from "../services/auth.service.js";
import { formatRelativeTime } from "../utils/format.js";

class StatusCommand extends BaseCommand {
    constructor() {
        super("status", "Estado de la cuenta", ["estado", "whatshat", "/whatshat", "whatsapp", "/whatsapp"]);
    }

    async execute({ sock, from, jid }) {
        const id = jid || from;
        const status = authService.getStatus(id);
        const session = sessionManager.get(id);

        await sock.sendMessage(id, {
            text:
`📱 *Estado de tu cuenta*

JID: ${session?.jid || id}

WhatsApp: Conectado ✅

Wallbit: ${status.wallbitConnected ? "Vinculado ✅" : "No vinculado ❌"}

Estado conversacional: ${status.state}

API Key: ${status.apiKeyStatus}

Última sincronización: ${formatRelativeTime(status.lastSync)}

Última consulta: ${session?.lastQuery || "—"}`,
        });
    }
}

export default new StatusCommand();
