import crypto from "crypto";
import config from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;

/**
 * Deriva una clave de 32 bytes usando HKDF-SHA256
 */
export function deriveKey(salt, info = "wallbit-credentials") {
    let masterKey;
    const rawKey = config.encryptionKey?.trim();

    if (rawKey && /^[0-9a-fA-F]{64}$/.test(rawKey)) {
        masterKey = Buffer.from(rawKey, "hex");
    } else if (rawKey) {
        masterKey = crypto.createHash("sha256").update(rawKey).digest();
    } else {
        masterKey = crypto.createHash("sha256").update(config.jwtSecret || "default-wallbit-key").digest();
    }

    return crypto.hkdfSync("sha256", masterKey, salt, info, 32);
}

/**
 * Cifra un texto con AES-256-GCM
 * Retorna: salt:iv:tag:ciphertext (base64)
 */
export function encrypt(plaintext) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [salt, iv, tag, encrypted].map((b) => b.toString("base64")).join(":");
}

/**
 * Descifra un payload cifrado con encrypt()
 */
export function decrypt(payload) {
    const [saltB64, ivB64, tagB64, dataB64] = payload.split(":");

    const salt = Buffer.from(saltB64, "base64");
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");

    const key = deriveKey(salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/**
 * Genera un token seguro aleatorio
 */
export function generateToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Enmascara una API Key para logs (nunca mostrar completa)
 */
export function maskSecret(value) {
    if (!value || value.length < 8) return "****";
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
