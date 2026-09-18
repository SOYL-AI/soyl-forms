import Razorpay from "razorpay";

/** True when Razorpay test/live keys are present (server-only usage). */
export function isRazorpayConfigured(): boolean {
  return Boolean(
    process.env.RAZORPAY_KEY_SECRET &&
      (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID),
  );
}

export function razorpayKeyId(): string {
  return (
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? ""
  );
}

let instance: Razorpay | null = null;

export function getRazorpay(): Razorpay | null {
  if (!isRazorpayConfigured()) return null;
  if (!instance) {
    instance = new Razorpay({
      key_id: razorpayKeyId(),
      key_secret: process.env.RAZORPAY_KEY_SECRET as string,
    });
  }
  return instance;
}
