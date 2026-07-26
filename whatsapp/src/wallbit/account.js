import client from "./client.js";

export async function getAccountDetails(apiKey, query = {}) {
    return client.get(apiKey, "/account-details", query);
}
