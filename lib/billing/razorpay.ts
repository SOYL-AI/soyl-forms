import Razorpay from "razorpay";

/** True when Razorpay test/live keys are present (server-only usage). */
export function isRazorpayConfigured(): boolean {
  return Boolean(
    process.env.RAZORPAY_KEY_SECRET &&
      (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID),
  );
}

export function razorpayKeyId(): string {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || process.env.RAZORPAY_KEY_ID?.trim() || "";
}

/** Razorpay 2.x exposes its Axios transport without constructor timeout options.
 * Keep the SDK boundary here so probes, payments and legacy paths share real limits. */
export function createRazorpay(keyId:string,keySecret:string):Razorpay {
  const client=new Razorpay({key_id:keyId,key_secret:keySecret});
  const transport=client.api as unknown as {rq?:{defaults:Record<string,unknown>}};
  if(!transport.rq?.defaults) throw new Error("Unsupported payment SDK transport");
  Object.assign(transport.rq.defaults,{timeout:10_000,maxRedirects:0,maxContentLength:1_048_576,maxBodyLength:1_048_576});
  return client;
}
let instance: Razorpay | null = null;

export function getRazorpay(): Razorpay | null {
  if (!isRazorpayConfigured()) return null;
  if (!instance) {
    instance = createRazorpay(razorpayKeyId(),process.env.RAZORPAY_KEY_SECRET as string);
  }
  return instance;
}
