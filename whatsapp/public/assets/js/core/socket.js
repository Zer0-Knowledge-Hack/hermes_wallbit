let socket = null;
let waState = { status: "disconnected", qr: null, phone: null, name: null };
const waListeners = new Set();
const chatMessageListeners = new Set();
const chatUpdateListeners = new Set();

function notifyWa() {
    waListeners.forEach((fn) => fn({ ...waState }));
}

export function onWhatsAppState(fn) {
    waListeners.add(fn);
    fn({ ...waState });
    return () => waListeners.delete(fn);
}

export function onChatMessage(fn) {
    chatMessageListeners.add(fn);
    return () => chatMessageListeners.delete(fn);
}

export function onChatUpdate(fn) {
    chatUpdateListeners.add(fn);
    return () => chatUpdateListeners.delete(fn);
}

export function initSocket(handlers = {}) {
    if (typeof io === "undefined") return null;
    if (socket) return socket;

    socket = io();

    socket.on("dashboard:stats", (d) => handlers.onStats?.(d));

    socket.on("whatsapp:status", (d) => {
        waState = { ...waState, ...d };
        notifyWa();
        handlers.onWhatsApp?.(d);
    });

    socket.on("whatsapp:qr", (qr) => {
        waState = { ...waState, status: "qr", qr };
        notifyWa();
        handlers.onQr?.(qr);
    });

    socket.on("session:update", (d) => handlers.onSession?.(d));
    socket.on("wallbit:linked", (d) => handlers.onWallbit?.(d));
    socket.on("trade:pending", (d) => handlers.onTrade?.(d));

    socket.on("message:new", (d) => {
        handlers.onMessage?.(d);
        chatMessageListeners.forEach((fn) => fn(d));
    });

    socket.on("chat:update", (d) => {
        handlers.onChatUpdate?.(d);
        chatUpdateListeners.forEach((fn) => fn(d));
    });

    socket.on("chat:list", (d) => handlers.onChatList?.(d));
    socket.on("error", (d) => handlers.onError?.(d));

    return socket;
}

export function getSocket() {
    return socket;
}

export function getWhatsAppState() {
    return { ...waState };
}
