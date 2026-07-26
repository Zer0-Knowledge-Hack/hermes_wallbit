/**
 * Envelope encryption for credentials at rest.
 *
 * Cloudflare already encrypts Durable Object storage at the infrastructure
 * level. This adds a second layer the platform cannot read for us: the key is
 * derived from a Worker secret, so a dump of the SQLite contents alone is not
 * enough to recover anyone's Wallbit API key.
 */

const INFO = new TextEncoder().encode("hermes-bot:wallbit-api-key:v1");
const IV_BYTES = 12;

async function deriveKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: INFO },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Returns base64 of `iv || ciphertext`. A fresh IV is generated per call. */
export async function encrypt(secret: string, plaintext: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), iv.length);

  return toBase64(packed);
}

/**
 * Returns null instead of throwing when the payload is corrupt, truncated,
 * written by an older format, or encrypted under a different secret. Callers
 * treat that as "no credential stored".
 */
export async function decrypt(secret: string, payload: string): Promise<string | null> {
  try {
    const packed = fromBase64(payload);
    if (packed.length <= IV_BYTES) return null;

    const key = await deriveKey(secret);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: packed.slice(0, IV_BYTES) },
      key,
      packed.slice(IV_BYTES),
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
