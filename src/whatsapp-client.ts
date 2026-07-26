export interface WhatsAppConnectionInfo {
  status: "connected" | "disconnected" | "qr";
  phone?: string | null;
  name?: string | null;
  connectedAt?: string | null;
  qr?: string | null;
}

export interface WhatsAppDashboardStats {
  uptime?: number;
  messagesProcessed?: number;
  activeUsers?: number;
}

export interface WhatsAppClientResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

/**
 * Normaliza y valida la URL base del servicio de WhatsApp.
 */
function getBaseUrl(apiUrl: string | undefined): { ok: true; url: string } | { ok: false; error: string } {
  if (!apiUrl || apiUrl.trim() === "") {
    return {
      ok: false,
      error: "La variable WHATSAPP_API_URL no está configurada en .dev.vars o en los secretos del Worker. Levanta el túnel con `npm run tunnel` en el directorio /whatsapp para configurarla automáticamente.",
    };
  }
  const clean = apiUrl.trim().replace(/\/+$/, "");
  if (clean.startsWith("http://localhost") || clean.startsWith("http://127.0.0.1")) {
    return {
      ok: false,
      error: `La URL configurada (${clean}) usa HTTP/localhost. Cloudflare Workers requiere HTTPS para conexiones externas. Levanta el túnel con \`npm run tunnel\` en /whatsapp para generar una URL segura.`,
    };
  }
  return { ok: true, url: clean };
}

/**
 * Consulta el estado de conexión de WhatsApp (status, teléfono, QR si aplica).
 */
export async function getWhatsAppConnectionInfo(apiUrl: string | undefined): Promise<WhatsAppClientResult<WhatsAppConnectionInfo>> {
  const base = getBaseUrl(apiUrl);
  if (!base.ok) return { ok: false, error: base.error };

  try {
    const response = await fetch(`${base.url}/api/whatsapp`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (response.ok && data?.success) {
      return { ok: true, data: data.data as WhatsAppConnectionInfo, status: response.status };
    }
    return {
      ok: false,
      error: data?.message || `Error HTTP ${response.status} desde el servicio WhatsApp`,
      status: response.status,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error de red desconocido";
    return {
      ok: false,
      error: `No se pudo contactar al túnel del bot de WhatsApp: ${errorMessage}`,
      status: 0,
    };
  }
}

/**
 * Consulta las estadísticas del servidor del bot (uptime, métricas).
 */
export async function getWhatsAppStatus(apiUrl: string | undefined): Promise<WhatsAppClientResult<WhatsAppDashboardStats>> {
  const base = getBaseUrl(apiUrl);
  if (!base.ok) return { ok: false, error: base.error };

  try {
    const response = await fetch(`${base.url}/api/status`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const data = await response.json() as any;
    if (response.ok && data?.success) {
      return { ok: true, data: data as WhatsAppDashboardStats, status: response.status };
    }
    return {
      ok: false,
      error: data?.message || `Error HTTP ${response.status}`,
      status: response.status,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error de red desconocido";
    return { ok: false, error: `Fallo de conexión al túnel: ${errorMessage}`, status: 0 };
  }
}

/**
 * Lista los usuarios y sesiones conectadas en el bot local de WhatsApp.
 */
export async function listWhatsAppUsers(apiUrl: string | undefined): Promise<WhatsAppClientResult<any[]>> {
  const base = getBaseUrl(apiUrl);
  if (!base.ok) return { ok: false, error: base.error };

  try {
    const response = await fetch(`${base.url}/api/users`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const data = await response.json() as any;
    if (response.ok && data?.success) {
      return { ok: true, data: data.data || [], status: response.status };
    }
    return { ok: false, error: data?.message || `Error HTTP ${response.status}`, status: response.status };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error de red desconocido";
    return { ok: false, error: `Fallo al consultar usuarios de WhatsApp: ${errorMessage}`, status: 0 };
  }
}

/**
 * Envía un mensaje de texto a un JID o número de teléfono vía el bot de WhatsApp.
 */
export async function sendWhatsAppMessage(apiUrl: string | undefined, jid: string, text: string): Promise<WhatsAppClientResult<any>> {
  const base = getBaseUrl(apiUrl);
  if (!base.ok) return { ok: false, error: base.error };

  try {
    const response = await fetch(`${base.url}/api/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ jid, text }),
    });
    const data = await response.json() as any;
    if (response.ok && data?.success) {
      return { ok: true, data: data.data, status: response.status };
    }
    return { ok: false, error: data?.message || `Error HTTP ${response.status}`, status: response.status };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error de red desconocido";
    return { ok: false, error: `Fallo al enviar mensaje por WhatsApp: ${errorMessage}`, status: 0 };
  }
}
