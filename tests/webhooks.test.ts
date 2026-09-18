import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  decryptSecret,
  encryptSecret,
  isSecretEncryptionConfigured,
} from "@/lib/security/secrets";
import {
  signWebhook,
  submissionEventBody,
  verifyWebhookSignature,
} from "@/lib/webhooks/sign";

describe("webhook secrets", () => {
  it("round-trips through AES-GCM", () => {
    process.env.WEBHOOK_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    expect(isSecretEncryptionConfigured()).toBe(true);
    const cipher = encryptSecret("shh-123");
    expect(cipher).not.toContain("shh-123");
    expect(decryptSecret(cipher)).toBe("shh-123");
  });

  it("rejects tampered ciphertext", () => {
    process.env.WEBHOOK_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    const cipher = encryptSecret("shh-123");
    // Flip a character mid-payload (appending can be ignored by base64 padding).
    const tampered =
      cipher.slice(0, Math.floor(cipher.length / 2)) +
      (cipher[Math.floor(cipher.length / 2)] === "A" ? "B" : "A") +
      cipher.slice(Math.floor(cipher.length / 2) + 1);
    expect(tampered).not.toBe(cipher);
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("webhook signatures", () => {
  it("signs and verifies, rejects tampering and replays", () => {
    const secret = "test-secret";
    const body = submissionEventBody({
      eventId: "evt_1",
      formId: "f_1",
      submissionId: "s_1",
      submittedAt: new Date().toISOString(),
      answers: {},
    });
    const signed = signWebhook(secret, body, "evt_1");
    expect(
      verifyWebhookSignature(
        secret,
        body,
        signed.headers["x-webhook-timestamp"] as string,
        signed.headers["x-signature-256"] as string,
      ),
    ).toBe(true);
    expect(
      verifyWebhookSignature(
        secret,
        `${body} `,
        signed.headers["x-webhook-timestamp"] as string,
        signed.headers["x-signature-256"] as string,
      ),
    ).toBe(false);
    expect(
      verifyWebhookSignature(secret, body, "1", signed.headers["x-signature-256"] as string),
    ).toBe(false);
  });
});
