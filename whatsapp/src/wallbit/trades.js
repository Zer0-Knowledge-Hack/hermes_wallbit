import client from "./client.js";

export async function createTrade(apiKey, payload) {
    return client.post(apiKey, "/trades", payload);
}

export async function getFees(apiKey, payload) {
    return client.post(apiKey, "/fees", payload);
}
