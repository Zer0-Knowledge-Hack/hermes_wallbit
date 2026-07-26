import dashboardService from "../services/dashboard.service.js";

export async function getKpis(req, res) {
    try {
        const data = await dashboardService.getKpis();
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

export function getActivity(req, res) {
    const limit = parseInt(req.query.limit || "20", 10);
    res.json({ success: true, data: dashboardService.getRecentActivity(limit) });
}
