import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/security/rateLimit";
import { getWorkspaceRazorpay } from "@/lib/billing/connect-actions";
import { verifyPaymentSignature } from "@/lib/billing/signature-server";
import { clientIp, resolvePublicForm } from "@/lib/forms/public";

const verifySchema = z.object({
  orderId: z.string().min(1).max(100),
  paymentId: z.string().min(1).max(100),
  signature: z.string().min(1).max(500),
});

/**
 * Confirm a checkout callback: HMAC with the workspace's secret, then fetch
 * the payment from Razorpay and require captured + exact amount + order
 * match. The API fetch (not the browser) is the source of truth.
 */
export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const limit = await enforceRateLimit(`payverify:${clientIp(req.headers)}:${params.slug}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const body = verifySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });

  const resolved = await resolvePublicForm(params.slug);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const provider = await getWorkspaceRazorpay(resolved.form.workspaceId);
  if (!provider) return NextResponse.json({ error: "Payments aren't connected for this form." }, { status: 409 });

  if (!verifyPaymentSignature({ orderId: body.data.orderId, paymentId: body.data.paymentId, signature: body.data.signature, keySecret: provider.keySecret })) {
    return NextResponse.json({ error: "Payment signature mismatch." }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const { data: row } = await admin!
    .from("form_payments")
    .select("id, status, amount_paise, payment_id")
    .eq("form_id", resolved.form.id)
    .eq("order_id", body.data.orderId)
    .maybeSingle();
  const payment = row as { id: string; status: string; amount_paise: number; payment_id: string | null } | null;
  if (!row) return NextResponse.json({ error: "Unknown order." }, { status: 404 });
  if (payment!.status === "paid") {
    if (payment!.payment_id !== body.data.paymentId) return NextResponse.json({ error: "Order already paid with another payment." }, { status: 409 });
    return NextResponse.json({ ok: true, amountPaise: payment!.amount_paise, duplicate: true });
  }

  let live: { status?: string; order_id?: string; amount?: number; currency?: string };
  try {
    live = (await provider.client.payments.fetch(body.data.paymentId)) as {
      status?: string;
      order_id?: string;
      amount?: number;
      currency?: string;
    };
  } catch {
    return NextResponse.json({ error: "Couldn't confirm with Razorpay. Please try again." }, { status: 502 });
  }
  if (
    live.status !== "captured" ||
    live.order_id !== body.data.orderId ||
    live.amount !== payment!.amount_paise ||
    (live.currency ?? "INR") !== "INR"
  ) {
    return NextResponse.json({ error: "Razorpay hasn't captured this payment." }, { status: 402 });
  }

  const { error: saveError } = await admin!
    .from("form_payments")
    .update({ status: "paid", payment_id: body.data.paymentId, paid_at: new Date().toISOString() })
    .eq("id", payment!.id)
    .eq("status", "created");
  if (saveError) return NextResponse.json({ error: "Could not save payment verification. Please retry." }, { status: 503 });
  return NextResponse.json({ ok: true, amountPaise: payment!.amount_paise });
}
