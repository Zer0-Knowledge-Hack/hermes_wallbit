import { BaseCommand } from "./base.command.js";

class HelpCommand extends BaseCommand {
    constructor() {
        super("help", "Ayuda completa", ["ayuda", "?"]);
    }

    async execute({ sock, from, jid }) {
        const id = jid || from;

        await sock.sendMessage(id, {
            text:
`📚 *Ayuda — Wallbit WhatsApp Assistant*

*Onboarding:*
• conectar — Vincular tu API Key de Wallbit (X-API-Key)

*Finanzas:*
• balance — Saldo checking
• portfolio — Portafolio de inversión
• transactions [filtro] — Transacciones
• assets — Listar activos
• asset SYMBOL — Detalle de activo
• wallet — Direcciones crypto
• account — Datos bancarios ACH/SEPA
• invest — Comprar activos (requiere confirmación SI/NO)

*Cuenta:*
• menu — Menú principal
• status — Estado de conexión
• config — Reconfigurar API Key
• disconnect — Desconectar Wallbit
• help — Esta ayuda

⚠️ Las operaciones financieras requieren confirmación explícita.
Nunca compartas tu API Key con terceros.`,
        });
    }
}

export default new HelpCommand();
