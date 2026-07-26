import wallbit from "../wallbit/wallbit.js";
import apiKeysService from "../services/apikeys.service.js";

async function withWallbit(res, fn) {
    const apiKey = apiKeysService.getDecrypted("wallbit");

    if (!apiKey) {
        return res.status(400).json({
            success: false,
            message: "Configura una API Key de Wallbit en API Keys",
        });
    }

    const start = Date.now();
    const result = await fn(apiKey);
    const latency = Date.now() - start;

    if (result.ok) apiKeysService.markUsed("wallbit");

    res.json({
        success: result.ok,
        data: result.data,
        message: result.message,
        meta: { latency, status: result.status, syncedAt: new Date().toISOString() },
    });
}

export const getBalance = (req, res) => withWallbit(res, (k) => wallbit.getBalance(k));
export const getStocksBalance = (req, res) => withWallbit(res, (k) => wallbit.getStocksBalance(k));
export const getPortfolio = (req, res) => withWallbit(res, (k) => wallbit.getPortfolio(k));
export const getWallets = (req, res) => withWallbit(res, (k) => wallbit.getWallets(k));
export const getTransactions = (req, res) => withWallbit(res, (k) => wallbit.getTransactions(k, req.query));
export const getAccount = (req, res) => withWallbit(res, (k) => wallbit.getAccount(k));
export const getRates = (req, res) => withWallbit(res, (k) => wallbit.getRates(k, req.query));
export const getFees = (req, res) => withWallbit(res, (k) => wallbit.getFees(k, req.body));
export const getAssets = (req, res) => withWallbit(res, (k) => wallbit.getAssets(k, req.query));
export const getAsset = (req, res) => withWallbit(res, (k) => wallbit.getAsset(k, req.params.symbol));

export async function previewTrade(req, res) {
    const apiKey = apiKeysService.getDecrypted("wallbit");
    if (!apiKey) {
        return res.status(400).json({ success: false, message: "API Key Wallbit no configurada" });
    }

    const fees = await wallbit.getFees(apiKey, req.body);
    res.json({ success: fees.ok, data: fees.data, message: fees.message });
}

export async function executeTrade(req, res) {
    const { confirmed, ...payload } = req.body;

    if (!confirmed) {
        return res.status(400).json({
            success: false,
            message: "Se requiere confirmación explícita (confirmed: true)",
        });
    }

    const apiKey = apiKeysService.getDecrypted("wallbit");
    if (!apiKey) {
        return res.status(400).json({ success: false, message: "API Key Wallbit no configurada" });
    }

    const result = await wallbit.createTrade(apiKey, payload);
    res.json({ success: result.ok, data: result.data, message: result.message });
}
