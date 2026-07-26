import { Container } from "@cloudflare/containers";

export class WhatsAppContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "10m";

  onStart() {
    console.log("Contenedor de WhatsApp iniciado exitosamente en Cloudflare");
  }

  onError(error) {
    console.error("Error en contenedor de WhatsApp:", error);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Configuración dinámica para el dashboard en el navegador
    if (url.pathname === "/config.js") {
      // Al dejar BACKEND_URL en vacío (""), socket.io se conecta al mismo origen web,
      // lo cual enruta directamente a este Cloudflare Worker y al Contenedor.
      const backendUrl = env.BACKEND_URL || "";
      const workerUrl = env.WORKER_URL || "https://hermes-bot.moisescisnerosdl.workers.dev";
      return new Response(`window.BACKEND_URL = "${backendUrl}"; window.WORKER_URL = "${workerUrl}";`, {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // 2. Enrutamiento hacia el Worker principal de Inteligencia Artificial (hermes-bot)
    if (url.pathname.startsWith("/api/ai/") && env.AI_WORKER) {
      return env.AI_WORKER.fetch(request);
    }

    // 3. Enrutamiento de WebSockets (Socket.io) y API de WhatsApp hacia el Contenedor Docker en Cloudflare
    const isWebSocket = request.headers.get("Upgrade")?.toLowerCase() === "websocket";
    const isContainerRoute =
      url.pathname.startsWith("/socket.io") ||
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/connect") ||
      url.pathname.startsWith("/webhook") ||
      url.pathname.startsWith("/status") ||
      url.pathname.startsWith("/qr") ||
      url.pathname.startsWith("/restart") ||
      url.pathname.startsWith("/reset") ||
      url.pathname.startsWith("/logs") ||
      url.pathname.startsWith("/health");

    if (isWebSocket || isContainerRoute) {
      if (env.WHATSAPP_CONTAINER) {
        const container = env.WHATSAPP_CONTAINER.getByName("whatsapp-instance");
        return await container.fetch(request);
      }
    }

    // 4. Servir archivos estáticos del Frontend (public/) mediante Cloudflare Assets
    return env.ASSETS.fetch(request);
  },
};
