import sessionManager from "../session/session.manager.js";

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

export async function requireWallbit(sock, jid) {
    const { ok, apiKey } = sessionManager.requireApiKey(jid);

    if (!ok) {
        await sock.sendMessage(jid, {
            text: "⚠️ Debes conectar tu cuenta Wallbit primero.\n\nEscribe *conectar* para vincularla.",
        });
        return null;
    }

    return apiKey;
}

export function recordQuery(jid, query) {
    sessionManager.recordQuery(jid, query);
}
