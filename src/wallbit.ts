/**
 * Client for the Wallbit public API.
 *
 * Every call is authenticated with the user's own API key, so a failure here is
 * about that one user's credential — never a global outage. Callers get a
 * discriminated result instead of exceptions, because these run inside
 * ctx.waitUntil() where a throw is invisible to the user.
 *
 * Read-only by design. The endpoints that move money or change account state
 * (POST /trades, POST /operations/internal, PATCH /cards/{id}/status) are
 * deliberately absent — see tools.ts.
 */

const API_BASE = "https://api.wallbit.io/api/public/v1";
const TIMEOUT_MS = 10_000;

export type WallbitResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; reason: WallbitFailure };

export type WallbitFailure =
  | "unauthorized" // 401 — key missing, invalid or already revoked
  | "forbidden" // 403 — key lacks the required permission
  | "not_found" // 404
  | "blocked" // 412 — KYC incomplete or account locked
  | "invalid" // 400/422 — bad request
  | "rate_limited" // 429
  | "server" // 5xx
  | "network"; // timeout, DNS, connection reset

function classify(status: number): WallbitFailure {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 412) return "blocked";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "invalid";
  if (status >= 500) return "server";
  return "invalid";
}

interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

async function request<T>(
  apiKey: string,
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<WallbitResult<T>> {
  const url = new URL(`${API_BASE}${path}`);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        "X-API-Key": apiKey,
        accept: "application/json",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error("wallbit request failed", method, path, error);
    return { ok: false, status: 0, reason: "network" };
  }

  if (!response.ok) {
    // Never log the body verbatim — error payloads can echo request context.
    console.error("wallbit error", method, path, response.status);
    return { ok: false, status: response.status, reason: classify(response.status) };
  }

  // Some endpoints answer 204 or an empty body on success.
  const text = await response.text();
  const data = text.length > 0 ? (JSON.parse(text) as T) : (null as T);

  return { ok: true, data };
}

// --- account -------------------------------------------------------------

export interface CheckingBalance {
  currency: string;
  balance: number;
}

export interface Holding {
  symbol: string;
  shares: number;
  /** Null when the price lookup failed or the row is cash, not a security. */
  price: number | null;
  value: number | null;
}

export interface AccountSnapshot {
  checking: CheckingBalance[];
  holdings: Holding[];
  /** Our own timestamp: Wallbit returns prices with no time reference at all. */
  fetchedAt: number;
}

/** Cash inside the investment account shows up as a holding with no real price. */
const CASH_SYMBOLS = new Set(["USD", "USDT", "USDC"]);

/** Bounded so one large portfolio cannot exhaust the 50-subrequest budget. */
const MAX_PRICED_HOLDINGS = 10;

/**
 * Cheapest call that proves the key is real, carries the `read` permission and
 * belongs to a usable account. Used to reject bad credentials at link time
 * instead of letting the user believe they are connected.
 */
export function verifyApiKey(apiKey: string): Promise<WallbitResult<unknown>> {
  return request(apiKey, "GET", "/balance/checking");
}

export function getCheckingBalance(
  apiKey: string,
): Promise<WallbitResult<{ data?: CheckingBalance[] }>> {
  return request(apiKey, "GET", "/balance/checking");
}

async function assetPrice(apiKey: string, symbol: string): Promise<number | null> {
  const result = await getAsset(apiKey, symbol);
  if (!result.ok) return null;

  const price = result.data?.data?.price;
  return typeof price === "number" ? price : null;
}

/**
 * One read of everything the assistant needs about an account.
 *
 * Balances and holdings are fetched together; prices are then resolved per
 * symbol because /balance/stocks only reports share counts. Callers are
 * expected to cache this — it costs up to 12 subrequests.
 */
export async function accountSnapshot(
  apiKey: string,
): Promise<WallbitResult<AccountSnapshot>> {
  const [checking, stocks] = await Promise.all([
    request<{ data?: CheckingBalance[] }>(apiKey, "GET", "/balance/checking"),
    request<{ data?: { symbol: string; shares: number }[] }>(apiKey, "GET", "/balance/stocks"),
  ]);

  if (!checking.ok) return checking;
  if (!stocks.ok) return stocks;

  const rows = stocks.data?.data ?? [];

  const holdings = await Promise.all(
    rows.map(async (row, index): Promise<Holding> => {
      if (CASH_SYMBOLS.has(row.symbol) || index >= MAX_PRICED_HOLDINGS) {
        return { ...row, price: null, value: null };
      }

      const price = await assetPrice(apiKey, row.symbol);
      return {
        ...row,
        price,
        value: price === null ? null : Number((price * row.shares).toFixed(2)),
      };
    }),
  );

  return {
    ok: true,
    data: {
      checking: checking.data?.data ?? [],
      holdings,
      fetchedAt: Date.now(),
    },
  };
}

// --- assets --------------------------------------------------------------

export interface Asset {
  symbol: string;
  name: string;
  price: number;
  asset_type?: string | null;
  exchange?: string | null;
  sector?: string | null;
  market_cap_m?: string | null;
  description_es?: string | null;
  description?: string | null;
  country?: string | null;
  dividend?: { amount?: number | null; yield?: number | null } | null;
}

export const ASSET_CATEGORIES = [
  "MOST_POPULAR",
  "ETF",
  "DIVIDENDS",
  "TECHNOLOGY",
  "HEALTH",
  "CONSUMER_GOODS",
  "ENERGY_AND_WATER",
  "FINANCE",
  "REAL_ESTATE",
  "TREASURY_BILLS",
  "VIDEOGAMES",
  "ARGENTINA_ADR",
] as const;

export function listAssets(
  apiKey: string,
  params: { category?: string; search?: string; limit?: number },
): Promise<WallbitResult<{ data?: Asset[]; count?: number }>> {
  return request(apiKey, "GET", "/assets", {
    query: {
      category: params.category,
      search: params.search,
      // Hard cap: a full page of 50 assets would dominate the model's context.
      limit: Math.min(params.limit ?? 8, 15),
    },
  });
}

export function getAsset(
  apiKey: string,
  symbol: string,
): Promise<WallbitResult<{ data?: Asset }>> {
  return request(apiKey, "GET", `/assets/${encodeURIComponent(symbol)}`);
}

// --- transactions --------------------------------------------------------

export interface Transaction {
  uuid: string;
  type: string;
  status: string;
  source_currency?: { code?: string } | null;
  dest_currency?: { code?: string } | null;
  source_amount?: number;
  dest_amount?: number;
  created_at: string;
  comment?: string | null;
}

/** Note the double nesting: the payload is { data: { data: [...] } }. */
export function listTransactions(
  apiKey: string,
  params: {
    limit?: number;
    type?: string;
    status?: string;
    currency?: string;
    from_date?: string;
    to_date?: string;
  },
): Promise<WallbitResult<{ data?: { data?: Transaction[]; count?: number } }>> {
  return request(apiKey, "GET", "/transactions", {
    query: {
      limit: params.limit ?? 10,
      type: params.type,
      status: params.status,
      currency: params.currency,
      from_date: params.from_date,
      to_date: params.to_date,
    },
  });
}

// --- misc reads ----------------------------------------------------------

export function getRate(
  apiKey: string,
  sourceCurrency: string,
  destCurrency: string,
): Promise<WallbitResult<{ data?: { pair: string; rate: number; updated_at: string | null } }>> {
  return request(apiKey, "GET", "/rates", {
    query: { source_currency: sourceCurrency, dest_currency: destCurrency },
  });
}

export function getTradeFees(
  apiKey: string,
): Promise<
  WallbitResult<{
    data?: { fee_type?: string; tier?: string; percentage_fee?: string; fixed_fee_usd?: string };
  }>
> {
  return request(apiKey, "POST", "/fees", { body: { type: "TRADE" } });
}

export function getAccountDetails(
  apiKey: string,
  country: string,
  currency: string,
): Promise<WallbitResult<{ data?: Record<string, unknown> }>> {
  return request(apiKey, "GET", "/account-details", { query: { country, currency } });
}

export function listWallets(
  apiKey: string,
): Promise<WallbitResult<{ data?: unknown }>> {
  return request(apiKey, "GET", "/wallets");
}

export function listCards(apiKey: string): Promise<WallbitResult<{ data?: unknown }>> {
  return request(apiKey, "GET", "/cards");
}

export interface TradeReceipt {
  symbol: string;
  direction: string;
  amount: number;
  shares: number;
  status: string;
  order_type: string;
  created_at: string;
}

/**
 * Places a market order.
 *
 * Deliberately NOT exposed as a model tool — it is reachable only from a button
 * the user pressed, carrying a plan they were shown first.
 *
 * Uses `amount` rather than `shares` on purpose: the user confirmed a dollar
 * figure, so that is what must be honoured. Prices move between the plan and the
 * tap; the share count absorbs that, the amount does not.
 */
export function createTrade(
  apiKey: string,
  symbol: string,
  amountUsd: number,
): Promise<WallbitResult<{ data?: TradeReceipt }>> {
  return request(apiKey, "POST", "/trades", {
    body: {
      symbol,
      direction: "BUY",
      currency: "USD",
      order_type: "MARKET",
      amount: amountUsd,
    },
  });
}

/**
 * Revokes the API key used to authenticate this very call. Irreversible: the
 * user has to generate a new one in Wallbit to link again. Never exposed as a
 * model tool — only reachable from the explicit /revocar command.
 */
export function revokeApiKey(apiKey: string): Promise<WallbitResult<unknown>> {
  return request(apiKey, "DELETE", "/api-key");
}
