import client from "./client.js";

/**
 * Single entry point for all Wallbit REST operations.
 * Every call goes through client.request() via the helpers below.
 */
class Wallbit {
    request(apiKey, method, path, options) {
        return client.request(apiKey, method, path, options);
    }

    async validateApiKey(apiKey) {
        return this.getBalance(apiKey);
    }

    getBalance(apiKey) {
        return client.get(apiKey, "/balance/checking");
    }

    getStocksBalance(apiKey) {
        return client.get(apiKey, "/balance/stocks");
    }

    getPortfolio(apiKey) {
        return this.getStocksBalance(apiKey);
    }

    getAssets(apiKey, query) {
        return client.get(apiKey, "/assets", query);
    }

    getAsset(apiKey, symbol) {
        return client.get(apiKey, `/assets/${encodeURIComponent(symbol)}`);
    }

    getTransactions(apiKey, query) {
        return client.get(apiKey, "/transactions", query);
    }

    getWallets(apiKey, query) {
        return client.get(apiKey, "/wallets", query);
    }

    getAccount(apiKey, query) {
        return client.get(apiKey, "/account-details", query);
    }

    createTrade(apiKey, payload) {
        return client.post(apiKey, "/trades", payload);
    }

    getRates(apiKey, query) {
        return client.get(apiKey, "/rates", query);
    }

    getFees(apiKey, payload) {
        return client.post(apiKey, "/fees", payload);
    }

    revokeApiKey(apiKey) {
        return client.post(apiKey, "/api-key/revoke");
    }
}

export default new Wallbit();
