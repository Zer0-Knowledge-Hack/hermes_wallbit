#!/usr/bin/env bash
# Uploads the WhatsApp Cloud API credentials to the Worker.
#
# Fill these in .dev.vars first (all from the Meta app dashboard):
#   WHATSAPP_TOKEN         Access token — WhatsApp > API Setup
#   WHATSAPP_PHONE_ID      "Identificador de número de teléfono", NOT the number
#   WHATSAPP_APP_SECRET    Configuración > Básica > Clave secreta de la app
#   WHATSAPP_VERIFY_TOKEN  Already generated; the same value goes in Meta's form
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

missing=0
for var in WHATSAPP_TOKEN WHATSAPP_PHONE_ID WHATSAPP_VERIFY_TOKEN WHATSAPP_APP_SECRET; do
  if [ -z "${!var:-}" ]; then
    echo "Falta $var en .dev.vars" >&2
    missing=1
  fi
done
[ "$missing" -eq 1 ] && exit 1

echo "==> Probando las credenciales contra Meta"
probe="$(curl -sS --max-time 15 \
  "https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}?fields=display_phone_number,verified_name" \
  -H "Authorization: Bearer ${WHATSAPP_TOKEN}" 2>&1)"

if printf '%s' "$probe" | grep -q '"error"'; then
  echo "  Meta rechazó las credenciales:" >&2
  printf '  %s\n' "$probe" >&2
  exit 1
fi
echo "  $probe"
echo

for var in WHATSAPP_TOKEN WHATSAPP_PHONE_ID WHATSAPP_VERIFY_TOKEN WHATSAPP_APP_SECRET; do
  echo "==> Subiendo $var"
  printf '%s' "${!var}" | npx wrangler secret put "$var"
done

echo
echo "==> Ahora en el panel de Meta > WhatsApp > Configuración > Webhooks:"
echo "    URL de devolución de llamada:  ${WORKER_URL:-<WORKER_URL>}/whatsapp"
echo "    Token de verificación:         (el WHATSAPP_VERIFY_TOKEN de .dev.vars)"
echo
echo "    Después tocá 'Verificar y guardar' y suscribite al campo 'messages'."
