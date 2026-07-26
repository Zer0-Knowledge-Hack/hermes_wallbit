#!/usr/bin/env bash
# Measures how healthy this bot's Telegram backend actually is, instead of
# guessing from a single request.
#
# "Stable" here means 5 consecutive successes. One lucky 200 proves nothing —
# during the outage getMe alternated between 200, 502 and connection failures.
#
#   ! bash check-telegram.sh
set -uo pipefail

ATTEMPTS=20
DELAY=6
STREAK_TARGET=5

set -a
# shellcheck disable=SC1091
. ./.dev.vars
set +a

if [ -z "${BOT_TOKEN:-}" ]; then
  echo "Falta BOT_TOKEN en .dev.vars" >&2
  exit 1
fi

ok=0
streak=0
best=0

echo "Midiendo ${ATTEMPTS} intentos, uno cada ${DELAY}s (~$((ATTEMPTS * DELAY))s)"
echo

for i in $(seq 1 "$ATTEMPTS"); do
  status="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' \
    "https://api.telegram.org/bot${BOT_TOKEN}/getMe" 2>/dev/null)"

  if [ "$status" = "200" ]; then
    ok=$((ok + 1))
    streak=$((streak + 1))
    [ "$streak" -gt "$best" ] && best=$streak
    printf '%2d/%d  ✅ 200   (racha %d)\n' "$i" "$ATTEMPTS" "$streak"
  else
    streak=0
    printf '%2d/%d  ❌ %s\n' "$i" "$ATTEMPTS" "${status:-sin_conexion}"
  fi

  [ "$i" -lt "$ATTEMPTS" ] && sleep "$DELAY"
done

echo
echo "Éxitos: ${ok}/${ATTEMPTS} · racha máxima: ${best}"
echo

if [ "$best" -ge "$STREAK_TARGET" ]; then
  echo "ESTABLE. Estado del webhook:"
  curl -sS --max-time 10 "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
  echo
  echo
  echo "Mirá 'allowed_updates' (debe incluir callback_query),"
  echo "'pending_update_count' y 'last_error_message'."
else
  echo "TODAVÍA INESTABLE. Esperá y volvé a correrlo."
fi
