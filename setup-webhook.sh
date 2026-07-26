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

echo "==> Verificando que el bot de Telegram responda"
status="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' \
  "https://api.telegram.org/bot${BOT_TOKEN}/getMe" 2>/dev/null)"

if [ "$status" != "200" ]; then
  echo "  getMe devolvió '${status:-sin_conexion}'." >&2
  echo "  Si es 502 o timeout, el backend del bot está caído del lado de Telegram." >&2
  echo "  Compará contra un token falso: si ese devuelve 401, el problema es el bot." >&2
  exit 1
fi
echo "  OK"

if [ -n "${WHATSAPP_API_URL:-}" ]; then
  echo "==> Verificando que el servicio de WhatsApp en Cloudflare Containers responda"
  wa_status="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' \
    "${WHATSAPP_API_URL}/api/whatsapp" 2>/dev/null || echo "error")"
  if [ "$wa_status" != "200" ]; then
    echo "  ⚠ Aviso: El servicio de WhatsApp devolvió '${wa_status:-sin_conexion}'." >&2
    echo "  Nota: En el primer despliegue, Cloudflare Containers puede tardar hasta 2 minutos en aprovisionar la máquina virtual Linux." >&2
  else
    echo "  OK (${WHATSAPP_API_URL})"
  fi
fi

# A bot has exactly ONE webhook, and setWebhook replaces it silently. Two people
# sharing a token will take the bot from each other without any warning, and all
# state — linked accounts, conversations, alarms — is stranded in whichever
# deployment just lost it.
echo "==> Verificando a dónde apunta el webhook hoy"
current="$(curl -sS --max-time 12 "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo" \
  | grep -o '"url":"[^"]*"' | cut -d'"' -f4)"

if [ -n "$current" ] && [ "$current" != "$WORKER_URL" ] && [ "${FORCE:-}" != "1" ]; then
  echo >&2
  echo "  ⚠ Este bot YA está registrado en otro Worker:" >&2
  echo "      $current" >&2
  echo "    y vos estás por apuntarlo a:" >&2
  echo "      $WORKER_URL" >&2
  echo >&2
  echo "  Si seguís, ese despliegue deja de recibir mensajes al instante y sus" >&2
  echo "  usuarios quedan desvinculados: los datos viven en SUS Durable Objects," >&2
  echo "  no en los tuyos." >&2
  echo >&2
  echo "  Para desarrollar, creá tu propio bot con @BotFather y usá ESE token." >&2
  echo "  Si de verdad querés tomar el bot: FORCE=1 bash setup-webhook.sh" >&2
  exit 1
fi

echo "==> Guardando BOT_TOKEN"
printf '%s' "$BOT_TOKEN" | npx wrangler secret put BOT_TOKEN

echo "==> Guardando WEBHOOK_SECRET"
printf '%s' "$WEBHOOK_SECRET" | npx wrangler secret put WEBHOOK_SECRET

if [ -n "${ZAVUDEV_API_KEY:-}" ]; then
  echo "==> Guardando ZAVUDEV_API_KEY"
  printf '%s' "$ZAVUDEV_API_KEY" | npx wrangler secret put ZAVUDEV_API_KEY
fi

if [ -n "${WHATSAPP_API_URL:-}" ]; then
  echo "==> Guardando WHATSAPP_API_URL en los secretos del Worker"
  printf '%s' "$WHATSAPP_API_URL" | npx wrangler secret put WHATSAPP_API_URL
fi

echo "==> Desplegando el Worker principal (hermes-bot) a Cloudflare"
npx wrangler deploy
echo

if [ -d "whatsapp" ]; then
  echo "==> Desplegando el Contenedor y Frontend de WhatsApp (whatshat-frontend) a Cloudflare Containers"
  (cd whatsapp && npx wrangler deploy --config wrangler-frontend.toml) || {
    echo "  ⚠ Aviso: No se pudo subir la imagen del contenedor a Cloudflare Registry." >&2
    echo "  Si ves un error 'Unauthorized', ejecuta 'npx wrangler login' en tu terminal para refrescar tu token OAuth de Cloudflare para Containers." >&2
  }
  echo
fi

echo "==> Registrando webhook (message + callback_query)"
curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H 'content-type: application/json' \
  -d "{\"url\":\"${WORKER_URL}\",\"secret_token\":\"${WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\",\"callback_query\"]}"
echo

# The command menu follows the deployment, not the codebase: /notificar only
# shows up where Zavu is actually configured. Same code for everyone, behaviour
# driven by config — nobody has to fork the repo to get a clean bot.
zavu_command=""
if [ -n "${ZAVUDEV_API_KEY:-}" ]; then
  zavu_command='{"command":"notificar","description":"Probar alerta proactiva via Zavu"},'
fi

whatshat_command=""
if [ -n "${WHATSAPP_API_URL:-}" ]; then
  whatshat_command='{"command":"whatshat","description":"Estado del túnel y bot de WhatsApp"},'
fi

echo "==> Menú de comandos"
curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands" \
  -H 'content-type: application/json' \
  -d "{\"commands\":[
    {\"command\":\"saldo\",\"description\":\"Tu saldo y tu cartera\"},
    {\"command\":\"invertir\",\"description\":\"Explorar donde invertir\"},
    {\"command\":\"alertas\",\"description\":\"Avisarme cuando entre plata\"},
    ${zavu_command}
    ${whatshat_command}
    {\"command\":\"vincular\",\"description\":\"Conectar tu cuenta de Wallbit\"},
    {\"command\":\"desvincular\",\"description\":\"Quitar el acceso a tu cuenta\"},
    {\"command\":\"revocar\",\"description\":\"Eliminar la API key en Wallbit\"},
    {\"command\":\"reset\",\"description\":\"Borrar la conversacion\"}
  ]}"
echo

echo "==> Estado final"
curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
echo
