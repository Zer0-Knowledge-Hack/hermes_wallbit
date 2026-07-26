# Hermes Wallbit

Agente conversacional de Telegram sobre la API de Wallbit. Lee la cuenta real del
usuario, lo orienta sobre dónde invertir con datos del catálogo, y ejecuta la
compra desde el mismo chat previa confirmación humana.

Corre entero en Cloudflare Workers: sin servidor, sin contenedor, plan gratuito.

---

## Arquitectura

```
Telegram ──webhook──▶ Cloudflare Worker
                          │
                          ├── Durable Object (uno por chat_id)
                          │     conversación · API key cifrada · trades pendientes
                          │
                          ├── Workers AI (qwen3-30b-a3b-fp8, function calling)
                          │
                          └── API de Wallbit (la key del propio usuario)
```

**Un Durable Object por `chat_id`**, cada uno con su base SQLite privada. El
aislamiento entre usuarios es estructural: no existe una consulta que pueda leer
los datos de otro, porque viven en otra base.

### Cómo llegan los datos al modelo

Dos caminos, y la diferencia es deliberada:

| Dato | Camino | Por qué |
|---|---|---|
| Saldo y cartera | **Inyectado** en el system prompt | Es chico, siempre relevante, y así el modelo no puede olvidarse de mirarlo |
| Catálogo, movimientos, comisiones, cotizaciones | **Function calling** | Qué traer depende de la pregunta |

### Cómo se ejecuta una compra

```
conversación
  → el modelo llama a plan_investment (calcula, NO compra)
  → el código guarda ese plan exacto en el Durable Object
  → aparece un botón [✅ Comprar $X de SYM]
  → el usuario toca
  → el código llama a POST /trades con el plan guardado
```

**El modelo nunca tiene `POST /trades` como herramienta.** Propone; el humano
confirma; el código ejecuta. Si el modelo malinterpreta "me compraría unas
Apple" como una orden, lo peor que pasa es que muestre un botón que nadie tocó.

---

## Credenciales

Cuatro valores, todos en `.dev.vars` (gitignoreado). Copiá el ejemplo:

```bash
cp .dev.vars.example .dev.vars
```

| Variable | De dónde sale |
|---|---|
| `BOT_TOKEN` | @BotFather → `/newbot` |
| `WEBHOOK_SECRET` | Lo inventás vos (ver el comando en el ejemplo) |
| `ENCRYPTION_KEY` | Lo inventás vos |
| `WORKER_URL` | La imprime `wrangler deploy` |

Aparte, **cada usuario final** genera su propia API key en Wallbit
(Settings → API Keys) y la vincula desde el bot. Nunca se comparte una key
entre usuarios.

- Permiso `read` → alcanza para consultar
- Permiso `trade` → necesario para comprar

---

## Setup

Requiere **Node 22+** (wrangler 4.114 no arranca con menos).

```bash
npm install
npx wrangler login

cp .dev.vars.example .dev.vars   # completar BOT_TOKEN, WEBHOOK_SECRET, ENCRYPTION_KEY

npx wrangler deploy              # imprime la URL → pegala en WORKER_URL
npx wrangler secret put ENCRYPTION_KEY

bash setup-webhook.sh            # sube secrets, registra webhook y comandos
```

`setup-webhook.sh` registra el webhook con `allowed_updates: ["message",
"callback_query"]`. **Sin `callback_query` los botones se dibujan y no hacen
nada** — Telegram descarta esos updates en silencio.

### Diagnóstico

```bash
bash check-telegram.sh   # mide si el backend del bot en Telegram está sano
npx wrangler tail        # logs en vivo
```

---

## Comandos del bot

| Comando | Qué hace |
|---|---|
| `/saldo` | Tarjeta con saldo y cartera |
| `/invertir` | Navegación por categorías con botones |
| `/vincular` | Genera un link de un solo uso para pegar la API key |
| `/desvincular` | Borra la key de este servicio (sigue viva en Wallbit) |
| `/revocar` | Le pide a Wallbit que la elimine definitivamente |
| `/reset` | Borra la conversación |

---

## Cobertura de la API de Wallbit

**Implementados (11 de 14):**

`GET /balance/checking` · `GET /balance/stocks` · `GET /assets` ·
`GET /assets/{symbol}` · `GET /transactions` · `POST /fees` · `GET /rates` ·
`GET /account-details` · `GET /wallets` · `GET /cards` · `POST /trades`

**Fuera a propósito:**

- `POST /operations/internal` — mover plata entre checking e inversión
- `PATCH /cards/{uuid}/status` — bloquear tarjeta
- `DELETE /api-key` — implementado, pero solo alcanzable desde `/revocar`

Ninguna operación de escritura es una herramienta del modelo. Si se agrega
alguna, va como comando o botón con confirmación explícita.

---

## Cosas que te van a morder

**No hay endpoint de estado de orden.** No podés preguntar "¿cómo salió la orden
X?". Por eso la idempotencia se resuelve en `claimTrade()`: un Durable Object
procesa un request por vez, así que la transición `pending → executing` es
atómica y un doble toque en el botón es inofensivo.

**`/balance/stocks` devuelve solo cantidad de acciones, sin valor.** Valorizar la
cartera cuesta un `GET /assets/{symbol}` por posición. Está cacheado 60s y
limitado a 10 posiciones, porque el plan gratuito permite 50 subrequests por
invocación.

**`/transactions` viene con doble anidado**: `{ data: { data: [...] } }`.

**`/fees` es POST**, no GET, con body `{"type":"TRADE"}`.

**Wallbit no devuelve timestamp con el precio.** Guardamos el nuestro al
consultar y lo mostramos.

**Los nombres de activos traen `&`** — "State Street SPDR S&P 500 ETF Trust"
rompe el parser HTML de Telegram si no se escapa.

**Presupuesto de Workers AI:** 10.000 neurons/día en plan gratuito, corte duro.
qwen3 razona antes de responder y ese razonamiento se factura como output.

---

## Qué falta

- Datos históricos de mercado (Wallbit no los expone; el plan es Alpaca detrás de
  una interfaz `MarketDataProvider`)
- El cron `0 21 * * 1-5` está registrado pero su handler solo loguea
- La API key se cifra con AES-GCM, pero rotar `ENCRYPTION_KEY` desvincula a todos
