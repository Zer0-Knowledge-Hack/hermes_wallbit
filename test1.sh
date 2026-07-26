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
  echo "==> Verificando que el túnel de WhatsApp responda"
  wa_status="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' \
    "${WHATSAPP_API_URL}/api/whatsapp" 2>/dev/null || echo "error")"
  if [ "$wa_status" != "200" ]; then
    echo "  ⚠ Aviso: El túnel de WhatsApp devolvió '${wa_status:-sin_conexion}'." >&2
    echo "  Asegurate de tener corriendo 'npm run dev:tunnel' en la carpeta /whatsapp para activar el túnel." >&2
  else
    echo "  OK (${WHATSAPP_API_URL})"
  fi
fi
