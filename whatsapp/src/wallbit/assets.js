import client from "./client.js";

export async function listAssets(apiKey, query = {}) {
    return client.get(apiKey, "/assets", query);
}

export async function getAsset(apiKey, symbol) {
    return client.get(apiKey, `/assets/${encodeURIComponent(symbol)}`);
}
