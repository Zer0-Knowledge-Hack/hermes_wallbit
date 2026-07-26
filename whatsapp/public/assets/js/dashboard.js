const backendUrl = typeof window !== "undefined" && window.BACKEND_URL ? window.BACKEND_URL : undefined;
const socket = io(backendUrl);

let currentChat = null;
let activityChart = null;

const views = {
  dashboard: { title: "Dashboard", el: "view-dashboard" },
  whatsapp: { title: "WhatsApp", el: "view-whatsapp" },
  chats: { title: "Chats", el: "view-chats" },
  contacts: { title: "Contactos", el: "view-contacts" },
  users: { title: "Usuarios", el: "view-users" },
  wallbit: { title: "Wallbit", el: "view-wallbit" },
  logs: { title: "Logs", el: "view-logs" },
  settings: { title: "Configuración", el: "view-settings" },
};

// Navigation
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    const view = item.dataset.view;
    showView(view);
  });
});

function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(views[name].el)?.classList.remove("hidden");
  document.getElementById("pageTitle").textContent = views[name].title;
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
  document.querySelector(`[data-view="${name}"]`)?.classList.add("active");

  if (name === "contacts") loadContacts();
  if (name === "users") loadUsers();
  if (name === "wallbit") loadWallbitUsers();
  if (name === "logs") loadLogs();
}

// Socket events
socket.on("whatsapp:status", updateWhatsAppStatus);
socket.on("whatsapp:qr", (qr) => {
  document.getElementById("qrImage").src = qr;
  document.getElementById("qrImage").classList.remove("hidden");
  document.getElementById("qrPlaceholder").classList.add("hidden");
});
socket.on("dashboard:stats", updateDashboard);
socket.on("chat:list", renderChatList);
socket.on("chat:update", renderChatList);
socket.on("wallbit:users", renderWallbitUsers);
socket.on("session:update", () => loadWallbitUsers());
socket.on("user:state", () => loadWallbitUsers());
socket.on("trade:pending", () => loadWallbitUsers());
socket.on("trade:confirmed", () => loadWallbitUsers());
socket.on("trade:cancelled", () => loadWallbitUsers());
socket.on("wallbit:linked", () => loadWallbitUsers());
socket.on("message:new", (msg) => {
  if (currentChat && (msg.jid === currentChat || msg.whatsapp === currentChat)) appendMessage(msg);
});

function updateWhatsAppStatus(data) {
  const dot = document.getElementById("waDot");
  const text = document.getElementById("waStatusText");

  if (data.status === "connected") {
    dot.className = "w-2 h-2 rounded-full bg-emerald-500";
    text.textContent = "Conectado";
  } else if (data.status === "qr") {
    dot.className = "w-2 h-2 rounded-full bg-yellow-500";
    text.textContent = "Esperando QR";
  } else {
    dot.className = "w-2 h-2 rounded-full bg-red-500";
    text.textContent = "Desconectado";
  }

  document.getElementById("waDetailStatus").textContent = data.status || "—";
  document.getElementById("waDetailPhone").textContent = data.phone || "—";
  document.getElementById("waDetailName").textContent = data.name || "—";
  document.getElementById("waDetailSince").textContent = data.connectedAt
    ? new Date(data.connectedAt).toLocaleString()
    : "—";
  document.getElementById("sysWa").textContent = data.status || "—";
  document.getElementById("sysPhone").textContent = data.phone || "—";
}

function updateDashboard(stats) {
  if (!stats) return;

  document.getElementById("statIncoming").textContent = stats.messages?.incoming || 0;
  document.getElementById("statOutgoing").textContent = stats.messages?.outgoing || 0;
  document.getElementById("statUsers").textContent = stats.users?.total || 0;
  document.getElementById("statConnected").textContent = stats.users?.connected || 0;
  document.getElementById("sysApi").textContent = stats.apiCalls || 0;
  document.getElementById("sysErrors").textContent = stats.errors || 0;
  document.getElementById("sysUptime").textContent = formatUptime(stats.uptime);
  document.getElementById("sysMemory").textContent = formatBytes(stats.memory?.heapUsed);

  updateChart(stats.messages);
}

function updateChart(messages) {
  const ctx = document.getElementById("activityChart");
  if (!ctx) return;

  const data = {
    labels: ["Recibidos", "Enviados"],
    datasets: [{
      label: "Mensajes",
      data: [messages?.incoming || 0, messages?.outgoing || 0],
      backgroundColor: ["#059669", "#065f46"],
    }],
  };

  if (activityChart) {
    activityChart.data = data;
    activityChart.update();
  } else {
    activityChart = new Chart(ctx, { type: "bar", data, options: { responsive: true, plugins: { legend: { display: false } } } });
  }
}

function renderChatList(chats) {
  const list = document.getElementById("chatList");
  if (!list || !chats) return;

  list.innerHTML = chats.map((c) => `
    <div class="chat-item ${currentChat === (c.jid || c.whatsapp) ? "active" : ""}" data-phone="${c.whatsapp}" data-jid="${c.jid || ""}">
      <div class="flex justify-between">
        <span class="chat-item-name">${c.name || c.whatsapp}</span>
        <span class="text-xs text-gray-500">${formatTime(c.last_timestamp)}</span>
      </div>
      <div class="chat-item-preview">${c.last_message || ""}</div>
      ${c.unread ? `<span class="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full">${c.unread}</span>` : ""}
    </div>
  `).join("");

  list.querySelectorAll(".chat-item").forEach((item) => {
    item.addEventListener("click", () => openChat(item.dataset.phone, item.dataset.jid));
  });
}

async function openChat(phone, jid) {
  currentChat = jid || phone;
  document.getElementById("chatHeader").textContent = jid || phone;
  document.getElementById("chatInput").classList.remove("hidden");
  document.getElementById("chatMessages").innerHTML = '<div class="text-gray-500 text-center py-8">Cargando...</div>';

  const key = encodeURIComponent(jid || phone);
  const res = await fetch(`/api/messages/${key}`);
  const { data } = await res.json();

  document.getElementById("chatMessages").innerHTML = "";
  data.forEach(appendMessage);

  document.getElementById("sendForm").onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById("messageInput");
    const text = input.value.trim();
    if (!text) return;

    socket.emit("message:send", { jid: jid || phone.replace("+", "") + "@s.whatsapp.net", text });
    input.value = "";
  };
}

function appendMessage(msg) {
  const container = document.getElementById("chatMessages");
  const div = document.createElement("div");
  div.className = `msg-bubble ${msg.direction === "incoming" ? "msg-in" : "msg-out"}`;
  div.textContent = msg.content;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function loadContacts() {
  const res = await fetch("/api/contacts");
  const { data } = await res.json();
  document.getElementById("contactsTable").innerHTML = renderTable(
    ["WhatsApp", "Nombre", "Último mensaje", "Actividad"],
    data.map((c) => [c.whatsapp, c.name, c.last_message || "—", formatTime(c.last_activity)])
  );
}

async function loadUsers() {
  const res = await fetch("/api/users");
  const { data } = await res.json();
  document.getElementById("usersTable").innerHTML = renderTable(
    ["JID", "Teléfono", "Estado", "Wallbit", "API Key", "Última actividad"],
    data.map((u) => [
      u.jid || "—",
      u.phone || u.whatsapp,
      u.state,
      u.wallbitLinked || u.wallbitConnected ? "✅ Vinculado" : "❌ No",
      u.apiKeyStatus || "—",
      formatTime(u.lastActivity || u.last_activity),
    ])
  );
}

function renderWallbitUsers(users) {
  const el = document.getElementById("wallbitUsers");
  if (!el) return;
  if (!users?.length) {
    el.innerHTML = '<p class="text-gray-500 text-sm">Sin sesiones aún</p>';
    return;
  }
  el.innerHTML = renderTable(
    ["WhatsApp", "Estado conv.", "Vinculado", "API Key", "Última sync", "Última consulta", "Pendiente"],
    users.map((u) => [
      u.phone || u.jid,
      u.state,
      u.wallbitLinked ? "✅" : "❌",
      u.apiKeyStatus,
      formatTime(u.lastSync),
      u.lastQuery || "—",
      u.hasPendingTrade ? `${u.pendingTrade?.symbol} $${u.pendingTrade?.amount}` : "—",
    ])
  );
}

async function loadWallbitUsers() {
  const res = await fetch("/api/wallbit/users");
  const { data } = await res.json();
  renderWallbitUsers(data);
}

async function loadLogs() {
  const res = await fetch("/api/logs");
  const { data } = await res.json();
  document.getElementById("logsTable").innerHTML = renderTable(
    ["Tipo", "Detalle", "WhatsApp", "Fecha"],
    data.map((l) => [l.type, l.detail || "—", l.whatsapp || "—", formatTime(l.created_at)])
  );
}

function renderTable(headers, rows) {
  if (!rows.length) return '<p class="text-gray-500 text-sm">Sin datos</p>';
  return `<table class="data-table">
    <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>`;
}

document.getElementById("btnRestart")?.addEventListener("click", () => {
  if (confirm("¿Estás seguro de querer reiniciar el servicio de WhatsApp?")) {
    socket.emit("whatsapp:restart");
  }
});

document.getElementById("btnResetSession")?.addEventListener("click", () => {
  if (confirm("⚠️ ¿Estás seguro de querer borrar todos los datos de sesión (/auth y /data)? Esto cerrará tu sesión actual y requerirá escanear el QR nuevamente.")) {
    socket.emit("whatsapp:reset_session");
  }
});

document.getElementById("sidebarToggle")?.addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

function formatTime(date) {
  if (!date) return "—";
  return new Date(date).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

function formatUptime(seconds) {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatBytes(bytes) {
  if (!bytes) return "—";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Initial load
fetch("/api/status").then((r) => r.json()).then(updateDashboard);
fetch("/api/conversations").then((r) => r.json()).then(({ data }) => renderChatList(data));
