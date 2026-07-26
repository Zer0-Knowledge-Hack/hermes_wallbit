import { BaseCommand } from "./base.command.js";
import sessionManager from "../session/session.manager.js";

class MenuCommand extends BaseCommand {
    constructor() {
        super("menu", "Menú principal", ["start", "inicio"]);
    }

    async execute({ sock, from, jid }) {
        const id = jid || from;

        if (!sessionManager.hasApiKey(id)) {
            await sock.sendMessage(id, {
                text:
`👋 Bienvenido a Wallbit WhatsApp Assistant.

Para utilizar todas las funciones primero debes conectar tu cuenta Wallbit.

Escribe *conectar* para comenzar.`,
            });
            return;
        }

        await sock.sendMessage(id, {
            text:
`🤖 *Wallbit WhatsApp Assistant*

Comandos disponibles:

• *balance* — Saldo checking
• *portfolio* — Portafolio de inversión
• *transactions* — Historial de transacciones
• *assets* — Listar activos
• *asset SYMBOL* — Detalle de un activo
• *wallet* — Direcciones crypto
• *account* — Datos bancarios
• *invest* — Invertir (con confirmación)
• *status* — Estado de tu cuenta
• *config* — Reconfigurar API Key
• *disconnect* — Desconectar Wallbit
• *help* — Ayuda completa`,
        });
    }
}

export default new MenuCommand();
