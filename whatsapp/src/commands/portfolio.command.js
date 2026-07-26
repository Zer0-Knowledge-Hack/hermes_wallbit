import { BaseCommand, requireWallbit, recordQuery } from "./base.command.js";
import wallbit from "../wallbit/wallbit.js";
import { formatMoney } from "../utils/format.js";
import auditService from "../services/audit.service.js";

class PortfolioCommand extends BaseCommand {
    constructor() {
        super("portfolio", "Ver portafolio de inversión", ["portafolio"]);
    }

    async execute({ sock, from, jid }) {
        const id = jid || from;
        const apiKey = await requireWallbit(sock, id);
        if (!apiKey) return;

        const result = await wallbit.getPortfolio(apiKey);
        auditService.logApiCall(id, "/balance/stocks", result.status);

        if (!result.ok) {
            await sock.sendMessage(id, { text: `❌ ${result.message}` });
            return;
        }

        recordQuery(id, "portfolio");

        const data = result.data?.data || result.data || {};
        const assets = data.assets || [];
        const usdBalance = data.usd_balance ?? 0;

        let text = `📊 *Portafolio de Inversión*\n\nSaldo USD: ${formatMoney(usdBalance)}\n\n`;

        if (assets.length) {
            text += "*Posiciones:*\n";
            for (const a of assets) {
                text += `• ${a.symbol || a.ticker}: ${a.shares || a.quantity || 0} acciones\n`;
            }
        } else {
            text += "No tienes posiciones abiertas.";
        }

        await sock.sendMessage(id, { text });
    }
}

export default new PortfolioCommand();
