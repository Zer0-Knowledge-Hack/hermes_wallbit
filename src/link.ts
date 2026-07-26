import type { Env } from "./env";
import { sendMessage } from "./telegram";
import { verifyApiKey, type WallbitFailure } from "./wallbit";

/**
 * Distinguishes "your key is wrong" from "we could not check right now". Telling
 * a user their credential is invalid when Wallbit was simply unreachable would
 * send them off to regenerate a key that was fine.
 */
const VERIFY_FAILURE: Record<WallbitFailure, string> = {
  unauthorized: "Wallbit rechazó esa API key. Fijate que esté completa y que no la hayas revocado.",
  forbidden: "Esa API key no tiene el permiso <strong>read</strong>. Generá una que lo incluya.",
  blocked: "Wallbit reporta la cuenta bloqueada o con el KYC incompleto. Resolvelo en la app y volvé a intentar.",
  not_found: "Wallbit no reconoce esa API key.",
  invalid: "Wallbit rechazó el formato de esa API key.",
  rate_limited: "Wallbit está limitando los pedidos ahora mismo. Esperá unos minutos y probá de nuevo.",
  server: "Wallbit tuvo un error interno. No pude verificar tu key — probá de nuevo en un rato.",
  network: "No pude comunicarme con Wallbit para verificar tu key. Probá de nuevo en un rato.",
};

/**
 * The token is `<chat_id>.<nonce>`. The chat_id is not a secret — it only says
 * which Durable Object to ask. The nonce is the secret, it lives server-side,
 * expires in 10 minutes and is burned on first use.
 */
function parseToken(token: string): { chatId: string; nonce: string } | null {
  const separator = token.indexOf(".");
  if (separator <= 0) return null;

  const chatId = token.slice(0, separator);
  const nonce = token.slice(separator + 1);

  // The nonce charset is pinned to base64url, not just a length. This page is
  // reflected back to the user, so anything looser becomes an injection vector
  // on the exact form where they type their credential.
  if (!/^-?\d{1,20}$/.test(chatId)) return null;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return null;

  return { chatId, nonce };
}

/** Defense in depth: nothing user-controlled reaches the page unescaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildToken(chatId: number, nonce: string): string {
  return `${chatId}.${nonce}`;
}

const SECURITY_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  // The page handles a live brokerage credential: no external loads, no framing,
  // and no referrer that could carry the token to a third party.
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "cache-control": "no-store",
};

function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Vincular Wallbit — Hermes</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    padding: 24px; background: #0a0a0a; color: #f5f5f5;
    font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { width: 100%; max-width: 420px; }
  h1 { font-size: 1.4rem; margin: 0 0 8px; }
  p { color: #a3a3a3; margin: 0 0 24px; }
  label { display: block; font-size: .875rem; margin-bottom: 8px; color: #d4d4d4; }
  input {
    width: 100%; padding: 14px; border-radius: 12px; font: inherit;
    background: #171717; border: 1px solid #333; color: #f5f5f5;
  }
  input:focus { outline: 2px solid #2b7fff; outline-offset: 1px; border-color: transparent; }
  button {
    width: 100%; margin-top: 16px; padding: 14px; border: 0; border-radius: 999px;
    background: #2b7fff; color: #fff; font: inherit; font-weight: 600; cursor: pointer;
  }
  button:hover { background: #1d6ae5; }
  .note { font-size: .8125rem; color: #737373; margin-top: 20px; }
  .ok { color: #4ade80; }
  .bad { color: #f87171; }
</style>
</head>
<body><main>${body}</main></body>
</html>`,
    { status, headers: SECURITY_HEADERS },
  );
}

function form(token: string, error?: string): Response {
  return page(`
    <h1>Vinculá tu cuenta de Wallbit</h1>
    <p>Pegá tu API key para que Hermes pueda leer tu saldo y tu cartera.</p>
    ${error ? `<p class="bad">${error}</p>` : ""}
    <form method="post" action="/link">
      <input type="hidden" name="t" value="${escapeHtml(token)}">
      <label for="key">API key de Wallbit</label>
      <input id="key" name="key" type="password" required minlength="8"
             autocomplete="off" autocapitalize="off" spellcheck="false"
             placeholder="wb_live_...">
      <button type="submit">Vincular</button>
    </form>
    <p class="note">
      La generás en Wallbit, en Settings → API Keys. Este enlace sirve una sola
      vez y vence a los 10 minutos.
    </p>
    <p class="note">
      Guardamos tu key <strong>cifrada</strong> y solo la usamos para leer tu
      cuenta cuando hablás con el bot. Con <strong>/desvincular</strong> la
      borramos de nuestros registros, pero eso <strong>no la elimina de
      Wallbit</strong>: para revocarla del todo tenés que borrarla vos desde
      Wallbit → Settings → API Keys.
    </p>
  `);
}

function expired(): Response {
  return page(
    `<h1>Enlace vencido</h1>
     <p>Este enlace ya se usó o pasaron más de 10 minutos.</p>
     <p class="note">Volvé al chat y escribí <strong>/vincular</strong> para generar uno nuevo.</p>`,
    410,
  );
}

function done(): Response {
  return page(`
    <h1 class="ok">Listo</h1>
    <p>Tu cuenta quedó vinculada. Volvé a Telegram y seguí la conversación con Hermes.</p>
  `);
}

export async function handleLink(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const token = url.searchParams.get("t");
    const parsed = token ? parseToken(token) : null;
    if (!token || !parsed) return expired();

    const session = env.SESSION.get(env.SESSION.idFromName(parsed.chatId));
    if (!(await session.verifyLinkToken(parsed.nonce))) return expired();

    return form(token);
  }

  if (request.method === "POST") {
    const body = await request.formData();
    const token = String(body.get("t") ?? "");
    const apiKey = String(body.get("key") ?? "").trim();
    const parsed = parseToken(token);

    if (!parsed) return expired();
    if (apiKey.length < 8) return form(token, "Esa API key no parece válida.");

    const session = env.SESSION.get(env.SESSION.idFromName(parsed.chatId));

    // Check the nonce before spending a request on Wallbit.
    if (!(await session.verifyLinkToken(parsed.nonce))) return expired();

    // Prove the credential actually works before storing it. Otherwise the user
    // walks away believing they are connected and only finds out much later.
    const check = await verifyApiKey(apiKey);
    if (!check.ok) {
      return form(token, VERIFY_FAILURE[check.reason]);
    }

    if (!(await session.saveApiKey(parsed.nonce, apiKey))) return expired();

    // Close the loop in the chat so the user does not have to wonder.
    const { firstName } = await session.profile();
    await sendMessage(
      env.BOT_TOKEN,
      Number(parsed.chatId),
      `${firstName ? `Listo ${firstName}` : "Listo"}, tu cuenta de Wallbit quedó vinculada.`,
    );

    return done();
  }

  return new Response("method not allowed", { status: 405 });
}
