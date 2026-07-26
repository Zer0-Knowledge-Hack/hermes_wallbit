/**
 * Formatea un monto monetario
 */
export function formatMoney(amount, currency = "USD") {
    const value = Number(amount) || 0;
    return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
    }).format(value);
}

/**
 * Formatea fecha relativa simple
 */
export function formatRelativeTime(date) {
    if (!date) return "Nunca";

    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return "Hace un momento";
    if (minutes < 60) return `Hace ${minutes} minuto${minutes > 1 ? "s" : ""}`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours} hora${hours > 1 ? "s" : ""}`;

    const days = Math.floor(hours / 24);
    return `Hace ${days} día${days > 1 ? "s" : ""}`;
}

/**
 * Trunca texto largo para WhatsApp
 */
export function truncate(text, max = 4000) {
    if (!text || text.length <= max) return text;
    return `${text.slice(0, max - 3)}...`;
}
