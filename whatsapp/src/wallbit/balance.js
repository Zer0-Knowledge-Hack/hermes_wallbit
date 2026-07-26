import client from "./client.js";

export async function getCheckingBalance(apiKey) {
    return client.get(apiKey, "/balance/checking");
}

export async function getStocksBalance(apiKey) {
    return client.get(apiKey, "/balance/stocks");
}
