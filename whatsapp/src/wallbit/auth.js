import client from "./client.js";

export async function validateApiKey(apiKey) {
    return client.get(apiKey, "/balance/checking");
}

export async function revokeApiKey(apiKey) {
    return client.post(apiKey, "/api-key/revoke");
}
