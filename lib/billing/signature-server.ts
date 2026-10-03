import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a checkout callback on the server: Razorpay signs `order_id|payment_id`
 * with the workspace's key secret. Timing-safe, fail-closed.
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
