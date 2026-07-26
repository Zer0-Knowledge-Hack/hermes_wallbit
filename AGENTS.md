# Instrucciones para agentes de IA

Este archivo lo leen Cursor, Claude Code, Antigravity y similares. Si vas a
tocar este repo con un agente, hacelo leer esto primero.

Leé también el `README.md` para la arquitectura y el setup.

---

## Reglas que no se negocian

### 1. Ninguna operación de escritura de Wallbit puede ser herramienta del modelo

`POST /trades`, `POST /operations/internal`, `PATCH /cards/{uuid}/status` y
`DELETE /api-key` mueven dinero o cambian el estado de una cuenta real.

El patrón obligatorio es: **el modelo calcula un plan → el código guarda ese plan
→ el usuario confirma con un botón → el código ejecuta el plan guardado.**

Se ejecuta lo que el usuario vio y confirmó, no lo que el modelo entendió en ese
momento. Ver `confirmKeyboard()` y el callback `buy:` en `src/index.ts`.

Si agregás una operación de escritura, seguí ese patrón. No la pongas en
`TOOLS`.

### 2. Toda cifra que el bot diga tiene que venir de la API

El modelo cita precios de su entrenamiento si lo dejás. Pasó: respondió
"SPY $420.12" sin llamar a ninguna herramienta, y un mensaje después la API
devolvió $738.93.

Por eso existe `guardAgainstInventedFigures()`: si la respuesta contiene una
cifra en dólares y `usedTools` está vacío, **la respuesta se descarta**. No la
quites ni la ablandes.

### 3. Frontera de confianza del HTML

`sendMessage()` y `editMessage()` reciben HTML **confiable** y lo mandan tal
cual. Quien llama es responsable de:

- Texto del modelo → `toTelegramHtml()` (escapa y después convierte Markdown)
- Valores de la API → `escapeHtml()`
- Strings propios → escribirlos ya como HTML válido

Convertir dentro de `sendMessage` rompe las tarjetas propias: sus etiquetas se
escapan y salen impresas. Ya pasó.

### 4. El aislamiento por usuario es estructural

Un Durable Object por `chat_id`, cada uno con su SQLite. El `chat_id` sale
siempre del update de Telegram, **nunca de input del usuario**. No agregues rutas
donde el usuario pueda elegir a qué sesión escribir.

### 5. El webhook responde 200 SIEMPRE

Telegram reencola y reintenta con backoff cualquier update que el webhook no
conteste con `2xx`. Un `403` no es un rechazo: es una promesa de que Telegram va
a volver a intentarlo, para siempre. Una ventana de `403` construye una cola que
no drena y deja al bot sin responder mucho después de que el problema original
desapareció. Ya pasó.

Rechazar un update significa **no procesarlo**, no rechazar la entrega. Si vas a
agregar validaciones en el handler, loguealas y devolvé `200` igual.

### 6. La idempotencia depende del Durable Object

No hay endpoint para consultar el estado de una orden. `claimTrade()` funciona
porque un Durable Object atiende un request por vez, así que leer-y-escribir es
atómico. Si movés esa lógica fuera del DO, se rompe y aparecen compras dobles.

---

## Convenciones

- **TypeScript estricto**, ES modules. `npx tsc --noEmit` tiene que pasar limpio.
- **Código y comentarios en inglés.** Los textos que ve el usuario van en
  español.
- **Comentá el porqué, no el qué.** Los comentarios de este repo explican
  decisiones, no repiten el código.
- Los errores de Wallbit se modelan como `WallbitResult<T>` discriminado, no como
  excepciones: todo corre dentro de `ctx.waitUntil()`, donde un `throw` es
  invisible para el usuario.
- `Record<WallbitFailure, string>` para los mensajes de error: si agregás un modo
  de fallo, el compilador te obliga a contemplarlo en todos lados.

## Estructura

```
src/
  index.ts     webhook, comandos, callbacks, routing
  ai.ts        prompt, loop de tools, parseo de la respuesta
  tools.ts     definiciones de herramientas (SOLO lectura) y dispatcher
  wallbit.ts   cliente HTTP de la API de Wallbit
  session.ts   Durable Object: conversación, credencial, trades pendientes
  link.ts      página de vinculación y su handler
  telegram.ts  cliente de la Bot API y conversión a HTML
  ui.ts        tarjetas y teclados inline
  crypto.ts    AES-GCM para la key en reposo
```

## Antes de dar algo por terminado

```bash
npx tsc --noEmit
npx wrangler deploy --dry-run
```

Probalo en Telegram de verdad. El typecheck no detecta un prompt que quedó
cobarde ni un teclado que no aparece.

## Trampas de la plataforma

- **Workers AI con este modelo exige formato OpenAI para `tools`**:
  `{type:"function", function:{...}}`. El plano falla con
  `8007 ... 'function' Field required`.
- **La respuesta viene en `choices[0].message.content`**; el campo `response` de
  arriba llega `null`. Los `tool_calls` traen `arguments` como **string JSON**.
- **qwen3 razona antes de responder** y eso consume `max_tokens`. Con un tope
  bajo devuelve `content: null` y `finish_reason: "length"`.
- **50 subrequests por invocación** en el plan gratuito. Un snapshot de cuenta ya
  usa hasta 12.
- **Si el bot deja de responder**, comparalo contra un token falso:
  `curl https://api.telegram.org/bot123456:FAKE/getMe` debe dar `401`. Si el
  falso da 401 y el tuyo da 502 o timeout, el backend del bot está caído del lado
  de Telegram y no hay nada que arreglar en el código.
