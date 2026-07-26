import sessionManager from "../session/session.manager.js";
import db from "../database/index.js";

export function list(req, res) {
    const { search, state, page = 1, limit = 20 } = req.query;
    let sessions = sessionManager.allPublic();

    if (search) {
        const q = search.toLowerCase();
        sessions = sessions.filter(
            (s) => s.phone?.includes(q) || s.jid?.includes(q) || s.state?.toLowerCase().includes(q)
        );
    }

    if (state) {
        sessions = sessions.filter((s) => s.state === state);
    }

    const total = sessions.length;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const data = sessions.slice(offset, offset + parseInt(limit, 10));

    res.json({
        success: true,
        data,
        pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10) },
    });
}
