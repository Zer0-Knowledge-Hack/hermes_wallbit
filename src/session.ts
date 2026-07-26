import { DurableObject } from "cloudflare:workers";
import { decrypt, encrypt } from "./crypto";
import type { Env } from "./env";
import { sendMessage } from "./telegram";
import { getCheckingBalance, type AccountSnapshot } from "./wallbit";

/** How many past turns are replayed into the model as context. */
const HISTORY_LIMIT = 10;

/** Link tokens are short-lived on purpose — they unlock a brokerage key. */
const LINK_TTL_MS = 10 * 60 * 1000;

/** A confirm button older than this is stale: the price has moved on. */
const TRADE_TTL_MS = 10 * 60 * 1000;

/**
 * How often a watching session wakes itself to look for new money.
 *
 * Each Durable Object schedules its OWN alarm. There is no way to enumerate
 * Durable Objects, so a central cron could never find the users — and even if it
 * could, it would blow the 50-subrequest budget fanning out. This way every user
 * wakes independently with a full budget, and it scales without a registry.
 */
const WATCH_INTERVAL_MS = 3 * 60 * 60 * 1000;

/** Below this, an increase is rounding or a refund, not an income event. */
const MIN_INFLOW_USD = 1;

export interface StagedTrade {
  symbol: string;
  amountUsd: number;
  priceAtPlan: number;
  status: "pending" | "executing" | "done" | "failed";
  createdAt: number;
}

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export interface Profile {
  firstName: string | null;
  linked: boolean;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * All state for a single Telegram chat.
 *
 * The instance is addressed by chat_id and owns a private SQLite database, so
 * isolation is structural: there is no query that could reach another user's
 * rows, because those rows live in a different database.
 */
export class Session extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS turns (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        role       TEXT    NOT NULL,
        content    TEXT    NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  private read(key: string): string | null {
    const rows = this.ctx.storage.sql
      .exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key)
      .toArray();
    return rows.length > 0 ? rows[0].value : null;
  }

  private write(key: string, value: string): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO meta (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }

  private clear(key: string): void {
    this.ctx.storage.sql.exec("DELETE FROM meta WHERE key = ?", key);
  }

  // --- conversation ------------------------------------------------------

  /** Oldest-first, capped at HISTORY_LIMIT. */
  history(): Turn[] {
    const rows = this.ctx.storage.sql
      .exec<{ role: string; content: string }>(
        "SELECT role, content FROM turns ORDER BY id DESC LIMIT ?",
        HISTORY_LIMIT,
      )
      .toArray();

    return rows.reverse() as Turn[];
  }

  append(role: Turn["role"], content: string): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO turns (role, content, created_at) VALUES (?, ?, ?)",
      role,
      content,
      Date.now(),
    );
  }

  reset(): void {
    this.ctx.storage.sql.exec("DELETE FROM turns");
  }

  // --- profile -----------------------------------------------------------

  /**
   * Telegram sends the sender on every update; we keep the latest.
   *
   * The chat_id is stored deliberately: a Durable Object cannot recover the name
   * it was addressed by, and the alarm handler needs it to send a message
   * nobody asked for.
   */
  rememberIdentity(chatId: number, firstName?: string): void {
    this.write("chat_id", String(chatId));
    if (firstName !== undefined) this.write("first_name", firstName);
  }

  /**
   * `linked` means "we hold a credential we can actually read". A blob that no
   * longer decrypts — rotated secret, corrupt row — reports as unlinked, so the
   * user is told to link again instead of hitting silent failures later.
   */
  async profile(): Promise<Profile> {
    return {
      firstName: this.read("first_name"),
      linked: (await this.apiKey()) !== null,
    };
  }

  // --- account linking ---------------------------------------------------

  /**
   * Issues a single-use nonce. The caller pairs it with the chat_id to form the
   * link token, so possession of the token proves the flow started from this
   * chat — the chat_id is never taken from user input.
   */
  issueLinkToken(): string {
    const nonce = randomToken();
    this.write("link_nonce", nonce);
    this.write("link_expires", String(Date.now() + LINK_TTL_MS));
    return nonce;
  }

  verifyLinkToken(nonce: string): boolean {
    const stored = this.read("link_nonce");
    const expires = this.read("link_expires");

    if (stored === null || expires === null) return false;
    if (Date.now() > Number(expires)) return false;

    // Length-independent comparison is overkill here since the nonce never
    // leaves this object, but constant work costs nothing.
    return stored.length === nonce.length && stored === nonce;
  }

  /** Consumes the nonce, so a leaked link is useless once used. */
  async saveApiKey(nonce: string, apiKey: string): Promise<boolean> {
    if (!this.verifyLinkToken(nonce)) return false;

    this.write("wallbit_key", await encrypt(this.env.ENCRYPTION_KEY, apiKey));
    this.clear("link_nonce");
    this.clear("link_expires");
    return true;
  }

  async apiKey(): Promise<string | null> {
    const stored = this.read("wallbit_key");
    if (stored === null) return null;

    return decrypt(this.env.ENCRYPTION_KEY, stored);
  }

  // --- account snapshot cache -------------------------------------------

  /**
   * A snapshot costs up to 12 Wallbit subrequests, and a conversation is many
   * messages in a row. Caching keeps a chat from hammering the 60 req/min limit.
   */
  cachedSnapshot(maxAgeMs: number): AccountSnapshot | null {
    const raw = this.read("snapshot");
    if (raw === null) return null;

    try {
      const snapshot = JSON.parse(raw) as AccountSnapshot;
      if (Date.now() - snapshot.fetchedAt > maxAgeMs) return null;
      return snapshot;
    } catch {
      return null;
    }
  }

  storeSnapshot(snapshot: AccountSnapshot): void {
    this.write("snapshot", JSON.stringify(snapshot));
  }

  clearSnapshot(): void {
    this.clear("snapshot");
  }

  // --- staged trades -----------------------------------------------------

  /**
   * Stages a plan the user was shown, and hands back a short id for the confirm
   * button. Nothing here can place an order — it only records what WOULD be
   * ordered if the user taps.
   */
  stageTrade(symbol: string, amountUsd: number, priceAtPlan: number): string {
    const id = randomToken().slice(0, 12);

    this.write(
      `trade:${id}`,
      JSON.stringify({
        symbol,
        amountUsd,
        priceAtPlan,
        status: "pending",
        createdAt: Date.now(),
      } satisfies StagedTrade),
    );

    return id;
  }

  /**
   * Transitions pending -> executing and returns the trade, or null if it is
   * missing, expired, or already claimed.
   *
   * A Durable Object handles one request at a time, so this read-then-write is
   * atomic. That is what makes a double tap on the confirm button harmless —
   * without it there is no order-status endpoint to reconcile against.
   */
  claimTrade(id: string): StagedTrade | null {
    const raw = this.read(`trade:${id}`);
    if (raw === null) return null;

    let trade: StagedTrade;
    try {
      trade = JSON.parse(raw) as StagedTrade;
    } catch {
      return null;
    }

    if (trade.status !== "pending") return null;
    if (Date.now() - trade.createdAt > TRADE_TTL_MS) return null;

    this.write(`trade:${id}`, JSON.stringify({ ...trade, status: "executing" }));
    return trade;
  }

  settleTrade(id: string, status: "done" | "failed"): void {
    const raw = this.read(`trade:${id}`);
    if (raw === null) return;

    try {
      const trade = JSON.parse(raw) as StagedTrade;
      this.write(`trade:${id}`, JSON.stringify({ ...trade, status }));
    } catch {
      this.clear(`trade:${id}`);
    }
  }

  cancelTrade(id: string): void {
    this.clear(`trade:${id}`);
  }

  // --- proactive watch ---------------------------------------------------

  private async usdChecking(apiKey: string): Promise<number | null> {
    const result = await getCheckingBalance(apiKey);
    if (!result.ok) return null;

    const usd = (result.data?.data ?? []).find((row) => row.currency === "USD");
    return usd?.balance ?? 0;
  }

  watching(): boolean {
    return this.read("watch") === "on";
  }

  /**
   * Records the current balance as the baseline and schedules the first wake-up.
   * Without a baseline the first alarm would report the entire balance as if it
   * had just arrived.
   */
  async startWatching(): Promise<boolean> {
    const apiKey = await this.apiKey();
    if (apiKey === null) return false;

    const balance = await this.usdChecking(apiKey);
    if (balance === null) return false;

    this.write("watch", "on");
    this.write("watch_balance", String(balance));
    await this.ctx.storage.setAlarm(Date.now() + WATCH_INTERVAL_MS);

    return true;
  }

  async stopWatching(): Promise<void> {
    this.clear("watch");
    this.clear("watch_balance");
    await this.ctx.storage.deleteAlarm();
  }

  /**
   * Compares the balance against the last known one. Returns the amount that
   * came in, or null. Deliberately balance-based rather than transaction-type
   * based: the type enum is not fully documented, and a balance that went up is
   * unambiguous regardless of what caused it.
   */
  async checkForInflow(): Promise<{ inflow: number; balance: number } | null> {
    const apiKey = await this.apiKey();
    if (apiKey === null) return null;

    const balance = await this.usdChecking(apiKey);
    if (balance === null) return null;

    const previousRaw = this.read("watch_balance");
    const previous = previousRaw === null ? balance : Number(previousRaw);

    // Always move the baseline, including downwards: after the user spends or
    // invests, the next deposit must be measured from where they actually are.
    this.write("watch_balance", String(balance));

    const inflow = Number((balance - previous).toFixed(2));
    return inflow >= MIN_INFLOW_USD ? { inflow, balance } : null;
  }

  /**
   * Runs unattended, so it must never throw: Durable Object alarms retry with
   * backoff and only 6 times, and a crash loop would burn them and stop the
   * watch silently.
   */
  async alarm(): Promise<void> {
    try {
      if (!this.watching()) return;

      const detected = await this.checkForInflow();

      if (detected !== null) {
        const chatId = Number(this.read("chat_id"));

        if (Number.isFinite(chatId) && chatId !== 0) {
          const name = this.read("first_name");
          await sendMessage(
            this.env.BOT_TOKEN,
            chatId,
            `💸 <b>Te entraron $${detected.inflow.toFixed(2)}</b>\n\n` +
              `${name ? `${name}, t` : "T"}enés <b>$${detected.balance.toFixed(2)}</b> ` +
              `sin invertir en tu cuenta.\n\n` +
              `¿Vemos qué hacer con eso?`,
            [
              [{ text: "🔎 Ver opciones", callback_data: "cats" }],
              [{ text: "💰 Ver mi cuenta", callback_data: "balance" }],
            ],
          );
        }
      }
    } catch (error) {
      console.error("watch alarm failed", error);
    } finally {
      // Rescheduled even after a failure, or one bad poll ends the watch forever.
      if (this.watching()) {
        await this.ctx.storage.setAlarm(Date.now() + WATCH_INTERVAL_MS);
      }
    }
  }

  unlink(): void {
    this.clear("wallbit_key");
    this.clear("link_nonce");
    this.clear("link_expires");
    this.clear("snapshot");
  }
}
