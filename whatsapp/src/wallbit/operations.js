import client from "./client.js";

export async function internalOperation(apiKey, payload) {
    return client.post(apiKey, "/operations/internal", payload);
}
