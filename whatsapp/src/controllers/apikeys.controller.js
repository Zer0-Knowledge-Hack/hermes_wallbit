import apiKeysService from "../services/apikeys.service.js";

export function list(req, res) {
    res.json({ success: true, data: apiKeysService.list() });
}

export async function create(req, res) {
    const result = await apiKeysService.save(req.body);
    res.status(result.ok ? 201 : 400).json(result);
}

export function update(req, res) {
    const data = apiKeysService.update(req.params.id, req.body);
    if (!data) return res.status(404).json({ success: false, message: "No encontrado" });
    res.json({ success: true, data });
}

export function remove(req, res) {
    const ok = apiKeysService.remove(req.params.id);
    res.json({ success: ok });
}

export async function validate(req, res) {
    const record = apiKeysService.get(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "No encontrado" });

    const key = apiKeysService.getDecrypted(record.provider);
    if (!key) return res.json({ success: false, message: "No se pudo descifrar" });

    if (record.provider === "gemini") {
        const { default: geminiService } = await import("../services/gemini.service.js");
        const result = await geminiService.validateKey(key);
        return res.json(result);
    }

    if (record.provider === "wallbit") {
        const { default: wallbit } = await import("../wallbit/wallbit.js");
        const result = await wallbit.validateApiKey(key);
        return res.json({ ok: result.ok, message: result.message || (result.ok ? "Válida" : "Inválida") });
    }

    res.json({ ok: true, message: "Key almacenada (validación no disponible para este proveedor)" });
}
