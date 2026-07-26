import { Router } from "express";
import authService from "../services/auth.service.js";
import sessionManager from "../session/session.manager.js";
import { getIo } from "../socket/index.js";

const router = Router();

router.get("/connect/:token", (req, res) => {
    const record = authService.getConnectToken(req.params.token);

    if (!record) {
        return res.status(410).send(renderPage("Enlace expirado", "Este enlace ya no es válido. Solicita uno nuevo desde WhatsApp.", false));
    }

    res.send(renderPage("Conectar Wallbit", record.whatsapp, true, req.params.token));
});

router.post("/connect/:token", async (req, res) => {
    const { apiKey } = req.body;

    if (!apiKey) {
        return res.status(400).json({ success: false, message: "API Key requerida" });
    }

    const record = authService.getConnectToken(req.params.token);

    if (!record) {
        return res.status(400).json({ success: false, message: "Enlace inválido o expirado" });
    }

    const result = await authService.completeConnectLink(req.params.token, apiKey);

    if (result.ok) {
        const jid = record.jid || `${record.whatsapp.replace(/\D/g, "")}@s.whatsapp.net`;
        getIo()?.emit("wallbit:linked", { jid, linked: true });
        getIo()?.emit("session:update", sessionManager.toPublicView(sessionManager.get(jid)));
    }

    if (!result.ok) {
        return res.status(400).json(result);
    }

    res.json({ success: true, message: result.message });
});

function renderPage(title, subtitle, showForm, token = "") {
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Wallbit</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-950 text-white min-h-screen flex items-center justify-center p-4">
<div class="max-w-md w-full bg-gray-900 rounded-2xl p-8 shadow-xl border border-gray-800">
  <div class="text-center mb-8">
    <div class="text-4xl mb-4">🔐</div>
    <h1 class="text-2xl font-bold">${title}</h1>
    <p class="text-gray-400 mt-2">${subtitle}</p>
  </div>
  ${showForm ? `
  <form id="connectForm" class="space-y-4">
    <div>
      <label class="block text-sm text-gray-400 mb-2">API Key de Wallbit</label>
      <input type="password" id="apiKey" name="apiKey" required
        class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:border-emerald-500"
        placeholder="Tu API Key de Wallbit (X-API-Key)" autocomplete="off">
    </div>
    <p class="text-xs text-gray-500">Tu clave se cifrará con AES-256-GCM y nunca se mostrará en el chat.</p>
    <button type="submit" id="submitBtn"
      class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-lg transition">
      Conectar cuenta
    </button>
    <div id="result" class="hidden text-center text-sm p-3 rounded-lg"></div>
  </form>
  <script>
    document.getElementById('connectForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submitBtn');
      const result = document.getElementById('result');
      btn.disabled = true;
      btn.textContent = 'Validando...';
      try {
        const res = await fetch('/connect/${token}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: document.getElementById('apiKey').value })
        });
        const data = await res.json();
        result.classList.remove('hidden');
        if (data.success) {
          result.className = 'text-center text-sm p-3 rounded-lg bg-emerald-900 text-emerald-300';
          result.textContent = '✅ ' + data.message + ' Puedes cerrar esta ventana.';
          document.getElementById('connectForm').style.display = 'none';
        } else {
          result.className = 'text-center text-sm p-3 rounded-lg bg-red-900 text-red-300';
          result.textContent = '❌ ' + (data.message || 'Error al conectar');
          btn.disabled = false;
          btn.textContent = 'Reintentar';
        }
      } catch (err) {
        result.classList.remove('hidden');
        result.className = 'text-center text-sm p-3 rounded-lg bg-red-900 text-red-300';
        result.textContent = 'Error de conexión';
        btn.disabled = false;
        btn.textContent = 'Reintentar';
      }
    });
  </script>
  ` : `
  <p class="text-center text-gray-400">Vuelve a WhatsApp y escribe <strong>menu</strong> para solicitar un nuevo enlace.</p>
  `}
  <p class="text-center text-xs text-gray-600 mt-6">
    <a href="https://developer.wallbit.io/dashboard" class="text-emerald-500 hover:underline" target="_blank">Obtener API Key</a>
  </p>
</div>
</body>
</html>`;
}

export default router;
