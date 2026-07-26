import { BaseCommand, requireWallbit, recordQuery } from "./base.command.js";
import wallbit from "../wallbit/wallbit.js";
import auditService from "../services/audit.service.js";

class WalletCommand extends BaseCommand {
    constructor() {
        super("wallets", "Ver direcciones crypto", ["wallet"]);
    }

    async execute({ sock, from, jid }) {
        const id = jid || from;
        const apiKey = await requireWallbit(sock, id);
        if (!apiKey) return;

        const result = await wallbit.getWallets(apiKey);
        auditService.logApiCall(id, "/wallets", result.status);

        if (!result.ok) {
            await sock.sendMessage(id, { text: `❌ ${result.message}` });
            return;
        }

        recordQuery(id, "wallets");

        const wallets = result.data?.data || result.data || [];
        let text = "👛 *Wallets Crypto*\n\n";

        if (Array.isArray(wallets) && wallets.length) {
            for (const w of wallets) {
                text += `• ${w.currency || w.asset} (${w.network || "N/A"})\n  ${w.address || w.wallet_address || "—"}\n\n`;
            }
        } else {
            text += "No hay wallets configuradas.";
        }

        await sock.sendMessage(id, { text });
    }
}

export default new WalletCommand();
