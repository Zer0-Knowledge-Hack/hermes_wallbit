export function fmtMoney(n, currency = "USD") {
    const num = Number(n) || 0;
    return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(num);
}

export function fmtNumber(n) {
    return new Intl.NumberFormat("es-ES").format(Number(n) || 0);
}

export function fmtTime(d) {
    if (!d) return "—";
    return new Date(d).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

export function fmtUptime(s) {
    if (!s) return "—";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
}

export function fmtBytes(b) {
    if (!b) return "—";
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function escHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
}

/** WhatsApp-style formatting: *bold*, _italic_, line breaks */
export function formatWaText(text) {
    if (!text) return "";
    return escHtml(text)
        .replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>")
        .replace(/_([^_\n]+)_/g, "<em>$1</em>")
        .replace(/\n/g, "<br>");
}

export function skeleton(w = "w-full", h = "h-4") {
    return `<div class="skeleton ${w} ${h}"></div>`;
}
