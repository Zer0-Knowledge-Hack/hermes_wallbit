import { BaseCommand, sendText } from "./base.command.js";
import sessionManager from "../session/session.manager.js";
import { formatConnectedWelcome, formatOnboardingWelcome } from "../utils/wallbit-messages.js";

class MenuCommand extends BaseCommand {
    constructor() {
        super("menu", "Menú principal", ["start", "inicio", "menú"]);
    }

    async execute(ctx) {
        const id = ctx.jid || ctx.from;
        const text = sessionManager.hasApiKey(id)
            ? formatConnectedWelcome()
            : formatOnboardingWelcome();

        await sendText(ctx, text);
    }
}

export default new MenuCommand();
