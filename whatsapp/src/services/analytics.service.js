import db from "../database/index.js";
import sessionManager from "../session/session.manager.js";
import auditService from "../services/audit.service.js";
import messageService from "../services/message.service.js";
import { getDashboardStats } from "../socket/handlers.js";

class AnalyticsService {
    getOverview() {
        const stats = getDashboardStats();
        const logs = auditService.getRecent(500);
        const apiCalls = logs.filter((l) => l.type === "wallbit_api_call");
        const aiUsage = db.all("ai_usage");
        const sessions = sessionManager.allPublic();

        const byDay = this.groupByDay(logs.slice(0, 200));
        const byProvider = this.groupApiCalls(apiCalls);

        return {
            summary: {
                totalUsers: sessions.length,
                linkedUsers: sessions.filter((s) => s.wallbitLinked).length,
                totalMessages: stats.messages?.total || 0,
                apiCalls: apiCalls.length,
                errors: stats.errors || 0,
                aiRequests: aiUsage.length,
                aiTokens: aiUsage.reduce((s, u) => s + (u.tokens || 0), 0),
            },
            activity: byDay,
            apiByEndpoint: byProvider,
            aiUsage: aiUsage.slice(-30),
            performance: {
                uptime: stats.uptime,
                memory: stats.memory,
            },
        };
    }

    groupByDay(logs) {
        const map = {};

        for (const log of logs) {
            const day = (log.created_at || log.timestamp || "").slice(0, 10);
            if (!day) continue;
            map[day] = (map[day] || 0) + 1;
        }

        return Object.entries(map)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, count]) => ({ date, count }));
    }

    groupApiCalls(calls) {
        const map = {};

        for (const call of calls) {
            const ep = call.detail || "unknown";
            map[ep] = (map[ep] || 0) + 1;
        }

        return Object.entries(map)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([endpoint, count]) => ({ endpoint, count }));
    }

    recordAiUsage({ model, tokens, promptTokens, completionTokens }) {
        return db.insert("ai_usage", {
            model,
            tokens: tokens || 0,
            prompt_tokens: promptTokens || 0,
            completion_tokens: completionTokens || 0,
        });
    }
}

export default new AnalyticsService();
