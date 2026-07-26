import fs from "fs";
import path from "path";
import config from "../config/env.js";
import logger from "../utils/logger.js";

const COLLECTIONS = [
    "users",
    "contacts",
    "messages",
    "sessions",
    "wallbit_credentials",
    "audit_logs",
    "transactions_cache",
    "assets_cache",
    "connect_tokens",
    "pending_trades",
];

class Database {
    constructor() {
        this.dataDir = config.dataDir;
        this.cache = {};
        this.ensureDataDir();
        this.loadAll();
    }

    ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    filePath(collection) {
        return path.join(this.dataDir, `${collection}.json`);
    }

    loadAll() {
        for (const name of COLLECTIONS) {
            this.load(name);
        }
    }

    reset() {
        this.cache = {};
        this.ensureDataDir();
        for (const name of COLLECTIONS) {
            this.cache[name] = [];
            this.persist(name);
        }
    }

    load(collection) {
        const file = this.filePath(collection);

        if (fs.existsSync(file)) {
            try {
                this.cache[collection] = JSON.parse(fs.readFileSync(file, "utf8"));
            } catch {
                this.cache[collection] = [];
                logger.warn({ collection }, "Colección corrupta, reiniciando");
            }
        } else {
            this.cache[collection] = [];
            this.persist(collection);
        }
    }

    persist(collection) {
        this.ensureDataDir();
        fs.writeFileSync(this.filePath(collection), JSON.stringify(this.cache[collection], null, 2));
    }

    all(collection) {
        return [...(this.cache[collection] || [])];
    }

    find(collection, predicate) {
        return this.all(collection).find(predicate);
    }

    filter(collection, predicate) {
        return this.all(collection).filter(predicate);
    }

    insert(collection, record) {
        const item = {
            id: record.id || cryptoRandomId(),
            created_at: record.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...record,
        };

        this.cache[collection].push(item);
        this.persist(collection);
        return item;
    }

    update(collection, id, updates) {
        const index = this.cache[collection].findIndex((r) => r.id === id);

        if (index === -1) return null;

        this.cache[collection][index] = {
            ...this.cache[collection][index],
            ...updates,
            updated_at: new Date().toISOString(),
        };

        this.persist(collection);
        return this.cache[collection][index];
    }

    upsert(collection, matchFn, record) {
        const existing = this.find(collection, matchFn);

        if (existing) {
            return this.update(collection, existing.id, record);
        }

        return this.insert(collection, record);
    }

    remove(collection, id) {
        const before = this.cache[collection].length;
        this.cache[collection] = this.cache[collection].filter((r) => r.id !== id);

        if (this.cache[collection].length !== before) {
            this.persist(collection);
            return true;
        }

        return false;
    }

    removeWhere(collection, predicate) {
        const before = this.cache[collection].length;
        this.cache[collection] = this.cache[collection].filter((r) => !predicate(r));

        if (this.cache[collection].length !== before) {
            this.persist(collection);
            return true;
        }

        return false;
    }

    count(collection, predicate = () => true) {
        return this.filter(collection, predicate).length;
    }
}

function cryptoRandomId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const db = new Database();

export default db;
