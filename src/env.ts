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
}
