import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALG = "aes-256-gcm";

/**
 * Webhook-secret encryption (AES-256-GCM). Fail-closed: without
 * WEBHOOK_ENCRYPTION_KEY (32 random bytes, hex or base64) the app refuses
 * to store webhook secrets instead of keeping them in cleartext.
 */
function key(): Buffer | null {
  const raw = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (!raw) return null;
  try {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
  } catch {
    return null;
  }
  return null;
}

export function isSecretEncryptionConfigured(): boolean {
  return key() !== null;
}

export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) throw new Error("WEBHOOK_ENCRYPTION_KEY is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, k, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${body.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const k = key();
  if (!k) throw new Error("WEBHOOK_ENCRYPTION_KEY is not configured.");
  const [ivB64, tagB64, bodyB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !bodyB64) throw new Error("Malformed secret.");
  const decipher = createDecipheriv(ALG, k, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(bodyB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function newWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}
