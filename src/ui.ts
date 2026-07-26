import { escapeHtml } from "./telegram";
import type { Asset } from "./wallbit";
import type { AccountSnapshot } from "./wallbit";

/**
 * Presentation layer.
 *
 * Cards are built from short lines rather than monospace tables: a phone shows
 * roughly 30 characters of monospace before wrapping, and a wrapped table looks
 * far worse than no table.
 */

export type InlineButton =
  | { text: string; callback_data: string }
  | { text: string; url: string };

export type InlineKeyboard = InlineButton[][];

/** Callback payloads are capped at 64 bytes by Telegram. */
export const CALLBACK = {
  category: (code: string) => `cat:${code}`,
  asset: (symbol: string) => `ast:${symbol}`,
  refresh: "refresh",
  categories: "cats",
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  MOST_POPULAR: "🔥 Populares",
  ETF: "📊 ETFs",
  DIVIDENDS: "💵 Dividendos",
  TECHNOLOGY: "💻 Tecnología",
  HEALTH: "🏥 Salud",
  CONSUMER_GOODS: "🛒 Consumo",
  ENERGY_AND_WATER: "⚡ Energía",
  FINANCE: "🏦 Finanzas",
  REAL_ESTATE: "🏠 Inmuebles",
  TREASURY_BILLS: "🏛 Bonos EE.UU.",
  VIDEOGAMES: "🎮 Videojuegos",
  ARGENTINA_ADR: "🇦🇷 ADR Argentina",
};

export function categoryLabel(code: string): string {
  return CATEGORY_LABELS[code] ?? code;
}

/** Two per row: full-width buttons waste space, three per row truncate labels. */
export function categoryKeyboard(): InlineKeyboard {
  const codes = Object.keys(CATEGORY_LABELS);
  const rows: InlineKeyboard = [];

  for (let i = 0; i < codes.length; i += 2) {
    rows.push(
      codes.slice(i, i + 2).map((code) => ({
        text: CATEGORY_LABELS[code],
        callback_data: CALLBACK.category(code),
      })),
    );
  }

  return rows;
}

export function assetKeyboard(symbols: string[], back = true): InlineKeyboard {
  const rows: InlineKeyboard = [];

  for (let i = 0; i < symbols.length; i += 3) {
    rows.push(
      symbols.slice(i, i + 3).map((symbol) => ({
        text: symbol,
        callback_data: CALLBACK.asset(symbol),
      })),
    );
  }

  if (back) {
    rows.push([{ text: "‹ Categorías", callback_data: CALLBACK.categories }]);
  }

  return rows;
}

export function balanceKeyboard(): InlineKeyboard {
  return [
    [
      { text: "🔎 Dónde invertir", callback_data: CALLBACK.categories },
      { text: "🔄 Actualizar", callback_data: CALLBACK.refresh },
    ],
  ];
}

function money(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function balanceCard(snapshot: AccountSnapshot): string {
  const lines = ["💰 <b>Tu cuenta</b>", ""];

  lines.push("<b>Disponible</b>");
  if (snapshot.checking.length === 0) {
    lines.push("Sin saldo en checking.");
  } else {
    for (const row of snapshot.checking) {
      lines.push(`${row.currency} <b>${money(row.balance)}</b>`);
    }
  }

  lines.push("");

  const priced = snapshot.holdings.filter((h) => h.value !== null);
  const total = priced.reduce((sum, h) => sum + (h.value ?? 0), 0);

  if (snapshot.holdings.length === 0) {
    lines.push("<b>Cartera</b>");
    lines.push("Todavía no tenés inversiones.");
  } else {
    lines.push(total > 0 ? `<b>Cartera</b> · $${money(total)}` : "<b>Cartera</b>");

    for (const holding of snapshot.holdings) {
      const symbol = escapeHtml(holding.symbol);
      lines.push(
        holding.value === null
          ? `• <b>${symbol}</b> · ${holding.shares}`
          : `• <b>${symbol}</b> · ${holding.shares} × $${money(holding.price ?? 0)} · $${money(holding.value)}`,
      );
    }
  }

  const asOf = new Date(snapshot.fetchedAt).toISOString().slice(11, 16);
  lines.push("", `<i>Leído ${asOf} UTC</i>`);

  return lines.join("\n");
}

export function assetListCard(category: string, assets: Asset[]): string {
  if (assets.length === 0) {
    return `${categoryLabel(category)}\n\nNo encontré instrumentos en esta categoría.`;
  }

  const lines = [`${categoryLabel(category)}`, ""];

  for (const asset of assets) {
    lines.push(`• <b>${escapeHtml(asset.symbol)}</b> · $${money(asset.price)}`);
    lines.push(`  <i>${escapeHtml(asset.name)}</i>`);
  }

  lines.push("", "Tocá un símbolo para ver el detalle.");

  return lines.join("\n");
}

export function assetCard(asset: Asset): string {
  const lines = [
    `<b>${escapeHtml(asset.symbol)}</b> · $${money(asset.price)}`,
    `<i>${escapeHtml(asset.name)}</i>`,
    "",
  ];

  if (asset.sector) lines.push(`Sector · ${escapeHtml(asset.sector)}`);
  if (asset.country) lines.push(`País · ${escapeHtml(asset.country)}`);
  if (asset.market_cap_m) lines.push(`Capitalización · $${escapeHtml(asset.market_cap_m)}M`);

  const dividendYield = asset.dividend?.yield;
  if (typeof dividendYield === "number" && dividendYield > 0) {
    lines.push(`Dividendo · ${dividendYield}%`);
  }

  lines.push("", "<i>Para operar, entrá a la app de Wallbit.</i>");

  return lines.join("\n");
}
