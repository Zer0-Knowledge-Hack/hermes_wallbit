import db from "../database/index.js";

const DEFAULTS = {
    general: {
        appName: "Wallbit AI Dashboard",
        version: "2.0",
        timezone: "America/La_Paz",
        language: "es",
    },
    appearance: {
        theme: "dark",
        sidebarCollapsed: false,
        animations: true,
    },
    notifications: {
        email: false,
        push: true,
        tradeAlerts: true,
        apiErrors: true,
    },
    security: {
        sessionTimeout: 3600,
        requireConfirmation: true,
    },
};

class SettingsService {
    getAll() {
        const stored = db.all("app_settings");
        const merged = { ...DEFAULTS };

        for (const section of stored) {
            merged[section.key] = { ...merged[section.key], ...section.value };
        }

        return merged;
    }

    getSection(key) {
        const all = this.getAll();
        return all[key] || DEFAULTS[key] || {};
    }

    saveSection(key, value) {
        return db.upsert(
            "app_settings",
            (s) => s.key === key,
            { key, value }
        );
    }
}

export default new SettingsService();
