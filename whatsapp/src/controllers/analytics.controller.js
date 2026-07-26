import analyticsService from "../services/analytics.service.js";

export function overview(req, res) {
    res.json({ success: true, data: analyticsService.getOverview() });
}
