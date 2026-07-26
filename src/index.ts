import { reply, type AccountContext, type ReplyResult } from "./ai";
import type { Env } from "./env";
import { buildToken, handleLink } from "./link";
import type { Session, Profile, Turn } from "./session";
import {
  answerCallback,
  editMessage,
  escapeHtml,
  sendMessage,
  sendTyping,
  toTelegramHtml,
  type TelegramCallbackQuery,
  type TelegramUpdate,
} from "./telegram";
import {
  assetCard,
  assetKeyboard,
  assetListCard,
  balanceCard,
  balanceKeyboard,
  categoryKeyboard,
  categoryLabel,
  type InlineKeyboard,
} from "./ui";
import {
  accountSnapshot,
  createTrade,
  getAsset,
  listAssets,
  revokeApiKey,
  type WallbitFailure,
} from "./wallbit";
import { handleVerification, verifySignature } from "./whatsapp";
import { handleWhatsApp } from "./whatsapp-handler";
import { sendZavudevAlert } from "./zavudev";
import { getWhatsAppConnectionInfo, getWhatsAppStatus } from "./whatsapp-client";

/** How long an account snapshot stays fresh before we ask Wallbit again. */
const SNAPSHOT_TTL_MS = 60_000;

export { Session } from "./session";

const REVOKE_FAILURE: Record<WallbitFailure, string> = {
  unauthorized:
    "Wallbit rechazó la key: puede que ya estuviera revocada o vencida. " +
    "La borré de mis registros igual. Revisá en Wallbit → Settings → API Keys.",
  forbidden:
    "Wallbit no permitió revocarla con los permisos de esa key. " +
    "La borré de mis registros, pero tenés que eliminarla vos desde Wallbit.",
  blocked:
    "Wallbit reporta la cuenta bloqueada o con KYC incompleto, así que no pude revocarla. " +
    "La borré de mis registros. Resolvelo en la app y eliminala desde ahí.",
  not_found:
    "Wallbit no encontró esa API key, así que probablemente ya no existe. " +
    "La borré de mis registros igual.",
  invalid:
    "Wallbit rechazó el pedido. La borré de mis registros, " +
    "pero eliminala vos desde Wallbit → Settings → API Keys.",
  rate_limited:
    "Wallbit está limitando los pedidos ahora mismo. No pude revocarla. " +
    "Probá de nuevo en unos minutos o eliminala desde la app.",
  server:
    "Wallbit tuvo un error interno y no pude revocarla. " +
    "Probá más tarde o eliminala desde Wallbit → Settings → API Keys.",
  network:
    "No pude comunicarme con Wallbit. No revoqué nada y tu vínculo sigue intacto. " +
    "Probá de nuevo en un rato.",
};

async function handleWhatsAppAi(request: Request, env: Env): Promise<Response> {
  const authHeader =
    request.headers.get("X-Webhook-Secret") ??
    request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (authHeader !== env.WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let body: {
    jid?: string;
    apiKey?: string;
    text?: string;
    history?: Turn[];
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "malformed_body" }), { status: 400 });
  }

  if (!body.text || !body.jid) {
    return new Response(JSON.stringify({ error: "missing_fields" }), { status: 400 });
  }

  const profile: Profile = {
    firstName: null,
    linked: Boolean(body.apiKey),
  };

  let context: AccountContext = { state: "unlinked" };
  if (body.apiKey) {
    const res = await accountSnapshot(body.apiKey);
    if (res.ok) {
      context = { state: "ready", snapshot: res.data, apiKey: body.apiKey };
    } else {
      context = { state: "unavailable" };
    }
  }

  const history = Array.isArray(body.history) ? body.history : [];
  const answer = await reply(env, profile, context, history, body.text);
  const guarded = guardAgainstInventedFigures(answer, profile.linked);

  return new Response(
    JSON.stringify({
      text: guarded.text,
      usedTools: answer.usedTools,
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/link") {
      return handleLink(request, env);
    }

    if (url.pathname === "/whatsapp") {
      // Meta proves it owns the endpoint with a GET carrying hub.* params.
      if (request.method === "GET") {
        return handleVerification(url, env);
      }

      if (request.method !== "POST") {
        return new Response("method not allowed", { status: 405 });
      }

      // The signature covers the RAW bytes: parsing first and re-serialising
      // would produce a different string and never match.
      const raw = await request.text();
      const signed = await verifySignature(
        raw,
        request.headers.get("X-Hub-Signature-256"),
        env.WHATSAPP_APP_SECRET,
      );

      // Meta also retries on non-2xx, so rejection means "do not process".
      if (!signed) {
        console.warn("rejected whatsapp update: bad signature");
        return new Response("ok");
      }

      try {
        const body = JSON.parse(raw) as unknown;
        ctx.waitUntil(handleWhatsApp(body, env, url.origin));
      } catch (error) {
        console.error("rejected whatsapp update: malformed body", error);
      }

      return new Response("ok");
    }

    if (url.pathname === "/api/whatsapp/ai" && request.method === "POST") {
      return handleWhatsAppAi(request, env);
    }

    if (request.method !== "POST") {
      return new Response("hermes-bot is running");
    }

    // EVERY path below answers 200, on purpose.
    //
    // Telegram treats any non-2xx as a failed delivery and re-queues the update,
    // retrying with backoff forever. A window of 403s — say, the deploy landing
    // before the secret was set — builds a backlog that never drains and can
    // leave the bot unresponsive long after the real problem is gone.
    //
    // Rejecting an update means not acting on it, not refusing the delivery.

    // Telegram echoes the secret configured with setWebhook. Without this check
    // anyone who discovers the Worker URL could inject fake updates.
    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      console.warn("rejected update: secret mismatch");
      return new Response("ok");
    }

    let update: TelegramUpdate;
    try {
      update = (await request.json()) as TelegramUpdate;
    } catch (error) {
      console.error("rejected update: malformed body", error);
      return new Response("ok");
    }

    // Acknowledge immediately and finish the work in the background. If we held
    // the response open while the model runs, Telegram would time out, retry the
    // update, and the bot would answer twice.
    ctx.waitUntil(
      update.callback_query
        ? handleCallback(update.callback_query, env)
        : handleUpdate(update, env, url.origin),
    );

    return new Response("ok");
  },

  // No scheduled() handler: proactive checks live in each Session's own alarm.
  // A central cron cannot find the users — Durable Objects cannot be enumerated.
} satisfies ExportedHandler<Env>;

/**
 * Balance and holdings are read eagerly and injected into the prompt: they are
 * small, always relevant, and this way the model cannot skip the lookup. Every
 * other read — catalogue, transactions, fees, rates — is a tool, because what to
 * fetch depends on the question.
 */
async function loadAccount(
  session: DurableObjectStub<Session>,
  linked: boolean,
): Promise<AccountContext> {
  if (!linked) return { state: "unlinked" };

  // Needed even on a cache hit: the tools authenticate with it.
  const apiKey = await session.apiKey();
  if (apiKey === null) return { state: "unlinked" };

  const cached = await session.cachedSnapshot(SNAPSHOT_TTL_MS);
  if (cached !== null) return { state: "ready", snapshot: cached, apiKey };

  const result = await accountSnapshot(apiKey);
  if (!result.ok) return { state: "unavailable" };

  await session.storeSnapshot(result.data);
  return { state: "ready", snapshot: result.data, apiKey };
}

/**
 * Button presses. Each branch edits the message in place instead of sending a
 * new one, so browsing categories does not bury the chat in dead cards.
 */
async function handleCallback(query: TelegramCallbackQuery, env: Env): Promise<void> {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const data = query.data ?? "";

  if (chatId === undefined || messageId === undefined) {
    await answerCallback(env.BOT_TOKEN, query.id);
    return;
  }

  const session = env.SESSION.get(env.SESSION.idFromName(String(chatId)));
  const apiKey = await session.apiKey();

  if (apiKey === null) {
    await answerCallback(env.BOT_TOKEN, query.id, "Vinculá tu cuenta con /vincular");
    return;
  }

  if (data === "cats") {
    await answerCallback(env.BOT_TOKEN, query.id);
    await editMessage(
      env.BOT_TOKEN,
      chatId,
      messageId,
      "🔎 <b>¿Dónde querés invertir?</b>\n\nElegí una categoría.",
      categoryKeyboard(),
    );
    return;
  }

  if (data === "refresh") {
    await session.clearSnapshot();
    const result = await accountSnapshot(apiKey);

    if (!result.ok) {
      await answerCallback(env.BOT_TOKEN, query.id, "No pude leer tu cuenta ahora.");
      return;
    }

    await session.storeSnapshot(result.data);
    await answerCallback(env.BOT_TOKEN, query.id, "Actualizado");
    await editMessage(
      env.BOT_TOKEN,
      chatId,
      messageId,
      balanceCard(result.data),
      balanceKeyboard(),
    );
    return;
  }

  if (data.startsWith("cat:")) {
    const category = data.slice(4);
    await answerCallback(env.BOT_TOKEN, query.id);

    const result = await listAssets(apiKey, { category, limit: 8 });
    if (!result.ok) {
      await editMessage(
        env.BOT_TOKEN,
        chatId,
        messageId,
        `${categoryLabel(category)}\n\nNo pude leer el catálogo ahora. Probá de nuevo.`,
        [[{ text: "‹ Categorías", callback_data: "cats" }]],
      );
      return;
    }

    const assets = result.data?.data ?? [];
    await editMessage(
      env.BOT_TOKEN,
      chatId,
      messageId,
      assetListCard(category, assets),
      assetKeyboard(assets.map((asset) => asset.symbol)),
    );
    return;
  }

  if (data.startsWith("buy:")) {
    const id = data.slice(4);

    // Atomic inside the Durable Object: a second tap finds it already claimed.
    // There is no order-status endpoint to reconcile against, so this is the
    // only thing standing between a double tap and a double purchase.
    const staged = await session.claimTrade(id);

    if (staged === null) {
      await answerCallback(env.BOT_TOKEN, query.id, "Esa confirmación ya venció o ya se usó.");
      await editMessage(
        env.BOT_TOKEN,
        chatId,
        messageId,
        "Esta confirmación ya no es válida. Pedime el cálculo de nuevo y te muestro el precio actual.",
      );
      return;
    }

    await answerCallback(env.BOT_TOKEN, query.id, "Enviando la orden...");

    const result = await createTrade(apiKey, staged.symbol, staged.amountUsd);

    if (!result.ok) {
      await session.settleTrade(id, "failed");
      await editMessage(
        env.BOT_TOKEN,
        chatId,
        messageId,
        `❌ <b>No se pudo ejecutar</b>\n\n${TRADE_FAILURE[result.reason]}`,
        [[{ text: "🔎 Ver otras opciones", callback_data: "cats" }]],
      );
      return;
    }

    await session.settleTrade(id, "done");
    await session.clearSnapshot();

    await editMessage(
      env.BOT_TOKEN,
      chatId,
      messageId,
      tradeReceiptCard(result.data?.data, staged.symbol, staged.amountUsd),
      [
        [
          { text: "💰 Ver mi cuenta", callback_data: "balance" },
          { text: "🔎 Seguir explorando", callback_data: "cats" },
        ],
      ],
    );
    return;
  }

  if (data.startsWith("cancel:")) {
    await session.cancelTrade(data.slice(7));
    await answerCallback(env.BOT_TOKEN, query.id, "Cancelado");
    await editMessage(
      env.BOT_TOKEN,
      chatId,
      messageId,
      "Listo, no compré nada. Preguntame lo que quieras.",
      [[{ text: "🔎 Ver opciones", callback_data: "cats" }]],
    );
    return;
  }

  if (data === "checknow") {
    await answerCallback(env.BOT_TOKEN, query.id, "Revisando...");

    const detected = await session.checkForInflow();

    await editMessage(
      env.BOT_TOKEN,
      chatId,
      messageId,
      detected === null
        ? "🔔 <b>Alertas activadas</b>\n\nRevisé y no entró plata nueva desde la última vez. " +
        "Te aviso apenas pase."
        : `💸 <b>Te entraron $${detected.inflow.toFixed(2)}</b>\n\n` +
        `Tenés <b>$${detected.balance.toFixed(2)}</b> sin invertir.`,
      [
        [{ text: "🔎 Ver opciones", callback_data: "cats" }],
        [{ text: "💰 Ver mi cuenta", callback_data: "balance" }],
      ],
    );
    return;
  }

  if (data === "balance") {
    await answerCallback(env.BOT_TOKEN, query.id);
    const result = await accountSnapshot(apiKey);

    if (!result.ok) {
      await editMessage(env.BOT_TOKEN, chatId, messageId, "No pude leer tu cuenta ahora.");
      return;
    }

    await session.storeSnapshot(result.data);
    await editMessage(
      env.BOT_TOKEN,
      chatId,
      messageId,
      balanceCard(result.data),
      balanceKeyboard(),
    );
    return;
  }

  if (data.startsWith("ast:")) {
    const symbol = data.slice(4);
    await answerCallback(env.BOT_TOKEN, query.id);

    const result = await getAsset(apiKey, symbol);
    const asset = result.ok ? result.data?.data : undefined;

    await editMessage(
      env.BOT_TOKEN,
      chatId,
      messageId,
      asset === undefined
        ? `No pude leer el detalle de ${symbol}.`
        : assetCard(asset),
      [[{ text: "‹ Categorías", callback_data: "cats" }]],
    );
    return;
  }

  await answerCallback(env.BOT_TOKEN, query.id);
}

async function handleUpdate(
  update: TelegramUpdate,
  env: Env,
  origin: string,
): Promise<void> {
  const message = update.message;
  if (!message?.text) return;

  const chatId = message.chat.id;
  const session = env.SESSION.get(env.SESSION.idFromName(String(chatId)));

  // Telegram identifies the sender on every single update, so the bot knows who
  // it is talking to without ever asking.
  await session.rememberIdentity("telegram", String(chatId), message.from?.first_name);

  const profile = await session.profile();
  const name = profile.firstName ?? "";

  switch (message.text.split(" ")[0]) {
    case "/start": {
      await sendMessage(
        env.BOT_TOKEN,
        chatId,
        `Hola${name ? ` ${name}` : ""}, soy Hermes.\n\n` +
        `Te ayudo a decidir qué hacer con la plata que cobrás en Wallbit.\n\n` +
        (profile.linked
          ? "Tu cuenta ya está vinculada."
          : "Para empezar, escribí /vincular y conectá tu cuenta de Wallbit.") +
        "\n\nComandos:\n" +
        "/saldo — tu saldo y tu cartera\n" +
        "/invertir — explorar dónde invertir\n" +
        "/notificar — probar envío de alerta proactiva vía Zavudev SDK\n" +
        "/whatshat — estado del túnel y bot de WhatsApp\n" +
        "/vincular — conectar tu cuenta de Wallbit\n" +
        "/desvincular — que deje de tener acceso (la key sigue viva en Wallbit)\n" +
        "/revocar — que Wallbit elimine la key definitivamente\n" +
        "/reset — borrar nuestra conversación",
      );
      return;
    }

    case "/vincular": {
      const nonce = await session.issueLinkToken();
      const link = `${origin}/link?t=${buildToken(chatId, nonce)}`;
      await sendMessage(
        env.BOT_TOKEN,
        chatId,
        `Abrí este enlace para pegar tu API key de Wallbit:\n\n${link}\n\n` +
        `Sirve una sola vez y vence en 10 minutos. No compartas el enlace con nadie.`,
      );
      return;
    }

    case "/desvincular": {
      await session.unlink();
      await sendMessage(
        env.BOT_TOKEN,
        chatId,
        "Borré tu API key de mis registros. Ya no tengo acceso a tu cuenta.\n\n" +
        "Importante: eso la elimina de este servicio, pero la API key sigue " +
        "existiendo y activa en Wallbit. Para revocarla del todo, borrala desde " +
        "Wallbit → Settings → API Keys.\n\n" +
        "También puedo revocarla por vos: /revocar",
      );
      return;
    }

    case "/revocar": {
      const key = await session.apiKey();
      if (key === null) {
        await sendMessage(
          env.BOT_TOKEN,
          chatId,
          "No tenés ninguna cuenta vinculada, así que no hay nada que revocar.",
        );
        return;
      }

      // Irreversible, so it takes an explicit second step. No inline keyboard
      // here on purpose: the webhook only subscribes to "message" updates.
      if (message.text.trim() !== "/revocar confirmar") {
        await sendMessage(
          env.BOT_TOKEN,
          chatId,
          "Esto le pide a Wallbit que elimine tu API key de forma definitiva, " +
          "y además la borra de mis registros.\n\n" +
          "No se puede deshacer: para volver a vincularte vas a tener que generar " +
          "una key nueva en Wallbit.\n\n" +
          "Si estás seguro, escribí:\n/revocar confirmar",
        );
        return;
      }

      const result = await revokeApiKey(key);

      // On a network failure we cannot know whether Wallbit processed it, so we
      // keep the local link rather than leaving the user with nothing.
      if (!result.ok && result.reason === "network") {
        await sendMessage(env.BOT_TOKEN, chatId, REVOKE_FAILURE.network);
        return;
      }

      await session.unlink();

      await sendMessage(
        env.BOT_TOKEN,
        chatId,
        result.ok
          ? "Listo. Wallbit revocó la API key y la borré de mis registros. " +
          "Ya no existe en ningún lado."
          : REVOKE_FAILURE[result.reason],
      );
      return;
    }

    case "/saldo": {
      // Deterministic path: no model involved, so this output cannot be
      // hallucinated or reworded. Useful as the source of truth in a demo.
      const context = await loadAccount(session, profile.linked);

      if (context.state === "unlinked") {
        await sendMessage(
          env.BOT_TOKEN,
          chatId,
          "Todavía no vinculaste tu cuenta. Escribí /vincular.",
        );
        return;
      }

      if (context.state === "unavailable") {
        await sendMessage(
          env.BOT_TOKEN,
          chatId,
          "No pude leer tu cuenta en Wallbit ahora mismo. Probá de nuevo en un rato.",
        );
        return;
      }

      await sendMessage(
        env.BOT_TOKEN,
        chatId,
        balanceCard(context.snapshot),
        balanceKeyboard(),
      );
      return;
    }

    case "/invertir": {
      if (!profile.linked) {
        await sendMessage(
          env.BOT_TOKEN,
          chatId,
          "Vinculá tu cuenta primero con /vincular.",
        );
        return;
      }

      await sendMessage(
        env.BOT_TOKEN,
        chatId,
        "🔎 <b>¿Dónde querés invertir?</b>\n\nElegí una categoría.",
        categoryKeyboard(),
      );
      return;
    }

    case "/alertas": {
      if (!profile.linked) {
        await sendMessage(env.BOT_TOKEN, chatId, "Vinculá tu cuenta primero con /vincular.");
        return;
      }

      if (await session.watching()) {
        await session.stopWatching();
        await sendMessage(
          env.BOT_TOKEN,
          chatId,
          "🔕 Listo, no te escribo más por mi cuenta.\n\n" +
          "Volvé a activarlas con /alertas cuando quieras.",
        );
        return;
      }

      const started = await session.startWatching();
      await sendMessage(
        env.BOT_TOKEN,
        chatId,
        started
          ? "🔔 <b>Alertas activadas</b>\n\n" +
          "Voy a revisar tu cuenta cada 3 horas y te escribo cuando entre plata, " +
          "para que no se quede quieta sin que te des cuenta.\n\n" +
          "Con /alertas las apagás."
          : "No pude leer tu cuenta para activar las alertas. Probá en un rato.",
        started ? [[{ text: "🔍 Revisar ahora", callback_data: "checknow" }]] : undefined,
      );
      return;
    }

    // Optional feature: only present where ZAVUDEV_API_KEY is configured. A
    // deployment without it answers plainly instead of showing a broken command.
    case "/notificar": {
      if (!env.ZAVUDEV_API_KEY) {
        await sendMessage(
          env.BOT_TOKEN,
          chatId,
          "Este bot no tiene Zavu configurado, así que no hay nada que probar acá.",
        );
        return;
      }

      await sendTyping(env.BOT_TOKEN, chatId);
      const customText = message.text.replace(/^\/notificar(\s+|$)/i, "").trim();
      const alertMessage = customText
        ? `🔔 <b>Alerta de Hermes (vía Zavudev SDK):</b>\n\n${escapeHtml(customText)}`
        : `🔔 <b>Alerta Proactiva de Hermes (vía Zavudev SDK):</b>\n\n` +
        `¡La integración de Zavudev con Hermes Wallbit funciona correctamente para tu chat (${chatId})!`;

      const result = await sendZavudevAlert(
        env.ZAVUDEV_API_KEY,
        chatId,
        alertMessage,
      );

      await sendMessage(
        env.BOT_TOKEN,
        chatId,
        result.ok
          ? `✅ <b>Notificación proactiva enviada vía Zavudev.</b>\n\nID del mensaje: <code>${result.messageId}</code>\n<i>Deberías recibir el mensaje proactivo en este chat en breves instantes.</i>`
          : `❌ <b>Fallo al notificar por Zavudev:</b>\n\n${escapeHtml(result.error ?? "Error desconocido")}`,
      );
      return;
    }

    case "/whatshat":
    case "/whatsapp": {
      await sendTyping(env.BOT_TOKEN, chatId);
      const [connRes, statusRes] = await Promise.all([
        getWhatsAppConnectionInfo(env.WHATSAPP_API_URL),
        getWhatsAppStatus(env.WHATSAPP_API_URL),
      ]);

      if (!connRes.ok && !statusRes.ok) {
        await sendMessage(
          env.BOT_TOKEN,
          chatId,
          `❌ <b>Bot de WhatsApp no disponible:</b>\n\n` +
          `• <b>Error:</b> ${escapeHtml(connRes.error || statusRes.error || "Sin respuesta")}\n\n` +
          `<i>El servicio de WhatsApp no está respondiendo en este momento.</i>`,
        );
        return;
      }

      const conn = connRes.ok ? connRes.data : undefined;
      const stats = statusRes.ok ? statusRes.data : undefined;
      const statusIcon = conn?.status === "connected" ? "🟢" : conn?.status === "qr" ? "🟡" : "🔴";
      const statusText =
        conn?.status === "connected"
          ? "Conectado"
          : conn?.status === "qr"
            ? "Esperando escaneo de QR"
            : "Desconectado";
      const rawPhone = conn?.phone ?? "";
      const phoneDisplay = rawPhone ? `+${escapeHtml(rawPhone)} (<code>${escapeHtml(rawPhone)}</code>)` : "No vinculado";
      const uptimeSec = stats?.uptime ?? 0;
      const uptimeMin = Math.floor(uptimeSec / 60);

      // Build inline keyboard: if connected, offer a direct wa.me link to the active number
      const waKeyboard: InlineKeyboard | undefined =
        conn?.status === "connected" && rawPhone
          ? [[{ text: "💬 Abrir en WhatsApp", url: `https://wa.me/${rawPhone.replace(/\D/g, "")}` }]]
          : undefined;

      await sendMessage(
        env.BOT_TOKEN,
        chatId,
        `📱 <b>Estado de WhatsApp (/whatshat):</b>\n\n` +
        `• <b>Estado:</b> ${statusIcon} <b>${statusText}</b>\n` +
        `• <b>Número:</b> ${phoneDisplay}\n` +
        `• <b>Uptime Bot:</b> ${uptimeMin} min\n` +
        `• <b>Mensajes Procesados:</b> ${stats?.messagesProcessed ?? 0}`,
        waKeyboard,
      );
      return;
    }

    case "/reset": {
      await session.reset();
      await sendMessage(env.BOT_TOKEN, chatId, "Listo, arrancamos de cero.");
      return;
    }
  }

  await sendTyping(env.BOT_TOKEN, chatId);

  const context = await loadAccount(session, profile.linked);
  const history = await session.history();
  const answer = await reply(env, profile, context, history, message.text);

  const safe = guardAgainstInventedFigures(answer, context.state === "ready");
  const keyboard = (await confirmKeyboard(session, answer.usedTools)) ?? safe.keyboard;

  // Off-topic turns stay out of history on purpose. Drift compounds: once such
  // an exchange is in the transcript, the next turn reads it as precedent and
  // the system prompt — ten messages back — loses to the last three.
  if (!answer.offTopic) {
    await session.append("user", message.text);
    await session.append("assistant", safe.text);
  }

  await sendMessage(env.BOT_TOKEN, chatId, toTelegramHtml(safe.text), keyboard);
}

/**
 * Turns a plan the model produced into a confirm button.
 *
 * The model never places an order. It computes a plan; this stages that exact
 * plan and gives the user a button. The order is only ever placed by code, from
 * a tap, on figures the user was shown first.
 */
async function confirmKeyboard(
  session: DurableObjectStub<Session>,
  usedTools: { name: string; output: unknown }[],
): Promise<InlineKeyboard | undefined> {
  const plan = usedTools.find((tool) => tool.name === "plan_investment");
  if (plan === undefined) return undefined;

  const output = plan.output as {
    symbol?: string;
    amount_usd?: number;
    price_now?: number;
    enough_balance?: boolean;
  };

  if (
    typeof output?.symbol !== "string" ||
    typeof output.amount_usd !== "number" ||
    typeof output.price_now !== "number"
  ) {
    return undefined;
  }

  // No confirm button when the money is not there — offering it would only
  // produce a rejected order.
  if (output.enough_balance === false) {
    return [[{ text: "🔎 Ver otras opciones", callback_data: "cats" }]];
  }

  const id = await session.stageTrade(output.symbol, output.amount_usd, output.price_now);

  return [
    [{ text: `✅ Comprar $${output.amount_usd} de ${output.symbol}`, callback_data: `buy:${id}` }],
    [
      { text: "✕ Cancelar", callback_data: `cancel:${id}` },
      { text: "🔎 Comparar", callback_data: "cats" },
    ],
  ];
}

const TRADE_FAILURE: Record<WallbitFailure, string> = {
  invalid: "Wallbit rechazó la orden por fondos insuficientes o datos inválidos.",
  unauthorized: "Tu API key ya no es válida. Volvé a vincular con /vincular.",
  forbidden:
    "Tu API key no tiene permiso <b>trade</b>, solo lectura.\n\n" +
    "Generá una nueva en Wallbit → Settings → API Keys marcando ese permiso, " +
    "y vinculala con /vincular.",
  blocked: "Wallbit reporta el KYC incompleto o la cuenta bloqueada. Resolvelo en la app.",
  not_found: "Wallbit no encontró ese instrumento.",
  rate_limited: "Demasiadas órdenes seguidas. Esperá un minuto y probá otra vez.",
  server: "Wallbit tuvo un error interno. Revisá en la app si la orden entró antes de reintentar.",
  network:
    "Se cortó la conexión con Wallbit y no puedo confirmar si la orden entró. " +
    "<b>Revisá en la app antes de reintentar.</b>",
};

function tradeReceiptCard(
  receipt: { shares?: number; status?: string } | undefined,
  symbol: string,
  amountUsd: number,
): string {
  const lines = ["✅ <b>Orden enviada</b>", ""];

  lines.push(`<b>${escapeHtml(symbol)}</b> · $${amountUsd.toFixed(2)}`);
  if (typeof receipt?.shares === "number") {
    lines.push(`${receipt.shares} acciones`);
  }
  if (receipt?.status) {
    lines.push(`Estado · ${escapeHtml(receipt.status)}`);
  }

  lines.push("", "<i>La ejecución final y el precio los confirma Wallbit.</i>");

  return lines.join("\n");
}

/** A price the model wrote without ever calling a tool. */
const PRICE_PATTERN = /\$\s?\d/;

/**
 * The model will happily quote prices from its training data. In one test it
 * answered "SPY $420.12" with no tool call, then "SPY $738.93" from the real API
 * one message later.
 *
 * Tool usage is the ground truth: if the reply states figures but nothing was
 * read from Wallbit, the answer is discarded rather than shown. A wrong price in
 * a financial product is worse than no price.
 */
function guardAgainstInventedFigures(
  answer: ReplyResult,
  linked: boolean,
): { text: string; keyboard?: InlineKeyboard } {
  const readSomething = answer.usedTools.length > 0;

  if (readSomething || !linked || !PRICE_PATTERN.test(answer.text)) {
    return { text: answer.text, keyboard: keyboardFor(answer.usedTools) };
  }

  console.warn("blocked reply with figures and no tool call");

  return {
    text:
      "No quiero darte números de memoria: los precios tienen que salir de Wallbit.\n\n" +
      "Elegí una categoría y te muestro instrumentos reales con su precio de hoy.",
    keyboard: categoryKeyboard(),
  };
}

/**
 * The model decides WHAT to read; this decides HOW to render it. Driving the UI
 * off real tool usage keeps it honest — no string matching on the reply text.
 */
function keyboardFor(usedTools: { name: string; output: unknown }[]): InlineKeyboard | undefined {
  const plan = usedTools.find((tool) => tool.name === "plan_investment");
  if (plan !== undefined) {
    const symbol = (plan.output as { symbol?: string })?.symbol;
    const row: InlineKeyboard[number] = [{ text: "🔎 Comparar otras", callback_data: "cats" }];
    if (typeof symbol === "string") {
      row.unshift({ text: `📄 Ficha de ${symbol}`, callback_data: `ast:${symbol}` });
    }
    return [row];
  }

  const search = usedTools.find((tool) => tool.name === "search_assets");

  if (search !== undefined) {
    const rows = (search.output as { assets?: { symbol?: string }[] })?.assets;
    const symbols = Array.isArray(rows)
      ? rows
        .map((row) => row.symbol)
        .filter((symbol): symbol is string => typeof symbol === "string")
        .slice(0, 9)
      : [];

    return symbols.length > 0 ? assetKeyboard(symbols) : categoryKeyboard();
  }

  const asset = usedTools.find((tool) => tool.name === "get_asset");
  if (asset !== undefined) {
    return [[{ text: "🔎 Ver más opciones", callback_data: "cats" }]];
  }

  return undefined;
}
