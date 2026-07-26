#!/usr/bin/env bash
# Full bot setup: uploads credentials as Worker secrets, registers the webhook
# (including callback_query, or inline buttons silently do nothing) and loads
# the command menu.
#
# Fill BOT_TOKEN in .dev.vars first, then:
#   ! bash setup-webhook.sh
set -uo pipefail

if [ ! -f .dev.vars ]; then
  echo "No existe .dev.vars — copiá .dev.vars.example y completalo." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.dev.vars
set +a

if [ -z "${BOT_TOKEN:-}" ] || [ -z "${WEBHOOK_SECRET:-}" ]; then
  echo "Faltan BOT_TOKEN o WEBHOOK_SECRET en .dev.vars" >&2
  exit 1
fi

if [ -z "${WORKER_URL:-}" ]; then
  echo "Falta WORKER_URL en .dev.vars (la URL que imprime 'wrangler deploy')." >&2
  exit 1
fi

echo "==> Verificando que el bot responda"
status="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' \
  "https://api.telegram.org/bot${BOT_TOKEN}/getMe" 2>/dev/null)"

if [ "$status" != "200" ]; then
  echo "  getMe devolvió '${status:-sin_conexion}'." >&2
  echo "  Si es 502 o timeout, el backend del bot está caído del lado de Telegram." >&2
  echo "  Compará contra un token falso: si ese devuelve 401, el problema es el bot." >&2
  exit 1
fi
echo "  OK"

echo "==> Guardando BOT_TOKEN"
printf '%s' "$BOT_TOKEN" | npx wrangler secret put BOT_TOKEN

echo "==> Guardando WEBHOOK_SECRET"
printf '%s' "$WEBHOOK_SECRET" | npx wrangler secret put WEBHOOK_SECRET

if [ -n "${ZAVUDEV_API_KEY:-}" ]; then
  echo "==> Guardando ZAVUDEV_API_KEY"
  printf '%s' "$ZAVUDEV_API_KEY" | npx wrangler secret put ZAVUDEV_API_KEY
fi

echo "==> Registrando webhook (message + callback_query)"
curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H 'content-type: application/json' \
  -d "{\"url\":\"${WORKER_URL}\",\"secret_token\":\"${WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\",\"callback_query\"]}"
echo

echo "==> Menú de comandos"
curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands" \
  -H 'content-type: application/json' \
  -d '{"commands":[
    {"command":"saldo","description":"Tu saldo y tu cartera"},
    {"command":"invertir","description":"Explorar donde invertir"},
    {"command":"notificar","description":"Probar alerta proactiva via Zavudev SDK"},
    {"command":"vincular","description":"Conectar tu cuenta de Wallbit"},
    {"command":"desvincular","description":"Quitar el acceso a tu cuenta"},
    {"command":"revocar","description":"Eliminar la API key en Wallbit"},
    {"command":"reset","description":"Borrar la conversacion"}
  ]}'
echo

echo "==> Estado final"
curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
echo
