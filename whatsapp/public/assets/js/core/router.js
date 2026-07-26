import { getPage, destroyCharts } from "../pages/pages.js";

const NAV = [
    { section: "WhatsApp", items: [
        { id: "whatsapp", icon: "bxl-whatsapp", label: "Conexión" },
        { id: "chats", icon: "bx-message-square-detail", label: "Chats" },
    ]},
    { section: "Overview", items: [
        { id: "dashboard", icon: "bx-home", label: "Dashboard" },
    ]},
    { section: "Finance", items: [
        { id: "wallbit", icon: "bx-wallet", label: "Wallbit" },
        { id: "portfolio", icon: "bx-line-chart", label: "Portfolio" },
        { id: "balances", icon: "bx-dollar-circle", label: "Balances" },
        { id: "assets", icon: "bx-bar-chart", label: "Assets" },
        { id: "markets", icon: "bx-trending-up", label: "Markets" },
        { id: "transactions", icon: "bx-transfer", label: "Transactions" },
        { id: "trade", icon: "bx-credit-card", label: "Trade Center" },
    ]},
    { section: "AI", items: [
        { id: "ai", icon: "bx-bot", label: "AI Assistant" },
        { id: "gemini", icon: "bx-brain", label: "Gemini" },
        { id: "keys", icon: "bx-key", label: "API Keys" },
    ]},
    { section: "System", items: [
        { id: "analytics", icon: "bx-chip", label: "Analytics" },
        { id: "logs", icon: "bx-history", label: "Logs" },
        { id: "settings", icon: "bx-cog", label: "Settings" },
        { id: "users", icon: "bx-user", label: "Users" },
    ]},
];

let currentPage = null;
let onNavigate = null;

export function initRouter(callback) {
    onNavigate = callback;
    window.addEventListener("hashchange", () => navigate(getHash(), true));

    if (!location.hash) {
        location.hash = "#/whatsapp";
    }
    navigate(getHash(), true);
}

function getHash() {
    const hash = location.hash.replace("#/", "") || "whatsapp";
    return NAV.flatMap((s) => s.items).some((i) => i.id === hash) ? hash : "whatsapp";
}

export async function navigate(pageId, fromHash = false) {
    const targetHash = `#/${pageId}`;

    if (!fromHash && location.hash !== targetHash) {
        location.hash = targetHash;
        return;
    }

    currentPage = pageId;

    document.querySelectorAll(".nav-link").forEach((el) => {
        el.classList.toggle("active", el.dataset.page === pageId);
    });

    const page = getPage(pageId);
    onNavigate?.(page);
    destroyCharts();

    const container = document.getElementById("page-content");
    if (!container) return;

    if (container._cleanup) {
        container._cleanup();
        container._cleanup = null;
    }

    container.innerHTML = `<div class="flex items-center justify-center py-20"><div class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div></div>`;

    try {
        await page.render(container);
    } catch (err) {
        console.error("Page render error:", err);
        container.innerHTML = `<div class="text-center py-20 text-danger"><i class="bx bx-error text-4xl mb-2"></i><p>${err.message}</p></div>`;
    }
}

export function getNav() {
    return NAV;
}

export function getCurrentPage() {
    return currentPage;
}

export function getCommands() {
    return NAV.flatMap((s) => s.items).map((i) => ({
        id: i.id,
        label: i.label,
        icon: i.icon,
        action: () => navigate(i.id),
    }));
}
