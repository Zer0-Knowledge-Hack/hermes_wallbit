import menuCommand from "./menu.command.js";
import balanceCommand from "./balance.command.js";
import portfolioCommand from "./portfolio.command.js";
import assetsCommand from "./assets.command.js";
import walletCommand from "./wallet.command.js";
import accountCommand from "./account.command.js";
import transactionsCommand from "./transactions.command.js";
import statusCommand from "./status.command.js";
import configCommand from "./config.command.js";
import disconnectCommand from "./disconnect.command.js";
import helpCommand from "./help.command.js";
import tradeCommand from "./trade.command.js";

export const commands = [
    menuCommand,
    balanceCommand,
    portfolioCommand,
    assetsCommand,
    walletCommand,
    accountCommand,
    transactionsCommand,
    statusCommand,
    configCommand,
    disconnectCommand,
    helpCommand,
    tradeCommand,
];

export function findCommand(text) {
    const trimmed = text.trim().toLowerCase();

    for (const cmd of commands) {
        if (cmd.matches(trimmed)) {
            return cmd;
        }
    }

    return null;
}

export default commands;
