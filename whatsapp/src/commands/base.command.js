import sessionManager from "../session/session.manager.js";
import { sendText } from "../utils/bot-reply.js";

/**
 * Base class for WhatsApp commands
 */
export class BaseCommand {
    constructor(name, description, aliases = []) {
        this.name = name;
        this.description = description;
        this.aliases = aliases;
    }

    matches(text) {
        const cmd = text.trim().toLowerCase();
        const first = cmd.split(/\s+/)[0];
        return first === this.name || this.aliases.includes(first);
    }

    async execute(ctx) {
        throw new Error("execute() must be implemented");
    }
}

export async function requireWallbit(ctx) {
    const id = ctx.jid || ctx.from;
    const { ok, apiKey } = sessionManager.requireApiKey(id);

    if (!ok) {
        await sendText(ctx, "⚠️ Debes conectar tu cuenta Wallbit primero.\n\nEscribe *vincular* para conectarla.");
        return null;
    }

    return apiKey;
}

export { sendText };

export function recordQuery(jid, query) {
    sessionManager.recordQuery(jid, query);
}
