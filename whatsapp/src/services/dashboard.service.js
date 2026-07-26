import sessionManager from "../session/session.manager.js";
import auditService from "../services/audit.service.js";
import messageService from "../services/message.service.js";
import analyticsService from "../services/analytics.service.js";
import apiKeysService from "../services/apikeys.service.js";
import geminiService from "../services/gemini.service.js";
import wallbit from "../wallbit/wallbit.js";
import { getDashboardStats } from "../socket/handlers.js";

class DashboardService {
    async getKpis() {
        const stats = getDashboardStats();
        const sessions = sessionManager.allPublic();
        const analytics = analyticsService.getOverview();
        const wallbitKey = apiKeysService.getDecrypted("wallbit");

        let balance = null;
        let portfolio = null;
        let latency = null;

        if (wallbitKey) {
            const start = Date.now();
            const balResult = await wallbit.getBalance(wallbitKey);
            latency = Date.now() - start;

            if (balResult.ok) {
                balance = balResult.data;
                apiKeysService.markUsed("wallbit");
            }

            const portResult = await wallbit.getPortfolio(wallbitKey);
            if (portResult.ok) portfolio = portResult.data;
        }

        const linked = sessions.filter((s) => s.wallbitLinked).length;
        const geminiConfig = geminiService.getConfig();

        return {
            balance: this.extractUsdBalance(balance),
            portfolioValue: this.extractPortfolioValue(portfolio),
            profit: 0,
            loss: 0,
            roi: 0,
            assets: portfolio?.data?.assets?.length || 0,
            transactions: stats.messages?.total || 0,
            apiStatus: wallbitKey ? (balance !== null ? "online" : "error") : "unconfigured",
            apiLatency: latency,
            aiUsage: analytics.summary.aiRequests,
            aiTokens: analytics.summary.aiTokens,
            aiStatus: geminiConfig.hasKey ? "ready" : "unconfigured",
            users: stats.users,
            whatsapp: stats.whatsapp,
            uptime: stats.uptime,
            errors: stats.errors,
            apiCalls: stats.apiCalls,
            lastSync: new Date().toISOString(),
        };
    }

    extractUsdBalance(data) {
        const balances = data?.data || data || [];
        if (Array.isArray(balances)) {
            const usd = balances.find((b) => (b.currency || "").toUpperCase() === "USD");
            return usd?.amount ?? usd?.balance ?? 0;
        }
        return balances?.amount ?? 0;
    }

    extractPortfolioValue(data) {
        const d = data?.data || data || {};
        return d.usd_balance ?? d.total_value ?? 0;
    }

    getRecentActivity(limit = 10) {
        return auditService.getRecent(limit);
    }
}

export default new DashboardService();
