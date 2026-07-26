import {
  ASSET_CATEGORIES,
  getAccountDetails,
  getAsset,
  getCheckingBalance,
  getRate,
  getTradeFees,
  listAssets,
  listCards,
  listTransactions,
  listWallets,
  type WallbitResult,
} from "./wallbit";
import type { Env } from "./env";
import { getWhatsAppConnectionInfo, getWhatsAppStatus } from "./whatsapp-client";

interface FunctionSpec {
  name: string;
  description: string;
  parameters: {
    type: string;
    required?: string[];
    properties: Record<string, { type: string; description: string }>;
  };
}

/**
 * Tools exposed to the model.
 *
 * READ-ONLY, on purpose. Wallbit's API can also place trades, move money between
 * checking and investment, block cards and revoke the key. None of those are
 * here: an action that moves someone's money must come from an explicit user
 * command with confirmation, never from a model's interpretation of a sentence.
 */
const FUNCTIONS: FunctionSpec[] = [
  {
    name: "search_assets",
    description:
      "Busca acciones y ETFs disponibles para invertir en Wallbit. Usalo cuando el usuario " +
      "pregunta en qué puede invertir, o por un sector o tipo de instrumento. " +
      "Devuelve símbolo, nombre, precio actual y sector.",
    parameters: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description: "Texto libre: símbolo, nombre de empresa o palabra clave. Opcional.",
        },
        category: {
          type: "string",
          description: `Categoría del catálogo. Una de: ${ASSET_CATEGORIES.join(", ")}. Opcional.`,
        },
      },
      required: [],
    },
  },
  {
    name: "get_asset",
    description:
      "Trae el detalle de un activo puntual por su símbolo: precio, sector, país, " +
      "capitalización y dividendo. Usalo cuando el usuario nombra un símbolo concreto.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Símbolo del activo, por ejemplo AAPL o SPY." },
      },
      required: ["symbol"],
    },
  },
  {
    name: "plan_investment",
    description:
      "Calcula cómo quedaría una inversión concreta antes de hacerla: cuántas acciones " +
      "compraría ese monto al precio de hoy, cuánto se lleva la comisión y cuánto saldo " +
      "le queda. Usalo apenas el usuario menciona un monto y un instrumento, o cuando " +
      "pide comparar cuánto le rinde invertir cierta plata. NO ejecuta la compra.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Símbolo del activo, por ejemplo SPY." },
        amount_usd: { type: "number", description: "Monto en dólares que quiere destinar." },
      },
      required: ["symbol", "amount_usd"],
    },
  },
  {
    name: "list_transactions",
    description:
      "Lista los movimientos de la cuenta del usuario: depósitos, retiros, operaciones. " +
      "Usalo cuando pregunta por su historial, cuándo cobró, o en qué gastó.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Cuántos movimientos traer. Máximo 20." },
        type: { type: "string", description: "Filtrar por tipo, por ejemplo TRADE. Opcional." },
        status: { type: "string", description: "Filtrar por estado, por ejemplo COMPLETED. Opcional." },
        from_date: { type: "string", description: "Desde, formato YYYY-MM-DD. Opcional." },
        to_date: { type: "string", description: "Hasta, formato YYYY-MM-DD. Opcional." },
      },
      required: [],
    },
  },
  {
    name: "get_trade_fees",
    description:
      "Devuelve la comisión de trading EXACTA que le corresponde al usuario según " +
      "su plan: porcentaje y costo fijo. Llamalo SIEMPRE que se hable de comisiones, " +
      "costos de operar o cuánto se descuenta. Nunca estimes una comisión: este dato " +
      "es exacto y viene de Wallbit.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_rate",
    description:
      "Tipo de cambio entre dos monedas dentro de Wallbit. Usalo cuando pregunta " +
      "cuánto vale una moneda en otra.",
    parameters: {
      type: "object",
      properties: {
        source_currency: { type: "string", description: "Moneda de origen, por ejemplo BOB." },
        dest_currency: { type: "string", description: "Moneda de destino, por ejemplo USD." },
      },
      required: ["source_currency", "dest_currency"],
    },
  },
  {
    name: "get_deposit_details",
    description:
      "Datos bancarios para que le depositen desde el exterior (ACH en US, SEPA en EU). " +
      "Usalo cuando pregunta cómo hacer que le paguen o dónde recibir dinero.",
    parameters: {
      type: "object",
      properties: {
        country: { type: "string", description: "US o EU. Por defecto US." },
        currency: { type: "string", description: "USD o EUR. Por defecto USD." },
      },
      required: [],
    },
  },
  {
    name: "get_crypto_wallets",
    description:
      "Direcciones de wallets cripto del usuario para recibir USDT, USDC, BTC o ETH.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_cards",
    description: "Lista las tarjetas del usuario y su estado (activa o suspendida).",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_whatsapp_status",
    description:
      "Devuelve el estado de conexión del bot local de WhatsApp (/whatshat) a través del túnel HTTPS: si está conectado, el número vinculado y el tiempo de actividad. Usalo cuando el usuario pregunte por el bot de WhatsApp, si está activo, o si el túnel está funcionando.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

/**
 * Workers AI rejects the flat {name, description, parameters} shape for this
 * model — it validates against the OpenAI schema and requires the `function`
 * wrapper. Getting this wrong surfaces as "8007: ... 'function' Field required".
 */
export const TOOLS = FUNCTIONS.map((fn) => ({ type: "function" as const, function: fn }));

type Args = Record<string, unknown>;

/**
 * Spanish and lowercase spellings the model reaches for instead of the enum.
 * Without this, "Tecnología" went straight to the API, which ignored the filter
 * and returned the UNFILTERED catalogue — so the bot listed assets that had
 * nothing to do with the category the user asked for.
 */
const CATEGORY_ALIASES: Record<string, string> = {
  POPULAR: "MOST_POPULAR",
  POPULARES: "MOST_POPULAR",
  MASPOPULAR: "MOST_POPULAR",
  ETFS: "ETF",
  FONDOS: "ETF",
  DIVIDENDO: "DIVIDENDS",
  DIVIDENDOS: "DIVIDENDS",
  TECNOLOGIA: "TECHNOLOGY",
  TECH: "TECHNOLOGY",
  SALUD: "HEALTH",
  CONSUMO: "CONSUMER_GOODS",
  CONSUMERGOODS: "CONSUMER_GOODS",
  ENERGIA: "ENERGY_AND_WATER",
  ENERGIAYAGUA: "ENERGY_AND_WATER",
  AGUA: "ENERGY_AND_WATER",
  FINANZAS: "FINANCE",
  BANCOS: "FINANCE",
  INMUEBLES: "REAL_ESTATE",
  REALESTATE: "REAL_ESTATE",
  BIENESRAICES: "REAL_ESTATE",
  BONOS: "TREASURY_BILLS",
  TESORO: "TREASURY_BILLS",
  TREASURY: "TREASURY_BILLS",
  VIDEOJUEGOS: "VIDEOGAMES",
  JUEGOS: "VIDEOGAMES",
  ARGENTINA: "ARGENTINA_ADR",
  ADR: "ARGENTINA_ADR",
};

/**
 * Returns a valid enum value, or null when the input matches nothing.
 *
 * Null means "do not send a category" — silently forwarding an unrecognised
 * value is what produced the wrong listings in the first place.
 */
function normalizeCategory(raw: string | undefined): string | null {
  if (raw === undefined) return null;

  const key = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();

  if ((ASSET_CATEGORIES as readonly string[]).includes(key)) return key;
  return CATEGORY_ALIASES[key] ?? null;
}

function str(args: Args, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Tool output goes straight into the prompt, so it is trimmed to what matters. */
function unwrap<T>(result: WallbitResult<T>): unknown {
  if (result.ok) return result.data;
  return { error: result.reason, status: result.status };
}

function unwrapWhatsApp<T>(result: { ok: boolean; data?: T; error?: string }): unknown {
  if (result.ok) return result.data;
  return { error: result.error };
}

export async function runTool(
  apiKey: string,
  name: string,
  args: Args,
  env?: Env,
): Promise<unknown> {
  switch (name) {
    case "search_assets": {
      const requested = str(args, "category");
      const category = normalizeCategory(requested);

      if (requested !== undefined && category === null) {
        // Told plainly instead of guessing: a wrong category is worse than none,
        // because the user acts on a list that does not match what they asked.
        return {
          error: "unknown_category",
          requested,
          valid_categories: ASSET_CATEGORIES,
        };
      }

      const result = await listAssets(apiKey, {
        search: str(args, "search"),
        category: category ?? undefined,
      });
      if (!result.ok) return unwrap(result);

      const found = result.data?.data ?? [];
      const total = result.data?.count ?? found.length;

      // The total travels with the list so the assistant never implies these are
      // all of them. Wallbit's app shows the whole category; showing 8 of 47 as
      // if that were the catalogue is what made the bot disagree with the app.
      return {
        category: category ?? "todas",
        showing: found.length,
        total,
        note:
          total > found.length
            ? `Hay ${total} en esta categoría; estos son los primeros ${found.length} por relevancia. Decilo si el usuario podría esperar más.`
            : undefined,
        // Descriptions are long and rarely change the answer; drop them.
        assets: found.map((asset) => ({
          symbol: asset.symbol,
          name: asset.name,
          price: asset.price,
          sector: asset.sector,
          type: asset.asset_type,
        })),
      };
    }

    case "get_asset": {
      const symbol = str(args, "symbol");
      if (symbol === undefined) return { error: "missing_symbol" };

      const result = await getAsset(apiKey, symbol);
      if (!result.ok) return unwrap(result);

      const asset = result.data?.data;
      if (asset === undefined) return { error: "not_found" };

      return {
        symbol: asset.symbol,
        name: asset.name,
        price: asset.price,
        sector: asset.sector,
        country: asset.country,
        market_cap_m: asset.market_cap_m,
        dividend_yield: asset.dividend?.yield ?? null,
      };
    }

    case "plan_investment": {
      const symbol = str(args, "symbol");
      const amount = typeof args.amount_usd === "number" ? args.amount_usd : Number(args.amount_usd);

      if (symbol === undefined || !Number.isFinite(amount) || amount <= 0) {
        return { error: "missing_symbol_or_amount" };
      }

      // Price, fee tier and available cash are all needed to state real numbers.
      const [assetResult, feesResult, balanceResult] = await Promise.all([
        getAsset(apiKey, symbol),
        getTradeFees(apiKey),
        getCheckingBalance(apiKey),
      ]);

      if (!assetResult.ok) return unwrap(assetResult);
      const asset = assetResult.data?.data;
      if (asset === undefined || typeof asset.price !== "number") {
        return { error: "no_price", symbol };
      }

      // Same empty-array case as get_trade_fees: `data` is [] when no fee
      // configuration matches, and treating that as an object silently yields a
      // zero fee — a plan that understates what the trade actually costs.
      const rawFees = feesResult.ok ? feesResult.data?.data : undefined;
      const fees = rawFees !== undefined && !Array.isArray(rawFees) ? rawFees : undefined;
      const feeKnown = fees !== undefined;
      const percentageFee = Number(fees?.percentage_fee ?? 0);
      const fixedFee = Number(fees?.fixed_fee_usd ?? 0);
      const fee = Number(((amount * percentageFee) / 100 + fixedFee).toFixed(2));

      const invested = Number((amount - fee).toFixed(2));
      const usdBalance = balanceResult.ok
        ? (balanceResult.data?.data ?? []).find((row) => row.currency === "USD")?.balance ?? 0
        : 0;

      return {
        symbol: asset.symbol,
        name: asset.name,
        price_now: asset.price,
        amount_usd: amount,
        fee_usd: feeKnown ? fee : null,
        fee_breakdown: feeKnown
          ? `${percentageFee}% + $${fixedFee}`
          : "no disponible — Wallbit no devolvió la comisión de esta cuenta",
        invested_usd: invested,
        approx_shares: Number((invested / asset.price).toFixed(4)),
        available_usd: usdBalance,
        enough_balance: usdBalance >= amount,
        note: feeKnown
          ? "Cálculo al precio de ahora. No es una orden; la confirma el usuario."
          : "Cálculo al precio de ahora, SIN comisión porque Wallbit no la devolvió. Aclaralo; no inventes un porcentaje.",
      };
    }

    case "list_transactions": {
      const limitArg = args.limit;
      const limit = typeof limitArg === "number" ? Math.min(limitArg, 20) : 10;

      const result = await listTransactions(apiKey, {
        limit,
        type: str(args, "type"),
        status: str(args, "status"),
        from_date: str(args, "from_date"),
        to_date: str(args, "to_date"),
      });
      if (!result.ok) return unwrap(result);

      return (result.data?.data?.data ?? []).map((transaction) => ({
        type: transaction.type,
        status: transaction.status,
        amount: transaction.source_amount,
        currency: transaction.source_currency?.code,
        date: transaction.created_at?.slice(0, 10),
      }));
    }

    case "get_trade_fees": {
      const result = await getTradeFees(apiKey);
      if (!result.ok) return unwrap(result);

      const fees = result.data?.data;

      // Wallbit answers `data: []` — an empty ARRAY, not an object — when no fee
      // configuration matches the account. Left unhandled the model saw nothing
      // usable and quietly estimated instead of saying it did not know.
      if (fees === undefined || Array.isArray(fees)) {
        return {
          error: "no_fee_config",
          note: "Wallbit no devolvió configuración de comisiones para esta cuenta. Decí que no pudiste consultarla; NO estimes ni inventes un porcentaje.",
        };
      }

      const percentage = Number(fees.percentage_fee ?? 0);
      const fixed = Number(fees.fixed_fee_usd ?? 0);

      return {
        tier: fees.tier ?? null,
        percentage_fee: percentage,
        fixed_fee_usd: fixed,
        // Pre-phrased so the model states it instead of paraphrasing it wrong.
        summary: `${percentage}% del monto${fixed > 0 ? ` + $${fixed.toFixed(2)} fijos` : ", sin costo fijo"}`,
        example_on_100_usd: Number(((100 * percentage) / 100 + fixed).toFixed(2)),
      };
    }

    case "get_rate": {
      const source = str(args, "source_currency");
      const dest = str(args, "dest_currency");
      if (source === undefined || dest === undefined) return { error: "missing_currency" };

      return unwrap(await getRate(apiKey, source, dest));
    }

    case "get_deposit_details":
      return unwrap(
        await getAccountDetails(apiKey, str(args, "country") ?? "US", str(args, "currency") ?? "USD"),
      );

    case "get_crypto_wallets":
      return unwrap(await listWallets(apiKey));

    case "list_cards":
      return unwrap(await listCards(apiKey));

    case "get_whatsapp_status": {
      const [conn, status] = await Promise.all([
        getWhatsAppConnectionInfo(env?.WHATSAPP_API_URL),
        getWhatsAppStatus(env?.WHATSAPP_API_URL),
      ]);
      return {
        connection: unwrapWhatsApp(conn),
        server_status: unwrapWhatsApp(status),
        tunnel_url: env?.WHATSAPP_API_URL || "not_configured",
      };
    }

    default:
      return { error: "unknown_tool", name };
  }
}
