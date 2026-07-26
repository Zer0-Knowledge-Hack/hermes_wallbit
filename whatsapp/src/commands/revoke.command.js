import { BaseCommand, requireWallbit } from "./base.command.js";
import wallbit from "../wallbit/wallbit.js";
import sessionManager from "../session/session.manager.js";
import auditService from "../services/audit.service.js";

class RevokeCommand extends BaseCommand {
    constructor() {
        super("revocar", "Revocar API Key en Wallbit", ["/revocar", "revoke", "/revoke"]);
    }

    async execute({ sock, from, jid }) {
        const id = jid || from;
        const apiKey = await requireWallbit(sock, id);
        if (!apiKey) return;

        auditService.log("revoke_key_start", "Intentando revocar clave", { jid: id });

        const result = await wallbit.revokeApiKey(apiKey);

        // Sin importar si Wallbit respondió 200 o error (ej. ya estaba revocada), eliminamos localmente.
        sessionManager.removeApiKey(id);

        if (!result.ok) {
            await sock.sendMessage(id, {
                text: `⚠️ No pude confirmar la revocación con el servidor de Wallbit (${result.message}), pero *he eliminado la clave de este chat*.\n\nPor seguridad, te sugiero verificar en la app de Wallbit → Settings → API Keys.`,
            });
            return;
        }

        auditService.log("revoke_key_success", "Clave revocada exitosamente", { jid: id });

        await sock.sendMessage(id, {
            text: `🗑️ *API Key Revocada*\n\nHe eliminado tu clave directamente en los servidores de Wallbit y he borrado el acceso en este chat.\n\nPara volver a utilizar el asistente, genera una nueva clave en la app y escribe *vincular*.`,
        });
    }
}

export default new RevokeCommand();
