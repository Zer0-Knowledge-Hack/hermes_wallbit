import geminiService from "../services/gemini.service.js";

export function getConfig(req, res) {
    res.json({ success: true, data: geminiService.getConfig() });
}

export function saveConfig(req, res) {
    const data = geminiService.saveConfig(req.body);
    res.json({ success: true, data });
}

export function getModels(req, res) {
    res.json({ success: true, data: geminiService.getModels() });
}

export async function saveKey(req, res) {
    const result = await geminiService.saveApiKey(req.body.apiKey);
    res.status(result.ok ? 200 : 400).json(result);
}

export async function validateKey(req, res) {
    const result = await geminiService.validateKey(req.body.apiKey);
    res.json(result);
}

export function resetPrompt(req, res) {
    const data = geminiService.resetPrompt();
    res.json({ success: true, data });
}
