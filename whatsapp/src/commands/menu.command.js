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

Comandos en español:
• *saldo* — Tu saldo y cartera de inversión
• *invertir* — Explorar e invertir (con confirmación)
• *notificar* — Probar alerta proactiva (Zavudev SDK)
• *whatshat* — Estado del túnel y bot de WhatsApp
• *vincular* — Conectar tu cuenta de Wallbit
• *desvincular* — Desconectar de este chat
• *revocar* — Eliminar API Key definitivamente en Wallbit
• *reset* — Borrar historial de nuestra conversación

💡 _También puedes usar comandos en inglés o preguntarme lo que quieras en lenguaje natural._`,
        });
    }
}

export default new MenuCommand();
