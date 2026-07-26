import type { Env } from "./env";

/**
 * WhatsApp Cloud API client.
 *
 * Differs from Telegram in ways that shape the product, not just the code:
 * no message editing, at most 3 reply buttons, its own markup instead of HTML,
 * and a 24-hour window outside of which only approved templates may be sent.
 */

const GRAPH_VERSION = "v21.0";
const TIMEOUT_MS = 10_000;

/** Reply-button labels are capped at 20 characters by WhatsApp. */
const BUTTON_LABEL_MAX = 20;

// ── Incoming payload ──────────────────────────────────────

export interface WhatsAppMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
}

export interface WhatsAppIncoming {
  /** Sender's phone number, which doubles as the conversation id. */
  from: string;
  name?: string;
  /** Free text, or the id of the button the user tapped. */
  text: string;
  /** True when it came from a button rather than the keyboard. */
  isAction: boolean;
}

interface WhatsAppWebhookBody {
  object?: string;
  entry?: {
    changes?: {
      value?: {
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: WhatsAppMessage[];
        statuses?: unknown[];
      };
    }[];
  }[];
}

/**
 * Pulls the one message we care about out of the envelope.
 *
 * Returns null for delivery receipts and for message types we cannot handle —
 * both arrive on the same webhook and must not be treated as conversation.
 */
export function extractMessage(body: unknown): WhatsAppIncoming | null {
  const value = (body as WhatsAppWebhookBody)?.entry?.[0]?.changes?.[0]?.value;
  if (value === undefined) return null;

  // Delivery/read receipts. Acknowledged, never answered.
  if (value.statuses !== undefined) return null;

  const message = value.messages?.[0];
  if (message === undefined) return null;

  const name = value.contacts?.[0]?.profile?.name;

  if (message.type === "text" && message.text?.body) {
    return { from: message.from, name, text: message.text.body, isAction: false };
  }

  const reply = message.interactive?.button_reply ?? message.interactive?.list_reply;
  if (reply !== undefined) {
    return { from: message.from, name, text: reply.id, isAction: true };
  }

  return null;
}

// ── Verification ──────────────────────────────────────────

/**
 * Meta verifies ownership with a GET carrying hub.* parameters, and expects the
 * challenge echoed back verbatim as plain text.
 */
export function handleVerification(url: URL, env: Env): Response {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN && challenge !== null) {
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  console.warn("whatsapp verification rejected");
  return new Response("forbidden", { status: 403 });
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Meta signs the RAW body with the app secret. It must be verified against the
 * exact bytes received — re-serialising the parsed JSON changes the signature.
 */
export async function verifySignature(
  rawBody: string,
  header: string | null,
  appSecret: string | undefined,
): Promise<boolean> {
  if (!appSecret) {
    console.warn("WHATSAPP_APP_SECRET not set — signature not verified");
    return true;
  }

  if (header === null || !header.startsWith("sha256=")) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = hex(signature);
  const received = header.slice(7);

  if (expected.length !== received.length) return false;

  // Constant-time compare: a length-only check would leak the prefix.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  }

  return diff === 0;
}

// ── Formatting ────────────────────────────────────────────

/**
 * Converts the HTML the cards already produce into WhatsApp's markup, so every
 * card written for Telegram works here untouched.
 */
export function htmlToWhatsApp(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(b|strong)>/gi, "*")
    .replace(/<\/?(i|em)>/gi, "_")
    .replace(/<\/?(code|pre)>/gi, "```")
    .replace(/<a href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2 $1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

// ── Sending ───────────────────────────────────────────────

async function post(env: Env, payload: unknown): Promise<Response | null> {
  try {
    return await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ messaging_product: "whatsapp", ...(payload as object) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  } catch (error) {
    console.error("whatsapp request threw", error);
    return null;
  }
}

async function send(env: Env, payload: unknown): Promise<void> {
  const response = await post(env, payload);
  if (response === null || response.ok) return;

  // The usual cause outside a demo is the 24-hour window: past it, only an
  // approved template may be sent, and free-form text is rejected.
  console.error("whatsapp send failed", response.status, await response.text());
}

export function sendText(env: Env, to: string, html: string): Promise<void> {
  return send(env, {
    to,
    type: "text",
    text: { preview_url: false, body: htmlToWhatsApp(html).slice(0, 4000) },
  });
}

export interface WhatsAppButton {
  id: string;
  label: string;
}

/**
 * At most 3 buttons — anything longer has to become a list or plain text.
 * Extra buttons are dropped rather than silently failing the whole send.
 */
export function sendButtons(
  env: Env,
  to: string,
  html: string,
  buttons: WhatsAppButton[],
): Promise<void> {
  const usable = buttons.slice(0, 3);

  if (usable.length === 0) return sendText(env, to, html);

  return send(env, {
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: htmlToWhatsApp(html).slice(0, 1024) },
      action: {
        buttons: usable.map((button) => ({
          type: "reply",
          reply: { id: button.id.slice(0, 256), title: button.label.slice(0, BUTTON_LABEL_MAX) },
        })),
      },
    },
  });
}

export interface WhatsAppRow {
  id: string;
  title: string;
  description?: string;
}

/** Lists carry up to 10 rows, which is how more than 3 options are offered. */
export function sendList(
  env: Env,
  to: string,
  html: string,
  buttonLabel: string,
  rows: WhatsAppRow[],
): Promise<void> {
  const usable = rows.slice(0, 10);

  if (usable.length === 0) return sendText(env, to, html);

  return send(env, {
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: htmlToWhatsApp(html).slice(0, 1024) },
      action: {
        button: buttonLabel.slice(0, BUTTON_LABEL_MAX),
        sections: [
          {
            title: "Opciones",
            rows: usable.map((row) => ({
              id: row.id.slice(0, 200),
              title: row.title.slice(0, 24),
              ...(row.description ? { description: row.description.slice(0, 72) } : {}),
            })),
          },
        ],
      },
    },
  });
}
