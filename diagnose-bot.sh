#!/usr/bin/env bash
# Figures out WHY this bot stops responding, instead of guessing.
#
#   ! bash diagnose-bot.sh
#
# The number that matters is pending_update_count. Telegram re-queues and
# retries every update the webhook did not answer with 200 — and this Worker
# answers 403 whenever the secret header does not match. A window where the
# secret was missing means every update in it is still being retried.
set -uo pipefail

set -a
# shellcheck disable=SC1091
. ./.dev.vars
set +a

if [ -z "${BOT_TOKEN:-}" ]; then
  echo "Falta BOT_TOKEN en .dev.vars" >&2
  exit 1
fi

api() {
  curl -sS --max-time 12 "https://api.telegram.org/bot${BOT_TOKEN}/$1" 2>&1
}

echo "══ 1. Control: la API de Telegram responde? (token falso) ══"
control="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' \
  "https://api.telegram.org/bot123456:FAKE/getMe" 2>/dev/null)"
echo "   token falso → HTTP ${control}  (401 = la API está sana)"
echo

echo "══ 2. Tu bot responde? (5 intentos) ══"
ok=0
for i in 1 2 3 4 5; do
  status="$(curl -sS --max-time 12 -o /dev/null -w '%{http_code}' \
    "https://api.telegram.org/bot${BOT_TOKEN}/getMe" 2>/dev/null)"
  printf '   %d: HTTP %s\n' "$i" "${status:-timeout}"
  [ "$status" = "200" ] && ok=$((ok + 1))
  sleep 2
done
echo "   → ${ok}/5 exitosos"
echo

if [ "$ok" -eq 0 ]; then
  echo "El bot no responde en absoluto. Si el control dio 401, el problema"
  echo "es del backend de tu bot en Telegram, no de tu red ni de tu codigo."
  echo
  echo "Volvé a correr esto en unos minutos. Si persiste mas de una hora,"
  echo "escribile a @BotSupport en Telegram con este diagnostico."
  exit 0
fi

echo "══ 3. Estado del webhook ══"
info="$(api getWebhookInfo)"
echo "$info"
echo

pending="$(printf '%s' "$info" | grep -o '"pending_update_count":[0-9]*' | cut -d: -f2)"
last_error="$(printf '%s' "$info" | grep -o '"last_error_message":"[^"]*"' | cut -d: -f2-)"

echo "══ 4. Veredicto ══"

if [ -n "${pending:-}" ]; then
  echo "   pending_update_count = ${pending}"
  if [ "$pending" -gt 100 ]; then
    echo
    echo "   ⚠ COLA ACUMULADA. Telegram esta reintentando ${pending} updates."
    echo "     Eso es lo que ahoga al bot. Para vaciarla:"
    echo
    echo "     bash drop-pending.sh"
  else
    echo "   ✓ Sin acumulacion. La cola no es el problema."
  fi
fi

if [ -n "${last_error:-}" ]; then
  echo
  echo "   ⚠ Ultimo error de entrega: ${last_error}"
  echo "     Telegram intento entregar y el Worker no respondio 200."
else
  echo "   ✓ Sin errores de entrega registrados."
fi

echo
echo "   allowed_updates debe incluir callback_query para que anden los botones."
