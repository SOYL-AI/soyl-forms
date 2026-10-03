import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Creator-connected Razorpay helpers. Pure parts (mode detection, amount
 * math, signature checks) are unit-tested; workspace key loading and the
 * connect flow live in connect-actions.ts.
 */

/** Detect test/live from the public key prefix. Null when unrecognized. */
export function keyMode(keyId: string): "test" | "live" | null {
  if (keyId.startsWith("rzp_test_")) return "test";
  if (keyId.startsWith("rzp_live_")) return "live";
  return null;
}

export function isValidKeyId(raw: unknown): boolean {
  return typeof raw === "string" && raw.length >= 8 && raw.length <= 64 && /^[A-Za-z0-9_]+$/.test(raw);
}

export function isValidKeySecret(raw: unknown): boolean {
  return typeof raw === "string" && raw.length >= 8 && raw.length <= 128 && !/\s/.test(raw);
}

/** Rupees to paise (integer). Null for nonsense input. */
export function rupeesToPaise(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n) || n < 1 || n > 10_000_000) return null;
  return Math.round(n * 100);
}

/** 125000 -> "₹1,250.00". */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const MIN_PAISE = 100;
export const MAX_PAISE = 100_000_000; // ₹10L per payment

/**
 * The amount a payment block charges, in paise. Fixed blocks use their
 * configured value; linked blocks read a numeric answer (rounded to paise).
 */
export function computeExpectedPaise(
  block: { amountPaise?: number; amountFrom?: string },
  numericAnswers: Record<string, number>,
): { ok: true; paise: number } | { ok: false; error: string } {
  if (block.amountFrom) {
    const v = numericAnswers[block.amountFrom];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return { ok: false, error: "The linked amount isn't answered yet." };
    }
    const paise = Math.round(v * 100);
    if (paise < MIN_PAISE) return { ok: false, error: "The amount is below ₹1." };
    if (paise > MAX_PAISE) return { ok: false, error: "The amount is too large." };
    return { ok: true, paise };
  }
  if (typeof block.amountPaise === "number") {
    if (!Number.isInteger(block.amountPaise) || block.amountPaise < MIN_PAISE || block.amountPaise > MAX_PAISE) {
      return { ok: false, error: "The configured amount is invalid." };
    }
    return { ok: true, paise: block.amountPaise };
  }
  return { ok: false, error: "This payment has no amount configured." };
}

/**
 * Verify a checkout callback: Razorpay signs `order_id|payment_id` with the
 * workspace's key secret. Timing-safe, fail-closed.
 */
export function verifyPaymentSignature(args: {
  orderId: string;
  paymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  const { orderId, paymentId, signature, keySecret } = args;
  if (!orderId || !paymentId || !signature || !keySecret) return false;
  if (orderId.length > 100 || paymentId.length > 100 || signature.length > 500) return false;
  try {
    const expected = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
