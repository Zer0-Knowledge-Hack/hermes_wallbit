import client from "./client.js";

export async function listTransactions(apiKey, query = {}) {
    return client.get(apiKey, "/transactions", query);
}
