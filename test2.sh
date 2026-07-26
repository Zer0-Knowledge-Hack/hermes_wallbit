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

echo "==> Desplegando el Worker a Cloudflare"
npx wrangler deploy
echo

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
