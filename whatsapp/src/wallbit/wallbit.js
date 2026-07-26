import client from "./client.js";
import { buildTradePayload, buildFeesPayload } from "../utils/wallbit-messages.js";

/**
 * Single entry point for all Wallbit REST operations.
 */
class Wallbit {
    request(apiKey, method, path, options) {
        return client.request(apiKey, method, path, options);
    }

    validateApiKey(apiKey) {
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

    getAccount(apiKey, query = { country: "US", currency: "USD" }) {
        return client.get(apiKey, "/account-details", query);
    }

    getCards(apiKey) {
        return client.get(apiKey, "/cards");
    }

    getRates(apiKey, query) {
        return client.get(apiKey, "/rates", query);
    }

    getFees(apiKey, payload) {
        const body = payload?.type ? payload : buildFeesPayload("TRADE");
        return client.post(apiKey, "/fees", body);
    }

    createTrade(apiKey, plan) {
        const body = plan.symbol && plan.direction
            ? plan
            : buildTradePayload({
                symbol: plan.symbol,
                direction: plan.direction || (plan.side === "sell" ? "SELL" : "BUY"),
                amount: plan.amount,
                currency: plan.currency || "USD",
                orderType: plan.order_type || "MARKET",
            });
        return client.post(apiKey, "/trades", body);
    }

    internalOperation(apiKey, payload) {
        return client.post(apiKey, "/operations/internal", payload);
    }

    revokeApiKey(apiKey) {
        return client.delete(apiKey, "/api-key");
    }
}

export default new Wallbit();
