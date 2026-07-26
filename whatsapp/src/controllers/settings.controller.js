import settingsService from "../services/settings.service.js";

export function getAll(req, res) {
    res.json({ success: true, data: settingsService.getAll() });
}

export function saveSection(req, res) {
    const data = settingsService.saveSection(req.params.section, req.body);
    res.json({ success: true, data });
}
