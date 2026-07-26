import { get, post, put, del } from "../core/api.js";
import { Toast } from "../core/toast.js";
import { fmtMoney, fmtTime, fmtUptime, fmtBytes, fmtNumber, escHtml, formatWaText } from "../core/utils.js";
import { kpiCard, statusBadge, pageHeader, emptyState, loadingGrid, dataCard, renderTable } from "../core/components.js";
import { onWhatsAppState, getSocket, onChatMessage, onChatUpdate } from "../core/socket.js";

let chartInstances = {};

function destroyCharts() {
    Object.values(chartInstances).forEach((c) => c?.destroy?.());
    chartInstances = {};
}

export const pages = {
    whatsapp: { title: "Conexión WhatsApp", breadcrumb: "WhatsApp", render: renderWhatsApp },
    chats: { title: "Chats", breadcrumb: "Chats", render: renderChats },
    dashboard: { title: "Dashboard", breadcrumb: "Overview", render: renderDashboard },
    wallbit: { title: "Wallbit", breadcrumb: "Wallbit", render: renderWallbit },
    portfolio: { title: "Portfolio", breadcrumb: "Portfolio", render: () => renderWallbitSection("portfolio") },
    balances: { title: "Balances", breadcrumb: "Balances", render: () => renderWallbitSection("balances") },
    assets: { title: "Assets", breadcrumb: "Assets", render: () => renderWallbitSection("assets") },
    markets: { title: "Markets", breadcrumb: "Markets", render: renderMarkets },
    transactions: { title: "Transactions", breadcrumb: "Transactions", render: () => renderWallbitSection("transactions") },
    trade: { title: "Trade Center", breadcrumb: "Trade", render: renderTradeCenter },
    ai: { title: "AI Assistant", breadcrumb: "AI", render: renderAI },
    gemini: { title: "Gemini", breadcrumb: "Gemini", render: renderGemini },
    keys: { title: "API Keys", breadcrumb: "Keys", render: renderApiKeys },
    analytics: { title: "Analytics", breadcrumb: "Analytics", render: renderAnalytics },
    logs: { title: "Logs", breadcrumb: "Logs", render: renderLogs },
    settings: { title: "Settings", breadcrumb: "Settings", render: renderSettings },
    users: { title: "Users", breadcrumb: "Users", render: renderUsers },
};

export function getPage(name) {
    return pages[name] || pages.dashboard;
}

async function renderDashboard(container) {
    destroyCharts();
    container.innerHTML = loadingGrid(8);

    try {
        const { data: kpis } = await get("/dashboard/kpis");
        const { data: activity } = await get("/dashboard/activity");

        container.innerHTML = `
        ${pageHeader("Dashboard", "Enterprise overview — Wallbit AI Platform")}
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          ${kpiCard({ icon: "bx-dollar-circle", label: "Balance", value: fmtMoney(kpis.balance), color: "success" })}
          ${kpiCard({ icon: "bx-line-chart", label: "Portfolio", value: fmtMoney(kpis.portfolioValue), color: "primary" })}
          ${kpiCard({ icon: "bx-trending-up", label: "ROI", value: `${kpis.roi}%`, change: "Calculado en tiempo real" })}
          ${kpiCard({ icon: "bx-bar-chart", label: "Assets", value: fmtNumber(kpis.assets) })}
          ${kpiCard({ icon: "bx-transfer", label: "Transactions", value: fmtNumber(kpis.transactions) })}
          ${kpiCard({ icon: "bx-server", label: "API Status", value: statusBadge(kpis.apiStatus), change: kpis.apiLatency ? `${kpis.apiLatency}ms` : "" })}
          ${kpiCard({ icon: "bx-brain", label: "AI Usage", value: fmtNumber(kpis.aiUsage), change: `${fmtNumber(kpis.aiTokens)} tokens` })}
          ${kpiCard({ icon: "bx-user", label: "Users", value: fmtNumber(kpis.users?.total || 0), change: `${kpis.users?.connected || 0} vinculados` })}
        </div>
        <div class="glass-card p-5">
          <h3 class="font-semibold mb-4">Actividad reciente</h3>
          ${renderTable(["Tipo", "Detalle", "Usuario", "Fecha"], (activity || []).slice(0, 8).map((a) => [
              escHtml(a.type), escHtml((a.detail || "").slice(0, 40)), escHtml(a.whatsapp || a.jid || "—"), fmtTime(a.created_at || a.timestamp),
          ]))}
        </div>`;
    } catch (err) {
        container.innerHTML = emptyState("bx-error", "Error cargando dashboard", err.message);
        Toast.error(err.message);
    }
}

async function renderWallbit(container) {
    container.innerHTML = `${pageHeader("Wallbit", "Integración completa con la API REST")}<div id="wallbit-grid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${loadingGrid(6)}</div>`;
    await loadWallbitCards(document.getElementById("wallbit-grid"), ["balance", "portfolio", "wallets", "transactions", "account", "assets"]);
}

async function renderWallbitSection(section) {
    return async (container) => {
        container.innerHTML = pageHeader(section.charAt(0).toUpperCase() + section.slice(1), "Datos en tiempo real de Wallbit");
        const grid = document.createElement("div");
        grid.className = "grid grid-cols-1 md:grid-cols-2 gap-4";
        grid.innerHTML = loadingGrid(2);
        container.appendChild(grid);
        await loadWallbitCards(grid, [section === "balances" ? "balance" : section]);
    };
}

async function loadWallbitCards(container, sections) {
    const endpoints = {
        balance: { path: "/wallbit/balance", title: "Checking Balance", icon: "bx-dollar-circle" },
        portfolio: { path: "/wallbit/portfolio", title: "Portfolio", icon: "bx-line-chart" },
        wallets: { path: "/wallbit/wallets", title: "Wallets", icon: "bx-wallet" },
        transactions: { path: "/wallbit/transactions", title: "Transactions", icon: "bx-transfer" },
        account: { path: "/wallbit/account", title: "Account Details", icon: "bx-credit-card" },
        assets: { path: "/wallbit/assets?limit=5", title: "Assets", icon: "bx-bar-chart" },
    };

    container.innerHTML = "";

    for (const key of sections) {
        const ep = endpoints[key];
        const card = document.createElement("div");
        card.className = "glass-card p-5 animate-fade-in";
        card.innerHTML = `<div class="flex items-center gap-3 mb-4"><i class="bx ${ep.icon} text-xl text-primary-light"></i><h3 class="font-semibold">${ep.title}</h3><span class="ml-auto skeleton w-16 h-5" id="meta-${key}"></span></div><div id="body-${key}" class="skeleton h-24"></div>`;
        container.appendChild(card);

        try {
            const start = Date.now();
            const res = await get(ep.path);
            const latency = Date.now() - start;
            document.getElementById(`meta-${key}`).innerHTML = `<span class="badge-success">${latency}ms</span>`;
            document.getElementById(`body-${key}`).innerHTML = `<pre class="text-xs text-muted overflow-auto max-h-48 font-mono">${escHtml(JSON.stringify(res.data, null, 2).slice(0, 800))}</pre>`;
        } catch (err) {
            document.getElementById(`meta-${key}`).innerHTML = statusBadge("error");
            document.getElementById(`body-${key}`).innerHTML = `<p class="text-danger text-sm">${escHtml(err.message)}</p>`;
        }
    }
}

async function renderMarkets(container) {
    container.innerHTML = pageHeader("Markets", "Rates y mercados en tiempo real");
    try {
        const res = await get("/wallbit/rates");
        container.innerHTML += dataCard("Rates", `<pre class="text-xs font-mono text-muted overflow-auto">${escHtml(JSON.stringify(res.data, null, 2))}</pre>`, statusBadge("online"));
    } catch (err) {
        container.innerHTML += emptyState("bx-line-chart", "Markets no disponibles", err.message);
    }
}

async function renderTradeCenter(container) {
    container.innerHTML = `
    ${pageHeader("Trade Center", "Operaciones con confirmación obligatoria")}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="glass-card p-6">
        <h3 class="font-semibold mb-4 flex items-center gap-2"><i class="bx bx-transfer text-primary-light"></i> Nueva operación</h3>
        <form id="tradeForm" class="space-y-4">
          <div><label class="text-xs text-muted block mb-1">Side</label><select id="tradeSide" class="input-field"><option value="buy">Comprar</option><option value="sell">Vender</option></select></div>
          <div><label class="text-xs text-muted block mb-1">Symbol</label><input id="tradeSymbol" class="input-field" placeholder="AAPL" required></div>
          <div><label class="text-xs text-muted block mb-1">Amount (USD)</label><input id="tradeAmount" type="number" class="input-field" placeholder="100" required></div>
          <button type="button" id="btnPreview" class="btn-primary w-full"><i class="bx bx-show"></i> Vista previa</button>
        </form>
        <div id="tradePreview" class="mt-4 hidden glass-card p-4 border border-warning/30">
          <p class="text-sm text-warning mb-3">⚠️ Revisa antes de confirmar</p>
          <pre id="previewData" class="text-xs font-mono text-muted mb-4"></pre>
          <div class="flex gap-2">
            <button id="btnConfirm" class="btn-primary flex-1"><i class="bx bx-check"></i> Confirmar</button>
            <button id="btnCancel" class="btn-ghost flex-1">Cancelar</button>
          </div>
        </div>
      </div>
      <div class="glass-card p-6"><h3 class="font-semibold mb-4">Historial</h3><div id="tradeHistory" class="text-muted text-sm">Sin operaciones recientes</div></div>
    </div>`;

    let previewPayload = null;

    document.getElementById("btnPreview").onclick = async () => {
        previewPayload = {
            side: document.getElementById("tradeSide").value,
            symbol: document.getElementById("tradeSymbol").value.toUpperCase(),
            amount: parseFloat(document.getElementById("tradeAmount").value),
            currency: "USD",
        };
        try {
            const res = await post("/wallbit/trade/preview", previewPayload);
            document.getElementById("previewData").textContent = JSON.stringify(res.data, null, 2);
            document.getElementById("tradePreview").classList.remove("hidden");
        } catch (err) {
            Toast.error(err.message);
        }
    };

    document.getElementById("btnConfirm").onclick = async () => {
        if (!previewPayload) return;
        try {
            const res = await post("/wallbit/trade/execute", { ...previewPayload, confirmed: true });
            Toast.success("Operación ejecutada");
            document.getElementById("tradePreview").classList.add("hidden");
            document.getElementById("tradeHistory").innerHTML = `<pre class="text-xs font-mono">${escHtml(JSON.stringify(res.data, null, 2))}</pre>`;
        } catch (err) {
            Toast.error(err.message);
        }
    };

    document.getElementById("btnCancel").onclick = () => {
        document.getElementById("tradePreview").classList.add("hidden");
        previewPayload = null;
    };
}

async function renderAI(container) {
    container.innerHTML = `
    <div class="flex h-[calc(100vh-8rem)] gap-4 animate-fade-in">
      <div class="w-64 shrink-0 glass-card p-4 flex flex-col hidden lg:flex">
        <button id="newChat" class="btn-primary w-full mb-4"><i class="bx bx-plus"></i> Nueva conversación</button>
        <div id="convList" class="flex-1 overflow-y-auto space-y-1 text-sm text-muted"></div>
      </div>
      <div class="flex-1 glass-card flex flex-col">
        <div class="p-4 border-b border-border"><h3 class="font-semibold flex items-center gap-2"><i class="bx bx-bot text-primary-light"></i> AI Assistant</h3></div>
        <div id="chatMessages" class="flex-1 overflow-y-auto p-4 space-y-4"></div>
        <div class="p-4 border-t border-border">
          <form id="chatForm" class="flex gap-2">
            <input id="chatInput" class="input-field flex-1" placeholder="Pregunta sobre tu portafolio, activos..." autocomplete="off">
            <button type="submit" class="btn-primary"><i class="bx bx-send"></i></button>
          </form>
        </div>
      </div>
    </div>`;

    let conversationId = null;
    const msgs = document.getElementById("chatMessages");

    function addMsg(role, content) {
        const div = document.createElement("div");
        div.className = `flex ${role === "user" ? "justify-end" : "justify-start"}`;
        div.innerHTML = `<div class="max-w-[80%] px-4 py-3 rounded-2xl text-sm ${role === "user" ? "bg-primary text-white" : "bg-surface border border-border"}">${escHtml(content)}</div>`;
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
    }

    document.getElementById("chatForm").onsubmit = async (e) => {
        e.preventDefault();
        const input = document.getElementById("chatInput");
        const message = input.value.trim();
        if (!message) return;
        addMsg("user", message);
        input.value = "";
        addMsg("assistant", "Pensando...");
        try {
            const res = await post("/ai/chat", { message, conversationId });
            conversationId = res.data.conversationId;
            msgs.lastChild.remove();
            addMsg("assistant", res.data.reply);
        } catch (err) {
            msgs.lastChild.remove();
            addMsg("assistant", `Error: ${err.message}`);
        }
    };

    document.getElementById("newChat").onclick = () => {
        conversationId = null;
        msgs.innerHTML = "";
    };
}

async function renderGemini(container) {
    const [{ data: config }, { data: models }] = await Promise.all([get("/gemini/config"), get("/gemini/models")]);

    container.innerHTML = `
    ${pageHeader("Gemini", "Configuración de IA generativa")}
    <div class="flex gap-2 mb-6 border-b border-border pb-2">
      <button class="tab-btn active" data-tab="config">Configuración</button>
      <button class="tab-btn" data-tab="prompt">Prompt Engineering</button>
      <button class="tab-btn" data-tab="models">Modelos</button>
    </div>
    <div id="geminiContent"></div>`;

    const tabs = { config: () => renderGeminiConfig(config), prompt: () => renderGeminiPrompt(config), models: () => renderGeminiModels(models) };
    let active = "config";

    function showTab(name) {
        active = name;
        container.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
        document.getElementById("geminiContent").innerHTML = tabs[name]();
        bindGeminiEvents();
    }

    container.querySelectorAll(".tab-btn").forEach((b) => b.onclick = () => showTab(b.dataset.tab));
    showTab("config");

    function bindGeminiEvents() {
        document.getElementById("saveGeminiKey")?.addEventListener("click", async () => {
            const key = document.getElementById("geminiKeyInput").value;
            try {
                await post("/gemini/key", { apiKey: key });
                Toast.success("API Key guardada");
            } catch (err) { Toast.error(err.message); }
        });
        document.getElementById("validateGemini")?.addEventListener("click", async () => {
            try {
                const res = await post("/gemini/validate", {});
                Toast.success(res.message || "Válida");
            } catch (err) { Toast.error(err.message); }
        });
        document.getElementById("savePrompt")?.addEventListener("click", async () => {
            try {
                await put("/gemini/config", {
                    systemPrompt: document.getElementById("systemPrompt").value,
                    temperature: parseFloat(document.getElementById("temperature").value),
                    topP: parseFloat(document.getElementById("topP").value),
                    topK: parseInt(document.getElementById("topK").value, 10),
                    streaming: document.getElementById("streaming").checked,
                    thinkingMode: document.getElementById("thinkingMode").checked,
                });
                Toast.success("Prompt guardado");
            } catch (err) { Toast.error(err.message); }
        });
        document.getElementById("resetPrompt")?.addEventListener("click", async () => {
            await post("/gemini/prompt/reset", {});
            Toast.info("Prompt restaurado");
            showTab("prompt");
        });
    }

    function renderGeminiConfig(cfg) {
        return `<div class="glass-card p-6 max-w-xl space-y-4">
          <div><label class="text-xs text-muted">API Key</label><input id="geminiKeyInput" type="password" class="input-field mt-1" placeholder="${cfg.hasKey ? "••••••••" : "AIza..."}"></div>
          <div class="flex gap-2"><button id="saveGeminiKey" class="btn-primary"><i class="bx bx-key"></i> Guardar</button><button id="validateGemini" class="btn-ghost"><i class="bx bx-check-shield"></i> Validar</button></div>
          <div><label class="text-xs text-muted">Modelo</label><select id="geminiModel" class="input-field mt-1">${models.map((m) => `<option value="${m.id}" ${cfg.model === m.id ? "selected" : ""}>${m.name}</option>`).join("")}</select></div>
        </div>`;
    }

    function renderGeminiPrompt(cfg) {
        return `<div class="glass-card p-6 space-y-4">
          <div><label class="text-xs text-muted">System Prompt</label><textarea id="systemPrompt" class="input-field mt-1 h-32 font-mono text-xs">${escHtml(cfg.systemPrompt || "")}</textarea></div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><label class="text-xs text-muted">Temperature</label><input id="temperature" type="number" step="0.1" class="input-field mt-1" value="${cfg.temperature}"></div>
            <div><label class="text-xs text-muted">Top P</label><input id="topP" type="number" step="0.05" class="input-field mt-1" value="${cfg.topP}"></div>
            <div><label class="text-xs text-muted">Top K</label><input id="topK" type="number" class="input-field mt-1" value="${cfg.topK}"></div>
            <div class="flex items-end gap-4"><label class="flex items-center gap-2 text-sm"><input id="streaming" type="checkbox" ${cfg.streaming ? "checked" : ""}> Streaming</label><label class="flex items-center gap-2 text-sm"><input id="thinkingMode" type="checkbox" ${cfg.thinkingMode ? "checked" : ""}> Thinking</label></div>
          </div>
          <div class="flex gap-2"><button id="savePrompt" class="btn-primary">Guardar</button><button id="resetPrompt" class="btn-ghost">Restaurar</button></div>
        </div>`;
    }

    function renderGeminiModels(models) {
        return renderTable(["Modelo", "Contexto", "Velocidad", "Costo", "Capacidad"], models.map((m) => [m.name, m.context, m.speed, m.cost, m.capability]));
    }
}

async function renderApiKeys(container) {
    container.innerHTML = `${pageHeader("API Keys", "Gestión segura de credenciales", `<button id="addKeyBtn" class="btn-primary"><i class="bx bx-plus"></i> Agregar</button>`)}<div id="keysTable">${loadingGrid(1)}</div>`;

    async function load() {
        const { data } = await get("/keys");
        document.getElementById("keysTable").innerHTML = renderTable(
            ["Proveedor", "Label", "Key", "Estado", "Último uso", "Acciones"],
            data.map((k) => [
                escHtml(k.provider), escHtml(k.label), `<code class="text-xs">${escHtml(k.masked)}</code>`,
                statusBadge(k.status), fmtTime(k.last_used),
                `<button class="btn-ghost text-xs validate-key" data-id="${k.id}"><i class="bx bx-check-shield"></i></button>
                 <button class="btn-ghost text-xs delete-key" data-id="${k.id}"><i class="bx bx-trash text-danger"></i></button>`,
            ])
        );
        document.querySelectorAll(".validate-key").forEach((b) => b.onclick = async () => {
            try { const r = await post(`/keys/${b.dataset.id}/validate`, {}); Toast.success(r.message || "OK"); } catch (e) { Toast.error(e.message); }
        });
        document.querySelectorAll(".delete-key").forEach((b) => b.onclick = async () => {
            await del(`/keys/${b.dataset.id}`); Toast.success("Eliminada"); load();
        });
    }

    document.getElementById("addKeyBtn").onclick = () => showKeyModal(load);
    await load();
}

function showKeyModal(onSave) {
    const modal = document.getElementById("modal");
    document.getElementById("modalTitle").textContent = "Agregar API Key";
    document.getElementById("modalBody").innerHTML = `
    <div class="space-y-4">
      <div><label class="text-xs text-muted">Proveedor</label><select id="keyProvider" class="input-field mt-1">
        ${["wallbit","gemini","openai","claude","deepseek","groq","mistral","openrouter","perplexity"].map((p) => `<option value="${p}">${p}</option>`).join("")}
      </select></div>
      <div><label class="text-xs text-muted">Label</label><input id="keyLabel" class="input-field mt-1"></div>
      <div><label class="text-xs text-muted">API Key</label><input id="keyValue" type="password" class="input-field mt-1"></div>
      <button id="saveKeyBtn" class="btn-primary w-full">Guardar</button>
    </div>`;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    document.getElementById("saveKeyBtn").onclick = async () => {
        try {
            await post("/keys", { provider: document.getElementById("keyProvider").value, label: document.getElementById("keyLabel").value, apiKey: document.getElementById("keyValue").value });
            modal.classList.add("hidden");
            modal.classList.remove("flex");
            Toast.success("API Key registrada");
            onSave?.();
        } catch (err) { Toast.error(err.message); }
    };
}

async function renderAnalytics(container) {
    destroyCharts();
    container.innerHTML = pageHeader("Analytics", "Métricas de rendimiento") + loadingGrid(2);
    try {
        const { data } = await get("/analytics/overview");
        container.innerHTML = `
        ${pageHeader("Analytics", "Métricas de rendimiento")}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div class="glass-card p-5"><h3 class="font-semibold mb-4">Actividad diaria</h3><div id="apexActivity"></div></div>
          <div class="glass-card p-5"><h3 class="font-semibold mb-4">API por endpoint</h3><canvas id="chartEndpoints" height="200"></canvas></div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          ${kpiCard({ icon: "bx-user", label: "Usuarios", value: fmtNumber(data.summary.totalUsers) })}
          ${kpiCard({ icon: "bx-link", label: "Vinculados", value: fmtNumber(data.summary.linkedUsers), color: "success" })}
          ${kpiCard({ icon: "bx-brain", label: "AI Requests", value: fmtNumber(data.summary.aiRequests) })}
          ${kpiCard({ icon: "bx-chip", label: "Tokens", value: fmtNumber(data.summary.aiTokens) })}
        </div>`;

        if (window.ApexCharts) {
            chartInstances.apex = new ApexCharts(document.getElementById("apexActivity"), {
                chart: { type: "area", height: 250, background: "transparent", foreColor: "#9CA3AF" },
                series: [{ name: "Activity", data: data.activity.map((a) => a.count) }],
                xaxis: { categories: data.activity.map((a) => a.date) },
                colors: ["#1677FF"],
                stroke: { curve: "smooth" },
                fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05 } },
                grid: { borderColor: "#30363D" },
            });
            chartInstances.apex.render();
        }

        const epCtx = document.getElementById("chartEndpoints");
        if (epCtx && window.Chart) {
            chartInstances.endpoints = new Chart(epCtx, {
                type: "bar",
                data: { labels: data.apiByEndpoint.map((e) => e.endpoint.slice(0, 20)), datasets: [{ data: data.apiByEndpoint.map((e) => e.count), backgroundColor: "#1677FF" }] },
                options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#9CA3AF" } }, y: { ticks: { color: "#9CA3AF" } } } },
            });
        }
    } catch (err) {
        container.innerHTML = emptyState("bx-bar-chart", "Error", err.message);
    }
}

async function renderLogs(container) {
    container.innerHTML = `${pageHeader("Logs", "Auditoría del sistema", `<button id="exportLogs" class="btn-ghost"><i class="bx bx-download"></i> Exportar</button>`)}<div class="mb-4"><input id="logSearch" class="input-field max-w-sm" placeholder="Buscar logs..."></div><div id="logsTable">${loadingGrid(1)}</div>`;

    async function load(search = "") {
        const { data } = await get(`/logs?limit=100${search ? `&search=${encodeURIComponent(search)}` : ""}`);
        document.getElementById("logsTable").innerHTML = renderTable(
            ["Tipo", "Servicio", "Usuario", "Mensaje", "Fecha"],
            data.map((l) => [escHtml(l.type), "wallbit", escHtml(l.whatsapp || l.jid || "—"), escHtml((l.detail || "").slice(0, 60)), fmtTime(l.created_at || l.timestamp)])
        );
    }

    document.getElementById("logSearch").oninput = (e) => load(e.target.value);
    document.getElementById("exportLogs").onclick = () => window.open("/api/logs/export", "_blank");
    await load();
}

async function renderSettings(container) {
    const { data } = await get("/settings");
    const tabs = ["general", "appearance", "notifications", "security"];
    container.innerHTML = `
    ${pageHeader("Settings", "Configuración del sistema")}
    <div class="flex gap-2 mb-6 flex-wrap">${tabs.map((t) => `<button class="tab-btn settings-tab" data-tab="${t}">${t}</button>`).join("")}</div>
    <div id="settingsContent" class="glass-card p-6 max-w-2xl"></div>`;

    function show(tab) {
        container.querySelectorAll(".settings-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
        const s = data[tab] || {};
        document.getElementById("settingsContent").innerHTML = Object.entries(s).map(([k, v]) =>
            `<div class="mb-4"><label class="text-xs text-muted capitalize">${k}</label><input class="input-field mt-1 settings-input" data-key="${k}" value="${escHtml(String(v))}"></div>`
        ).join("") + `<button id="saveSettings" class="btn-primary" data-tab="${tab}">Guardar</button>`;
        document.getElementById("saveSettings").onclick = async () => {
            const payload = {};
            document.querySelectorAll(".settings-input").forEach((i) => { payload[i.dataset.key] = i.value; });
            await put(`/settings/${tab}`, payload);
            Toast.success("Guardado");
        };
    }

    container.querySelectorAll(".settings-tab").forEach((b) => b.onclick = () => show(b.dataset.tab));
    show("general");
}

async function renderUsers(container) {
    container.innerHTML = `${pageHeader("Users", "Sesiones WhatsApp / Wallbit")}<div class="mb-4 flex gap-2"><input id="userSearch" class="input-field max-w-xs" placeholder="Buscar..."><select id="userState" class="input-field max-w-xs"><option value="">Todos los estados</option><option>CONNECTED</option><option>IDLE</option><option>WAITING_API_KEY</option></select></div><div id="usersTable">${loadingGrid(1)}</div>`;

    async function load() {
        const search = document.getElementById("userSearch")?.value || "";
        const state = document.getElementById("userState")?.value || "";
        const { data } = await get(`/users?search=${encodeURIComponent(search)}&state=${state}`);
        document.getElementById("usersTable").innerHTML = renderTable(
            ["Avatar", "WhatsApp", "JID", "Estado", "Wallbit", "API Key", "Última actividad"],
            data.map((u) => [
                `<div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">${(u.phone || "?").slice(-2)}</div>`,
                escHtml(u.phone), `<code class="text-xs">${escHtml(u.jid || "")}</code>`,
                escHtml(u.state), u.wallbitLinked ? "✅" : "❌", statusBadge(u.apiKeyStatus), fmtTime(u.lastActivity),
            ])
        );
    }

    document.getElementById("userSearch").oninput = load;
    document.getElementById("userState").onchange = load;
    await load();
}

function waStatusBadge(status) {
    if (status === "connected") return statusBadge("connected");
    if (status === "qr") return `<span class="badge-warning">Esperando QR</span>`;
    return statusBadge("disconnected");
}

async function renderWhatsApp(container) {
    let unsub = null;

    container.innerHTML = `
    ${pageHeader("Conexión WhatsApp", "Escanea el QR con tu teléfono para vincular Baileys")}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="glass-card p-6 text-center">
        <h3 class="font-semibold mb-4 flex items-center justify-center gap-2"><i class="bx bxl-whatsapp text-success text-xl"></i> Código QR</h3>
        <div id="waQrArea" class="min-h-[280px] flex items-center justify-center">
          <div class="text-muted"><i class="bx bx-loader-alt animate-spin text-4xl"></i><p class="mt-2 text-sm">Cargando...</p></div>
        </div>
        <div class="flex flex-wrap gap-2 justify-center mt-6">
          <button id="btnWaRestart" class="btn-primary"><i class="bx bx-rotate-right"></i> Reiniciar sesión</button>
          <button id="btnWaReset" class="btn-danger"><i class="bx bx-trash"></i> Borrar datos</button>
        </div>
        <p class="text-xs text-muted mt-3">
          <strong class="text-white/70">Reiniciar sesión</strong>: borra datos y genera nuevo QR •
          <strong class="text-white/70">Borrar datos</strong>: limpia auth/data sin reiniciar
        </p>
      </div>
      <div class="glass-card p-6">
        <h3 class="font-semibold mb-4">Estado de sesión</h3>
        <div class="space-y-3 text-sm">
          <div class="flex justify-between py-2 border-b border-border/50"><span class="text-muted">Estado</span><span id="waStatus">${statusBadge("disconnected")}</span></div>
          <div class="flex justify-between py-2 border-b border-border/50"><span class="text-muted">Número</span><span id="waPhone">—</span></div>
          <div class="flex justify-between py-2 border-b border-border/50"><span class="text-muted">Nombre</span><span id="waName">—</span></div>
          <div class="flex justify-between py-2"><span class="text-muted">Conectado desde</span><span id="waSince">—</span></div>
        </div>
        <div class="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/20 text-xs text-muted">
          <p><strong class="text-white">1.</strong> Abre WhatsApp en tu teléfono</p>
          <p class="mt-1"><strong class="text-white">2.</strong> Ve a Dispositivos vinculados → Vincular dispositivo</p>
          <p class="mt-1"><strong class="text-white">3.</strong> Escanea el código QR</p>
        </div>
      </div>
    </div>`;

    // Always reset UI to a clean disconnected state first to avoid stale data
    // from a previous session being shown while the fresh fetch is in-flight.
    const CLEAN_STATE = { status: "disconnected", phone: null, name: null, connectedAt: null, qr: null };

    function updateUI(data) {
        document.getElementById("waStatus").innerHTML = waStatusBadge(data.status);
        document.getElementById("waPhone").textContent = data.phone || "—";
        document.getElementById("waName").textContent = data.name || "—";
        document.getElementById("waSince").textContent = data.connectedAt ? fmtTime(data.connectedAt) : "—";

        const qrArea = document.getElementById("waQrArea");
        if (data.status === "connected") {
            qrArea.innerHTML = `<div class="py-12"><i class="bx bx-check-circle text-success text-6xl"></i><p class="mt-4 font-semibold text-success">Conectado</p><p class="text-muted text-sm mt-1">${escHtml(data.phone || "")}</p></div>`;
        } else if (data.qr) {
            qrArea.innerHTML = `<img src="${data.qr}" alt="QR WhatsApp" class="mx-auto max-w-[260px] rounded-xl border border-border shadow-glow">`;
        } else if (data.status === "qr") {
            qrArea.innerHTML = `<div class="text-muted py-12"><i class="bx bx-loader-alt animate-spin text-4xl"></i><p class="mt-2">Generando QR...</p></div>`;
        } else {
            qrArea.innerHTML = `<div class="text-muted py-12"><i class="bx bx-qr text-6xl opacity-30"></i><p class="mt-2">Esperando conexión...</p><p class="text-xs mt-2">Pulsa "Reiniciar sesión" para generar un nuevo QR</p></div>`;
        }
    }

    // Show clean slate immediately, then fetch fresh state from server
    updateUI(CLEAN_STATE);

    try {
        const { data } = await get("/whatsapp");
        updateUI(data);
    } catch (err) {
        Toast.error(err.message);
    }

    unsub = onWhatsAppState(updateUI);

    // Reiniciar sesión: wipes auth/data AND starts fresh (new QR)
    document.getElementById("btnWaRestart").onclick = async () => {
        if (!confirm("¿Reiniciar sesión? Se borrarán los datos de autenticación y se generará un nuevo QR.")) return;
        const btn = document.getElementById("btnWaRestart");
        btn.disabled = true;
        try {
            updateUI(CLEAN_STATE);
            await post("/whatsapp/reset", {});
            Toast.info("Reiniciando sesión — espera el nuevo QR...");
        } catch (err) {
            Toast.error(err.message);
        } finally {
            btn.disabled = false;
        }
    };

    // Borrar datos: clears auth/data folders without immediately starting a new session
    document.getElementById("btnWaReset").onclick = async () => {
        if (!confirm("¿Borrar todos los datos de sesión (auth y data)? La sesión actual se cerrará.")) return;
        const btn = document.getElementById("btnWaReset");
        btn.disabled = true;
        try {
            updateUI(CLEAN_STATE);
            await post("/whatsapp/reset", {});
            Toast.info("Datos borrados. Generando nuevo QR...");
        } catch (err) {
            Toast.error(err.message);
        } finally {
            btn.disabled = false;
        }
    };

    container._cleanup = () => unsub?.();
}


async function renderChats(container) {
    let currentJid = null;
    let currentPhone = null;
    let currentDeliveryJid = null;
    const seenMsgIds = new Set();

    container.innerHTML = `
    ${pageHeader("Chats", "Conversaciones de WhatsApp en tiempo real")}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-12rem)]">
      <div class="glass-card p-0 flex flex-col overflow-hidden lg:col-span-1">
        <div class="p-4 border-b border-border"><input id="chatSearch" class="input-field" placeholder="Buscar chat..."></div>
        <div id="chatList" class="flex-1 overflow-y-auto"></div>
      </div>
      <div class="glass-card p-0 flex flex-col overflow-hidden lg:col-span-2 bg-[#0b141a]">
        <div id="chatHeader" class="p-4 border-b border-border/50 font-semibold bg-[#202c33]">Selecciona un chat</div>
        <div id="chatMessages" class="flex-1 overflow-y-auto p-4 space-y-2 bg-[#0b141a]" style="background-image:url('data:image/svg+xml,%3Csvg width=\\'60\\' height=\\'60\\' viewBox=\\'0 0 60 60\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'none\\' fill-rule=\\'evenodd\\'%3E%3Cg fill=\\'%23ffffff\\' fill-opacity=\\'0.02\\'%3E%3Cpath d=\\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E');"></div>
        <div id="chatInputWrap" class="p-3 border-t border-border/50 hidden bg-[#202c33]">
          <form id="chatSendForm" class="flex gap-2 items-center">
            <input id="chatMsgInput" class="input-field flex-1 !bg-[#2a3942] !border-none" placeholder="Escribe un mensaje..." autocomplete="off">
            <button type="submit" class="btn-primary !rounded-full w-10 h-10 flex items-center justify-center p-0"><i class="bx bx-send"></i></button>
          </form>
        </div>
      </div>
    </div>`;

    async function loadChats() {
        const { data } = await get("/conversations");
        renderChatList(data);
    }

    function renderChatList(chats) {
        const list = document.getElementById("chatList");
        const q = document.getElementById("chatSearch")?.value?.toLowerCase() || "";
        const filtered = (chats || []).filter((c) =>
            (c.name || c.whatsapp || "").toLowerCase().includes(q) ||
            (c.jid || "").includes(q)
        );

        if (!filtered.length) {
            list.innerHTML = emptyState("bx-message-square-dots", "Sin chats", "Conecta WhatsApp y espera mensajes entrantes.");
            return;
        }

        list.innerHTML = filtered.map((c) => `
          <div class="chat-item px-4 py-3 border-b border-border/50 cursor-pointer hover:bg-white/5 transition-colors ${currentJid === c.jid ? 'bg-primary/10' : ''}" data-jid="${escHtml(c.jid || '')}" data-phone="${escHtml(c.whatsapp || '')}" data-delivery="${escHtml(c.delivery_jid || c.jid || '')}">
            <div class="flex justify-between items-start gap-2">
              <span class="font-medium text-sm truncate">${escHtml(c.name || c.whatsapp)}</span>
              <span class="text-xs text-muted shrink-0">${fmtTime(c.last_timestamp)}</span>
            </div>
            <p class="text-xs text-muted truncate mt-1">${escHtml((c.last_message || "").replace(/\n/g, " ").slice(0, 80))}</p>
          </div>
        `).join("");

        list.querySelectorAll(".chat-item").forEach((el) => {
            el.onclick = () => openChat(el.dataset.jid, el.dataset.phone, el.dataset.delivery);
        });
    }

    function matchesCurrentChat(msg) {
        if (!currentJid) return false;
        return msg.jid === currentJid || msg.whatsapp === currentPhone;
    }

    async function openChat(jid, phone, deliveryJid) {
        currentJid = jid;
        currentPhone = phone;
        currentDeliveryJid = deliveryJid || jid;
        seenMsgIds.clear();
        document.getElementById("chatHeader").textContent = phone || jid;
        document.getElementById("chatInputWrap").classList.remove("hidden");
        document.getElementById("chatMessages").innerHTML = '<div class="text-center text-muted py-8"><i class="bx bx-loader-alt animate-spin"></i></div>';

        const key = encodeURIComponent(jid || phone);
        const { data } = await get(`/messages/${key}`);
        const msgsEl = document.getElementById("chatMessages");
        msgsEl.innerHTML = "";
        data.forEach((m) => appendMsg(m, false));
        loadChats();
    }

    function appendMsg(msg, scroll = true) {
        if (msg.id && seenMsgIds.has(msg.id)) return;
        if (msg.id) seenMsgIds.add(msg.id);

        const incoming = msg.direction === "incoming";
        const div = document.createElement("div");
        div.className = `flex ${incoming ? "justify-start" : "justify-end"}`;
        div.dataset.msgId = msg.id || "";
        div.innerHTML = `
          <div class="max-w-[85%] min-w-[4rem] px-3 py-2 rounded-lg text-sm shadow-sm relative ${incoming ? "bg-[#202c33] text-[#e9edef] rounded-tl-none" : "bg-[#005c4b] text-[#e9edef] rounded-tr-none"}">
            <div class="wa-msg-body leading-relaxed">${formatWaText(msg.content)}</div>
            <div class="text-[10px] text-right mt-1 opacity-60">${fmtTime(msg.timestamp)}</div>
          </div>`;

        const msgsEl = document.getElementById("chatMessages");
        msgsEl.appendChild(div);
        if (scroll) msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    document.getElementById("chatSearch").oninput = loadChats;

    document.getElementById("chatSendForm").onsubmit = (e) => {
        e.preventDefault();
        const input = document.getElementById("chatMsgInput");
        const text = input.value.trim();
        if (!text || !currentJid) return;
        getSocket()?.emit("message:send", { jid: currentJid, text });
        input.value = "";
    };

    const onNewMessage = (msg) => {
        if (matchesCurrentChat(msg)) appendMsg(msg);
        loadChats();
    };
    const onListUpdate = () => loadChats();

    const unsubMsg = onChatMessage(onNewMessage);
    const unsubList = onChatUpdate(onListUpdate);

    container._cleanup = () => {
        unsubMsg();
        unsubList();
    };

    await loadChats();
}

export { destroyCharts };
