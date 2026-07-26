#!/usr/bin/env bash
# Clears the backlog of updates Telegram is retrying, and re-registers the
# webhook cleanly.
#
#   ! bash drop-pending.sh
#
# Discards every update Telegram has queued but not delivered. Those are old
# messages the bot never answered — losing them is the point.
set -uo pipefail

set -a
# shellcheck disable=SC1091
. ./.dev.vars
set +a

if [ -z "${BOT_TOKEN:-}" ] || [ -z "${WEBHOOK_SECRET:-}" ] || [ -z "${WORKER_URL:-}" ]; then
  echo "Faltan BOT_TOKEN, WEBHOOK_SECRET o WORKER_URL en .dev.vars" >&2
  exit 1
fi

echo "==> Antes"
curl -sS --max-time 12 "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo" \
  | grep -o '"pending_update_count":[0-9]*'
echo

echo "==> Quitando el webhook y descartando la cola"
curl -sS --max-time 20 -X POST \
  "https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook" \
  -H 'content-type: application/json' \
  -d '{"drop_pending_updates":true}'
echo

# Telegram needs a moment before accepting the new registration cleanly.
sleep 3

echo "==> Registrando el webhook de nuevo"
curl -sS --max-time 20 -X POST \
  "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H 'content-type: application/json' \
  -d "{\"url\":\"${WORKER_URL}\",\"secret_token\":\"${WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\",\"callback_query\"],\"drop_pending_updates\":true}"
echo

echo "==> Despues"
curl -sS --max-time 12 "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
echo
