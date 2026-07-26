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
      "Devuelve la comisión de trading que le corresponde al usuario según su plan: " +
      "porcentaje y costo fijo. Usalo cuando pregunta cuánto le cuesta operar.",
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
      const result = await listAssets(apiKey, {
        search: str(args, "search"),
        category: str(args, "category"),
      });
      if (!result.ok) return unwrap(result);

      // Descriptions are long and rarely change the answer; drop them.
      return (result.data?.data ?? []).map((asset) => ({
        symbol: asset.symbol,
        name: asset.name,
        price: asset.price,
        sector: asset.sector,
        type: asset.asset_type,
      }));
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

      const fees = feesResult.ok ? feesResult.data?.data : undefined;
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
        fee_usd: fee,
        fee_breakdown: `${percentageFee}% + $${fixedFee}`,
        invested_usd: invested,
        approx_shares: Number((invested / asset.price).toFixed(4)),
        available_usd: usdBalance,
        enough_balance: usdBalance >= amount,
        note: "Cálculo al precio de ahora. No es una orden; el usuario la confirma en la app de Wallbit.",
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

    case "get_trade_fees":
      return unwrap(await getTradeFees(apiKey));

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
