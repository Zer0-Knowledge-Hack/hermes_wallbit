import { BaseCommand, requireWallbit, recordQuery } from "./base.command.js";
import wallbit from "../wallbit/wallbit.js";
import auditService from "../services/audit.service.js";

class AccountCommand extends BaseCommand {
    constructor() {
        super("account", "Datos bancarios de la cuenta", ["cuenta"]);
    }

    async execute({ sock, from, jid }) {
        const id = jid || from;
        const apiKey = await requireWallbit(sock, id);
        if (!apiKey) return;

        const result = await wallbit.getAccount(apiKey);
        auditService.logApiCall(id, "/account-details", result.status);

        if (!result.ok) {
            await sock.sendMessage(id, { text: `❌ ${result.message}` });
            return;
        }

        recordQuery(id, "account");

        const data = result.data?.data || result.data || {};
        let text = "🏦 *Detalles de Cuenta*\n\n";

        if (data.account_number || data.iban) {
            if (data.beneficiary_name) text += `Beneficiario: ${data.beneficiary_name}\n`;
            if (data.bank_name) text += `Banco: ${data.bank_name}\n`;
            if (data.account_number) text += `Cuenta: ${data.account_number}\n`;
            if (data.routing_number) text += `Routing (ACH): ${data.routing_number}\n`;
            if (data.iban) text += `IBAN (SEPA): ${data.iban}\n`;
            if (data.swift) text += `SWIFT: ${data.swift}\n`;
        } else {
            text += JSON.stringify(data, null, 2).slice(0, 1500);
        }

        await sock.sendMessage(id, { text });
    }
}

export default new AccountCommand();
