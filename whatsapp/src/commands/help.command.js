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

*Comandos en español (y alias en inglés):*

• *vincular* (o *conectar*, *config*) — Conectar tu cuenta Wallbit (API Key)
• *saldo* (o *balance*, *portfolio*) — Ver saldo en checking y posiciones en bolsa
• *invertir* (o *assets*, *invest*) — Consultar catálogo de inversión y crear órdenes
• *notificar* (o *notify*) — Enviar mensaje proactivo de prueba (Zavudev SDK)
• *whatshat* (o *whatsapp*, *status*) — Consultar estado del túnel local y servidor
• *desvincular* (o *desconectar*, *disconnect*) — Quitar acceso en WhatsApp (key intacta en Wallbit)
• *revocar* (o *revoke*) — Eliminar API Key definitivamente desde los servidores de Wallbit
• *reset* (o *reiniciar*) — Reiniciar el historial de nuestra conversación
• *menu* (o *inicio*, *start*) — Ver menú principal
• *help* (o *ayuda*, *?*) — Esta ayuda completa

*Comandos financieros adicionales (en inglés):*
• *transactions* [filtro] — Historial de transacciones
• *wallet* — Direcciones crypto
• *account* — Datos bancarios ACH/SEPA
• *asset SYMBOL* — Detalle de un activo

⚠️ Las operaciones financieras requieren confirmación explícita escribiendo SI.
Nunca compartas tu API Key con terceros.`,
        });
    }
}

export default new HelpCommand();
