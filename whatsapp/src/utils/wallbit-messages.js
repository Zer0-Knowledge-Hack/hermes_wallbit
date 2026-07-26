import { formatMoney } from "./format.js";

/** Build Wallbit POST /trades body */
export function buildTradePayload({ symbol, direction = "BUY", amount, currency = "USD", orderType = "MARKET" }) {
    return {
        symbol: String(symbol).toUpperCase(),
        direction: String(direction).toUpperCase(),
        currency,
        order_type: orderType,
        amount: Number(amount),
    };
}

export function buildFeesPayload(type = "TRADE") {
    return { type: String(type).toUpperCase() };
}

export function formatBalanceMessage(result) {
    const balances = result?.data?.data ?? result?.data ?? [];
    const lines = Array.isArray(balances)
        ? balances.map((b) => `  • *${b.currency || "USD"}:* ${formatMoney(b.amount ?? b.balance, b.currency || "USD")}`)
        : [`  • *USD:* ${formatMoney(balances.amount ?? 0)}`];

    return `💰 *Tu saldo disponible*

${lines.join("\n")}

_Este monto proviene de tu cuenta Wallbit en tiempo real._`;
}

export function formatPortfolioMessage(result) {
    const data = result?.data?.data ?? result?.data ?? {};
    const assets = data.assets ?? [];
    const usd = data.usd_balance ?? data.total_value ?? 0;

    let text = `📊 *Tu cartera de inversión*

💵 Efectivo USD: *${formatMoney(usd)}*

`;

    if (assets.length) {
        text += "*Posiciones abiertas:*\n";
        for (const a of assets) {
            const sym = a.symbol || a.ticker || "?";
            const qty = a.shares ?? a.quantity ?? 0;
            const val = a.market_value ?? a.value;
            text += val != null
                ? `  • *${sym}* — ${qty} acciones (${formatMoney(val)})\n`
                : `  • *${sym}* — ${qty} acciones\n`;
        }
    } else {
        text += "_No tienes posiciones abiertas. Puedes invertir escribiendo *invertir*._";
    }

    return text;
}

export function formatAssetMessage(result, symbol) {
    const asset = result?.data?.data ?? result?.data ?? {};
    const price = asset.price ?? asset.current_price ?? asset.last_price;
    const name = asset.name || symbol;

    return `📈 *${name}* (${symbol})

💵 Precio actual: *${price != null ? formatMoney(price) : "consulta en curso"}*
${asset.sector ? `🏷 Sector: ${asset.sector}\n` : ""}${asset.description ? `\n${String(asset.description).slice(0, 300)}` : ""}

_Para invertir escribe *invertir* y sigue los pasos._`;
}

export function formatConnectedWelcome() {
    return `✅ *¡Cuenta conectada!*

Ya puedes consultar e invertir con datos reales de Wallbit:

• *saldo* — dinero disponible
• *portafolio* — tus inversiones
• *invertir* — comprar activos (con confirmación)
• *activos* — catálogo disponible
• *transacciones* — historial
• *menu* — ver todos los comandos

💡 También puedes preguntarme en lenguaje natural, por ejemplo:
_"¿Cuánto tengo disponible?"_
_"Quiero invertir en Apple"_`;
}

export function formatTradeConfirm(plan, feesData) {
    const dir = (plan.direction || "BUY").toUpperCase() === "SELL" ? "Venta" : "Compra";
    let feeLine = "";
    const fees = feesData?.data?.data ?? feesData?.data ?? feesData;
    if (fees) {
        feeLine = `\n📋 Comisión: \`${JSON.stringify(fees)}\``;
    }

    return `📋 *Confirmar ${dir}*

🎯 Activo: *${plan.symbol}*
💵 Monto: *${formatMoney(plan.amount)}*
📦 Tipo: *${plan.order_type || "MARKET"}*${feeLine}

⚠️ Esta operación moverá dinero real.

Responde *SI* para ejecutar o *NO* para cancelar.`;
}

export function formatOnboardingWelcome() {
    return `👋 *¡Hola! Soy tu asistente de inversión Wallbit.*

Te ayudo a consultar e invertir con datos reales de tu cuenta.

📋 *Menú*
━━━━━━━━━━━━━━━━
🔐 *Conectar cuenta*
   Escribe *vincular* y pega tu API Key

💰 *Consultas*
   • *saldo* — dinero disponible
   • *portafolio* — tus posiciones
   • *transacciones* — historial
   • *activos* — catálogo

📈 *Inversión*
   • *invertir* — comprar (con confirmación)

❓ *Ayuda*
   • *menu* — ver este menú
   • *ayuda* — guía completa

👉 Para empezar escribe *vincular*`;
}

export function formatAwaitingApiKeyHint() {
    return `📎 *Esperando tu API Key*

Pega aquí la clave de Wallbit (header *X-API-Key*).

Obténla en:
https://developer.wallbit.io/dashboard

• *menu* — ver menú
• *cancelar* — volver al inicio`;
}
