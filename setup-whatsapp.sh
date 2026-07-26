#!/usr/bin/env bash
# Uploads whichever WhatsApp credentials are already filled in .dev.vars.
#
# Deliberately incremental: Meta's own flow asks you to verify the webhook
# BEFORE it hands over the rest of the credentials, so demanding all four up
# front would block the very step that needs WHATSAPP_VERIFY_TOKEN.
#
#   WHATSAPP_VERIFY_TOKEN  invented by you; the same value goes in Meta's form
#   WHATSAPP_TOKEN         WhatsApp > Configuración de la API
#   WHATSAPP_PHONE_ID      same page, "Identificador de número de teléfono"
#   WHATSAPP_APP_SECRET    Configuración > Básica > Clave secreta de la app
#
#   ! bash setup-whatsapp.sh
set -uo pipefail

if [ ! -f .dev.vars ]; then
  echo "No existe .dev.vars" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.dev.vars
set +a

uploaded=0
missing=()

for var in WHATSAPP_VERIFY_TOKEN WHATSAPP_TOKEN WHATSAPP_PHONE_ID WHATSAPP_APP_SECRET; do
  if [ -z "${!var:-}" ]; then
    missing+=("$var")
    continue
  fi

  echo "==> Subiendo $var"
  printf '%s' "${!var}" | npx wrangler secret put "$var" >/dev/null 2>&1 \
    && echo "    ok" || echo "    FALLÓ" >&2
  uploaded=$((uploaded + 1))
done

echo

# Only worth probing once both halves of the credential exist.
if [ -n "${WHATSAPP_TOKEN:-}" ] && [ -n "${WHATSAPP_PHONE_ID:-}" ]; then
  echo "==> Probando las credenciales contra Meta"
  probe="$(curl -sS --max-time 15 \
    "https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}?fields=display_phone_number,verified_name" \
    -H "Authorization: Bearer ${WHATSAPP_TOKEN}" 2>&1)"

  if printf '%s' "$probe" | grep -q '"error"'; then
    echo "    Meta las rechazó:" >&2
    printf '    %s\n' "$probe" >&2
  else
    echo "    $probe"
  fi
  echo
fi

if [ "${#missing[@]}" -gt 0 ]; then
  echo "Todavía faltan en .dev.vars:"
  printf '  - %s\n' "${missing[@]}"
  echo
fi

if [ -n "${WHATSAPP_VERIFY_TOKEN:-}" ]; then
  echo "Webhook — pegá esto en Meta > WhatsApp > Configuración > Webhooks:"
  echo "  URL:   ${WORKER_URL:-<WORKER_URL>}/whatsapp"
  echo "  Token: ${WHATSAPP_VERIFY_TOKEN}"
  echo
  echo "Después de 'Verificar y guardar', suscribite al campo 'messages'."
fi

echo
echo "Comprobación rápida de la verificación:"
echo "  curl \"${WORKER_URL:-<WORKER_URL>}/whatsapp?hub.mode=subscribe&hub.verify_token=\$WHATSAPP_VERIFY_TOKEN&hub.challenge=12345\""
echo "  Debe imprimir 12345. Si dice 'forbidden', el secret no está en el Worker."
