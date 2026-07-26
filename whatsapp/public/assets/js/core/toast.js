const toasts = [];

export function toast(message, type = "info", duration = 4000) {
    const id = Date.now();
    const container = document.getElementById("toast-container");
    if (!container) return;

    const el = document.createElement("div");
    el.className = `toast-${type}`;
    el.innerHTML = `<i class="bx ${icons[type]} text-lg"></i><span class="text-sm text-white">${message}</span>`;
    container.appendChild(el);
    toasts.push(id);

    setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateX(100%)";
        el.style.transition = "all 0.3s";
        setTimeout(() => el.remove(), 300);
    }, duration);
}

const icons = {
    success: "bx-check-circle",
    error: "bx-error-circle",
    info: "bx-info-circle",
    warning: "bx-error",
};

export const Toast = {
    success: (msg) => toast(msg, "success"),
    error: (msg) => toast(msg, "error"),
    info: (msg) => toast(msg, "info"),
    warning: (msg) => toast(msg, "warning"),
};
