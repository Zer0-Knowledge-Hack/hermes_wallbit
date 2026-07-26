import { BaseCommand, sendText } from "./base.command.js";
import sessionManager from "../session/session.manager.js";
import authService from "../services/auth.service.js";
import { getIo } from "../socket/index.js";

class DisconnectCommand extends BaseCommand {
    constructor() {
        super("disconnect", "Desconectar cuenta Wallbit", ["desconectar", "desvincular", "/desvincular"]);
    }

    async execute(ctx) {
        const id = ctx.jid || ctx.from;

        if (!sessionManager.hasApiKey(id)) {
            await sendText(ctx, "ℹ️ No tienes una cuenta Wallbit conectada.");
            return;
        }

        authService.disconnect(id);

        await sendText(ctx, "🔒 Tu cuenta Wallbit ha sido desconectada correctamente.");

        getIo()?.emit("wallbit:linked", { jid: id, linked: false });
        getIo()?.emit("session:update", sessionManager.toPublicView(sessionManager.get(id)));
    }
}

export default new DisconnectCommand();
