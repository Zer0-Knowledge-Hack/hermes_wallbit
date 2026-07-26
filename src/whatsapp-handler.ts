import { reply, type AccountContext } from "./ai";
import type { Env } from "./env";
import { buildToken } from "./link";
import type { Session } from "./session";
import {
  assetCard,
  assetListCard,
  balanceCard,
  categoryLabel,
  CALLBACK,
} from "./ui";
import { accountSnapshot, getAsset, listAssets } from "./wallbit";
import {
  extractMessage,
  sendButtons,
  sendList,
  sendText,
  type WhatsAppIncoming,
} from "./whatsapp";

const SNAPSHOT_TTL_MS = 60_000;

/**
 * WhatsApp categories are a list, not buttons: WhatsApp allows 3 reply buttons
 * and we have twelve categories. Lists take 10 rows, so this is the subset that
 * fits — the full grid stays a Telegram advantage.
 */
const WA_CATEGORIES = [
  "MOST_POPULAR",
  "ETF",
  "DIVIDENDS",
  "TECHNOLOGY",
  "HEALTH",
  "FINANCE",
  "ENERGY_AND_WATER",
  "REAL_ESTATE",
  "TREASURY_BILLS",
  "CONSUMER_GOODS",
];

/**
 * Sessions are namespaced by channel. Without the prefix a Telegram chat_id and
 * a phone number could collide on the same Durable Object and merge two
 * different people's accounts.
 */
function sessionFor(env: Env, phone: string) {
  return env.SESSION.get(env.SESSION.idFromName(`wa:${phone}`));
}

async function loadAccount(
  session: DurableObjectStub<Session>,
  linked: boolean,
): Promise<AccountContext> {
  if (!linked) return { state: "unlinked" };

  const apiKey = await session.apiKey();
  if (apiKey === null) return { state: "unlinked" };

  const cached = await session.cachedSnapshot(SNAPSHOT_TTL_MS);
  if (cached !== null) return { state: "ready", snapshot: cached, apiKey };

  const result = await accountSnapshot(apiKey);
  if (!result.ok) return { state: "unavailable" };

  await session.storeSnapshot(result.data);
  return { state: "ready", snapshot: result.data, apiKey };
}

export async function handleWhatsApp(
  body: unknown,
  env: Env,
  origin: string,
): Promise<void> {
  const incoming = extractMessage(body);
  if (incoming === null) return;

  const session = sessionFor(env, incoming.from);
  await session.rememberIdentity("whatsapp", incoming.from, incoming.name);

  const profile = await session.profile();

  if (incoming.isAction) {
    await handleAction(incoming, env, session, profile.linked);
    return;
  }

  const command = incoming.text.trim().split(/\s+/)[0].toLowerCase();

  switch (command) {
    case "/start":
    case "hola":
    case "menu": {
      const name = profile.firstName ?? "";
      await sendButtons(
        env,
        incoming.from,
        `Hola${name ? ` ${name}` : ""}, soy *Hermes*.\n\n` +
          `Te ayudo a decidir qué hacer con la plata que cobrás en Wallbit.\n\n` +
          (profile.linked
            ? "Tu cuenta ya está vinculada."
            : "Para empezar, escribí */vincular* y conectá tu cuenta."),
        profile.linked
          ? [
              { id: "balance", label: "Mi cuenta" },
              { id: CALLBACK.categories, label: "Dónde invertir" },
            ]
          : [],
      );
      return;
    }

    case "/vincular": {
      const nonce = await session.issueLinkToken();
      // The link page keys the Durable Object by whatever id it is given, so the
      // channel prefix has to travel with it.
      const link = `${origin}/link?t=${buildToken(`wa:${incoming.from}`, nonce)}`;
      await sendText(
        env,
        incoming.from,
        `Abrí este enlace para pegar tu API key de Wallbit:\n\n${link}\n\n` +
          `Sirve una sola vez y vence en 10 minutos. No lo compartas.`,
      );
      return;
    }

    case "/desvincular": {
      await session.unlink();
      await sendText(
        env,
        incoming.from,
        "Borré tu API key de mis registros.\n\n" +
          "*Importante:* sigue existiendo y activa en Wallbit. " +
          "Para eliminarla del todo, borrala desde Wallbit → Settings → API Keys.",
      );
      return;
    }

    case "/saldo": {
      const context = await loadAccount(session, profile.linked);

      if (context.state !== "ready") {
        await sendText(
          env,
          incoming.from,
          context.state === "unlinked"
            ? "Todavía no vinculaste tu cuenta. Escribí */vincular*."
            : "No pude leer tu cuenta ahora mismo. Probá de nuevo en un rato.",
        );
        return;
      }

      await sendButtons(env, incoming.from, balanceCard(context.snapshot), [
        { id: CALLBACK.categories, label: "Dónde invertir" },
        { id: CALLBACK.refresh, label: "Actualizar" },
      ]);
      return;
    }

    case "/invertir": {
      if (!profile.linked) {
        await sendText(env, incoming.from, "Vinculá tu cuenta primero con */vincular*.");
        return;
      }
      await sendCategories(env, incoming.from);
      return;
    }

    case "/alertas": {
      if (!profile.linked) {
        await sendText(env, incoming.from, "Vinculá tu cuenta primero con */vincular*.");
        return;
      }

      if (await session.watching()) {
        await session.stopWatching();
        await sendText(env, incoming.from, "🔕 Listo, no te escribo más por mi cuenta.");
      } else {
        const started = await session.startWatching();
        await sendText(
          env,
          incoming.from,
          started
            ? "🔔 *Alertas activadas*\n\nTe aviso cuando entre plata a tu cuenta."
            : "No pude leer tu cuenta para activar las alertas.",
        );
      }
      return;
    }

    case "/reset": {
      await session.reset();
      await sendText(env, incoming.from, "Listo, arrancamos de cero.");
      return;
    }
  }

  const context = await loadAccount(session, profile.linked);
  const history = await session.history();
  const answer = await reply(env, profile, context, history, incoming.text);

  // Off-topic turns stay out of history, or the drift compounds.
  if (!answer.offTopic) {
    await session.append("user", incoming.text);
    await session.append("assistant", answer.text);
  }

  await sendText(env, incoming.from, answer.text);
}

async function sendCategories(env: Env, to: string): Promise<void> {
  await sendList(
    env,
    to,
    "🔎 *¿Dónde querés invertir?*\n\nElegí una categoría.",
    "Ver categorías",
    WA_CATEGORIES.map((code) => ({
      id: CALLBACK.category(code),
      // Emoji are stripped: list titles are capped at 24 characters.
      title: categoryLabel(code).replace(/^\S+\s/, ""),
    })),
  );
}

async function handleAction(
  incoming: WhatsAppIncoming,
  env: Env,
  session: DurableObjectStub<Session>,
  linked: boolean,
): Promise<void> {
  const apiKey = await session.apiKey();

  if (apiKey === null) {
    await sendText(env, incoming.from, "Vinculá tu cuenta con */vincular*.");
    return;
  }

  const data = incoming.text;

  if (data === CALLBACK.categories) {
    await sendCategories(env, incoming.from);
    return;
  }

  if (data === "balance" || data === CALLBACK.refresh) {
    if (data === CALLBACK.refresh) await session.clearSnapshot();

    const context = await loadAccount(session, linked);
    await sendText(
      env,
      incoming.from,
      context.state === "ready"
        ? balanceCard(context.snapshot)
        : "No pude leer tu cuenta ahora mismo.",
    );
    return;
  }

  if (data.startsWith("cat:")) {
    const category = data.slice(4);
    const result = await listAssets(apiKey, { category, limit: 8 });

    if (!result.ok) {
      await sendText(env, incoming.from, "No pude leer el catálogo ahora. Probá de nuevo.");
      return;
    }

    const assets = result.data?.data ?? [];
    await sendList(
      env,
      incoming.from,
      assetListCard(category, assets),
      "Ver detalle",
      assets.map((asset) => ({
        id: CALLBACK.asset(asset.symbol),
        title: asset.symbol,
        description: asset.name,
      })),
    );
    return;
  }

  if (data.startsWith("ast:")) {
    const symbol = data.slice(4);
    const result = await getAsset(apiKey, symbol);
    const asset = result.ok ? result.data?.data : undefined;

    await sendButtons(
      env,
      incoming.from,
      asset === undefined ? `No pude leer el detalle de ${symbol}.` : assetCard(asset),
      [{ id: CALLBACK.categories, label: "Ver más opciones" }],
    );
    return;
  }
}
