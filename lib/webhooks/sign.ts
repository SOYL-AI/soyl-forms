import { createHmac, timingSafeEqual } from "node:crypto";

export interface SignedWebhook {
  body: string;
  headers: Record<string, string>;
}

/**
 * Sign an outgoing payload: HMAC-SHA256 over `timestamp.body` so replays
 * across time windows fail. Receivers recompute with their per-webhook secret.
 */
export function signWebhook(secret: string, body: string, eventId: string): SignedWebhook {
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return {
    body,
    headers: {
      "content-type": "application/json",
      "x-webhook-id": eventId,
      "x-webhook-timestamp": timestamp,
      "x-signature-256": `sha256=${signature}`,
    },
  };
}

/** Verify a signature we produced (used by tests + the test-delivery path). */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  timestamp: string,
  signature: string,
  maxAgeMs = 5 * 60 * 1000,
): boolean {
  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function submissionEventBody(args: {
  eventId: string;
  formId: string;
  submissionId: string;
  submittedAt: string;
  answers: unknown;
}): string {
  return JSON.stringify({
    id: args.eventId,
    type: "form.submission.completed",
    createdAt: new Date().toISOString(),
    data: {
      formId: args.formId,
      submissionId: args.submissionId,
      submittedAt: args.submittedAt,
      answers: args.answers,
    },
  });
}
