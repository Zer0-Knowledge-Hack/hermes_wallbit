import { escHtml } from "./utils.js";

export function kpiCard({ icon, label, value, change, color = "primary" }) {
    const colors = {
        primary: "text-primary-light",
        success: "text-success",
        warning: "text-warning",
        danger: "text-danger",
    };

    return `
    <div class="kpi-card animate-fade-in">
      <div class="flex items-start justify-between relative z-10">
        <div>
          <p class="text-xs text-muted uppercase tracking-wider mb-1">${escHtml(label)}</p>
          <p class="text-2xl font-bold ${colors[color] || colors.primary}">${value}</p>
          ${change ? `<p class="text-xs text-muted mt-1">${escHtml(change)}</p>` : ""}
        </div>
        <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <i class="bx ${icon} text-xl text-primary-light"></i>
        </div>
      </div>
    </div>`;
}

export function statusBadge(status) {
    const map = {
        online: ["badge-success", "Online"],
        connected: ["badge-success", "Conectado"],
        ready: ["badge-success", "Listo"],
        offline: ["badge-danger", "Offline"],
        disconnected: ["badge-danger", "Desconectado"],
        error: ["badge-danger", "Error"],
        unconfigured: ["badge-warning", "Sin configurar"],
        valid: ["badge-success", "Válida"],
        expired: ["badge-danger", "Expirada"],
    };
    const [cls, label] = map[status] || ["badge-muted", status || "—"];
    return `<span class="${cls}">${label}</span>`;
}

export function pageHeader(title, subtitle, actions = "") {
    return `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 animate-fade-in">
      <div>
        <h2 class="text-2xl font-bold">${escHtml(title)}</h2>
        ${subtitle ? `<p class="text-muted text-sm mt-1">${escHtml(subtitle)}</p>` : ""}
      </div>
      ${actions ? `<div class="flex items-center gap-2">${actions}</div>` : ""}
    </div>`;
}

export function emptyState(icon, title, desc) {
    return `
    <div class="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
      <div class="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
        <i class="bx ${icon} text-3xl text-muted"></i>
      </div>
      <h3 class="font-semibold text-lg mb-1">${escHtml(title)}</h3>
      <p class="text-muted text-sm max-w-sm">${escHtml(desc)}</p>
    </div>`;
}

export function loadingGrid(count = 4) {
    return `<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">${Array(count).fill('<div class="kpi-card"><div class="skeleton h-16"></div></div>').join("")}</div>`;
}

export function dataCard(title, content, meta = "") {
    return `
    <div class="glass-card p-5 animate-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold text-sm">${escHtml(title)}</h3>
        ${meta}
      </div>
      ${content}
    </div>`;
}

export function renderTable(headers, rows) {
    if (!rows?.length) return emptyState("bx-data", "Sin datos", "No hay registros para mostrar.");
    return `
    <div class="overflow-x-auto">
      <table class="data-table">
        <thead><tr>${headers.map((h) => `<th>${escHtml(h)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>`;
}
