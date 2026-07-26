import client from "./client.js";

export async function getWallets(apiKey, query = {}) {
    return client.get(apiKey, "/wallets", query);
}
