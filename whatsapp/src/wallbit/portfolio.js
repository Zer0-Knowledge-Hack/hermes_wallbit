import { getStocksBalance } from "./balance.js";

export async function getPortfolio(apiKey) {
    return getStocksBalance(apiKey);
}
