import Alpine from "alpinejs";
import { initRouter, getNav, getCommands, navigate } from "./core/router.js";
import { initSocket, onWhatsAppState } from "./core/socket.js";
import { Toast } from "./core/toast.js";
import { get } from "./core/api.js";

function buildSidebar() {
    const nav = document.getElementById("sidebar-nav");
    if (!nav) return;

    nav.innerHTML = getNav().map((section) => `
      <div>
        <p class="text-[10px] uppercase tracking-widest text-muted/60 px-3 mb-2 sidebar-section">${section.section}</p>
        ${section.items.map((item) => `
          <a href="#/${item.id}" data-page="${item.id}" class="nav-link">
            <i class="bx ${item.icon} text-lg shrink-0"></i>
            <span class="sidebar-label truncate">${item.label}</span>
          </a>
        `).join("")}
      </div>
    `).join("");

    nav.querySelectorAll(".nav-link").forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            navigate(link.dataset.page);
        });
    });
}

function waLabelFromStatus(status) {
    if (status === "connected") return "WhatsApp ✓";
    if (status === "qr") return "Escanear QR";
    return "WhatsApp ✗";
}

Alpine.data("appShell", () => ({
    sidebarOpen: true,
    pageTitle: "Conexión",
    commandOpen: false,
    commandQuery: "",
    commands: getCommands(),
    serverOk: true,
    wallbitOk: false,
    aiOk: false,
    waOk: false,
    waStatus: "disconnected",
    waLabel: "WhatsApp",
    notifCount: 0,

    get filteredCommands() {
        const q = this.commandQuery.toLowerCase();
        if (!q) return this.commands;
        return this.commands.filter((c) => c.label.toLowerCase().includes(q));
    },

    init() {
        document.getElementById("modalClose")?.addEventListener("click", () => {
            const modal = document.getElementById("modal");
            modal?.classList.add("hidden");
            modal?.classList.remove("flex");
        });

        buildSidebar();

        initRouter((page) => {
            this.pageTitle = page.title;
        });

        onWhatsAppState((d) => {
            this.waStatus = d.status || "disconnected";
            this.waOk = d.status === "connected";
            this.waLabel = waLabelFromStatus(d.status);
        });

        initSocket({
            onStats: () => { this.serverOk = true; },
            onWhatsApp: (d) => {
                this.waStatus = d.status || "disconnected";
                this.waOk = d.status === "connected";
                this.waLabel = waLabelFromStatus(d.status);
                if (d.status === "connected") Toast.success("WhatsApp conectado");
            },
            onQr: () => {
                this.waStatus = "qr";
                this.waLabel = "Escanear QR";
            },
            onError: (d) => { Toast.error(d.message); this.notifCount++; },
            onWallbit: (d) => { this.wallbitOk = d.linked; },
        });

        this.loadStatus();
        this.loadWhatsApp();

        document.addEventListener("keydown", (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                this.commandOpen = true;
                this.$nextTick(() => this.$refs.commandInput?.focus());
            }
        });

        this.$watch("commandOpen", (open) => {
            if (open) this.$nextTick(() => this.$refs.commandInput?.focus());
        });
    },

    async loadWhatsApp() {
        try {
            const { data } = await get("/whatsapp");
            this.waStatus = data.status || "disconnected";
            this.waOk = data.status === "connected";
            this.waLabel = waLabelFromStatus(data.status);
        } catch {
            this.waStatus = "disconnected";
            this.waOk = false;
        }
    },

    async loadStatus() {
        try {
            const res = await get("/dashboard/kpis");
            const kpis = res.data;
            this.wallbitOk = kpis?.apiStatus === "online";
            this.aiOk = kpis?.aiStatus === "ready";
        } catch {
            this.wallbitOk = false;
            this.aiOk = false;
        }
    },

    goCommand(cmd) {
        cmd.action();
        this.commandOpen = false;
        this.commandQuery = "";
    },

    runCommand() {
        if (this.filteredCommands.length) this.goCommand(this.filteredCommands[0]);
    },
}));

window.Alpine = Alpine;
Alpine.start();

export { navigate, Toast };
