import { BaseCommand, requireWallbit, recordQuery } from "./base.command.js";
import wallbit from "../wallbit/wallbit.js";
import auditService from "../services/audit.service.js";
import aiService from "../services/ai.service.js";

class AssetsCommand extends BaseCommand {
    constructor() {
        super("assets", "Listar activos disponibles", ["asset", "activos", "invertir", "/invertir", "invest"]);
    }

    async execute({ sock, from, jid, text }) {
        const id = jid || from;
        const apiKey = await requireWallbit(sock, id);
        if (!apiKey) return;

        const parts = text.trim().split(/\s+/);
        const symbol = parts.length > 1 ? parts[1].toUpperCase() : null;

        if (symbol) {
            const result = await wallbit.getAsset(apiKey, symbol);
            auditService.logApiCall(id, `/assets/${symbol}`, result.status);

            if (!result.ok) {
                await sock.sendMessage(id, { text: `❌ ${result.message}` });
                return;
            }

            recordQuery(id, `asset:${symbol}`);
            const explanation = await aiService.explainAsset(result.data);
            await sock.sendMessage(id, { text: explanation });
            return;
        }

        const result = await wallbit.getAssets(apiKey, { limit: 10 });
        auditService.logApiCall(id, "/assets", result.status);

        if (!result.ok) {
            await sock.sendMessage(id, { text: `❌ ${result.message}` });
            return;
        }

        recordQuery(id, "assets");

        const assets = result.data?.data || result.data || [];
        let response = "📈 *Activos disponibles* (top 10)\n\n";

        if (Array.isArray(assets) && assets.length) {
            for (const a of assets.slice(0, 10)) {
                response += `• ${a.symbol} — ${a.name || ""}\n`;
            }
            response += "\nUsa *asset SYMBOL* para ver detalle (ej: *asset AAPL*)";
        } else {
            response += "No se encontraron activos.";
        }

        await sock.sendMessage(id, { text: response });
    }
}

export default new AssetsCommand();
