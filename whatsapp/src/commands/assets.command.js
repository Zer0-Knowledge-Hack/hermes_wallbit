import { BaseCommand, requireWallbit, recordQuery, sendText } from "./base.command.js";
import wallbit from "../wallbit/wallbit.js";
import auditService from "../services/audit.service.js";
import { formatAssetMessage } from "../utils/wallbit-messages.js";

class AssetsCommand extends BaseCommand {
    constructor() {
        super("assets", "Listar activos disponibles", ["asset", "activos", "activo"]);
    }

    async execute(ctx) {
        const id = ctx.jid || ctx.from;
        const apiKey = await requireWallbit(ctx);
        if (!apiKey) return;

        const parts = ctx.text.trim().split(/\s+/);
        const symbol = parts.length > 1 ? parts[1].toUpperCase() : null;

        if (symbol) {
            const result = await wallbit.getAsset(apiKey, symbol);
            auditService.logApiCall(id, `/assets/${symbol}`, result.status);

            if (!result.ok) {
                await sendText(ctx, `❌ ${result.message}`);
                return;
            }

            recordQuery(id, `asset:${symbol}`);
            await sendText(ctx, formatAssetMessage(result, symbol));
            return;
        }

        const result = await wallbit.getAssets(apiKey, { limit: 10 });
        auditService.logApiCall(id, "/assets", result.status);

        if (!result.ok) {
            await sendText(ctx, `❌ ${result.message}`);
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

        await sendText(ctx, response);
    }
}

export default new AssetsCommand();
