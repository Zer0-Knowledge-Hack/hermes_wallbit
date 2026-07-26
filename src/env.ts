import type { Session } from "./session";

export interface Env {
  /** Workers AI binding. */
  AI: Ai;
  /** One Durable Object per Telegram chat. */
  SESSION: DurableObjectNamespace<Session>;
  /** Bot token from BotFather. Set with: wrangler secret put BOT_TOKEN */
  BOT_TOKEN: string;
  /** Shared secret Telegram echoes back on every webhook call. */
  WEBHOOK_SECRET: string;
  /** Root secret for encrypting stored credentials. Rotating it unlinks everyone. */
  ENCRYPTION_KEY: string;

  // --- WhatsApp Cloud API (optional: absent means the channel is off) ---
  /** Permanent access token from the Meta app. */
  WHATSAPP_TOKEN?: string;
  /** Phone number ID, not the phone number itself. */
  WHATSAPP_PHONE_ID?: string;
  /** String you invent and paste into Meta's webhook form. */
  WHATSAPP_VERIFY_TOKEN?: string;
  /** App secret, used to verify X-Hub-Signature-256 on incoming webhooks. */
  WHATSAPP_APP_SECRET?: string;
  /** API key for Zavudev SDK (@zavudev/sdk) to send messages across channels. */
  ZAVUDEV_API_KEY?: string;
}
