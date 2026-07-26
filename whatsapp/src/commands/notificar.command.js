import { BaseCommand, requireWallbit } from "./base.command.js";
import auditService from "../services/audit.service.js";

class NotificarCommand extends BaseCommand {
    constructor() {
        super("notificar", "Probar alerta proactiva (Zavudev SDK)", ["/notificar", "notify", "/notify"]);
    }

    async execute({ sock, from, jid }) {
        const id = jid || from;
        const apiKey = await requireWallbit(sock, id);
        if (!apiKey) return;

        auditService.log("test_notification", "Prueba de notificación proactiva enviada", { jid: id });

        await sock.sendMessage(id, {
            text: `🔔 *Alerta Proactiva de Prueba (Zavudev SDK)*\n\n📢 Simulación de evento en tu cuenta Wallbit:\n• *Dividendo Recibido:* +$4.50 USD de SPY en tu checking.\n• *Alerta de Mercado:* AAPL superó tu objetivo (+3.2% hoy).\n\n💡 _Este comando verifica que el canal de WhatsApp está listo para recibir notificaciones en segundo plano y alarmas proactivas._`,
        });
    }
}

export default new NotificarCommand();
