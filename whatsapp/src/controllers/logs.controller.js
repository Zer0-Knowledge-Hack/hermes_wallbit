import auditService from "../services/audit.service.js";
import db from "../database/index.js";

export function list(req, res) {
    const { type, search, level, limit = 100 } = req.query;
    let logs = auditService.getRecent(parseInt(limit, 10) * 2);

    if (type) logs = logs.filter((l) => l.type === type);
    if (search) {
        const q = search.toLowerCase();
        logs = logs.filter(
            (l) =>
                l.detail?.toLowerCase().includes(q) ||
                l.whatsapp?.includes(q) ||
                l.jid?.includes(q)
        );
    }

    res.json({ success: true, data: logs.slice(0, parseInt(limit, 10)) });
}

export function exportLogs(req, res) {
    const logs = auditService.getRecent(1000);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=audit-logs.json");
    res.send(JSON.stringify(logs, null, 2));
}
