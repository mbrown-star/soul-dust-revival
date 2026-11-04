import crypto from "crypto";

/**
 * Encrypts/decrypts OAuth tokens and API keys before they touch the
 * database — social platform access tokens and the Anthropic API key are
 * exactly the kind of secret that shouldn't sit in plaintext in Postgres,
 * even though the database itself is already access-controlled.
 *
 * Uses AES-256-GCM (authenticated encryption — tampering is detected, not
 * just prevented) with a key from TOKEN_ENCRYPTION_KEY (32 raw bytes,
 * base64-encoded in the env var). Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

function getKey(): Buffer {
  const b64 = process.env.TOKEN_ENCRYPTION_KEY;
  if (!b64) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // GCM standard IV size
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store iv + authTag + ciphertext together, colon-separated base64 —
  // simplest self-contained format that doesn't need a separate column per part.
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptToken(stored: string): string {
  const key = getKey();
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted token — expected iv:authTag:data");
  }
  // Destructured directly, falsy segments (e.g. "" for an empty plaintext's
  // ciphertext) would be wrongly rejected as malformed -- the length check
  // above is the real validation, this just names the parts.
  const [ivB64, authTagB64, dataB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  // Unlike the data segment, iv and authTag are always fixed-size (12 and 16
  // bytes respectively) -- catch a malformed/truncated value here with the
  // deliberate error, rather than letting it fall through to a lower-level
  // crypto error from createDecipheriv/setAuthTag below.
  if (iv.length !== 12 || authTag.length !== 16) {
    throw new Error("Malformed encrypted token — expected iv:authTag:data");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
