import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getSessionUserId } from "@/lib/supabase/server";
import { getUserWorkspaceId } from "@/lib/workspaces";
import { auditLog } from "@/lib/admin";
import { isAzureBackend } from "@/lib/backend";
import { subscription } from "@/lib/db/repositories/billing";
import { readWorkspaceRole } from "@/lib/db/repositories/workspaces";
import { reconcileBillingEvent } from "@/lib/billing/azure-checkout";

const schema = z.object({
  paymentId: z.string().min(1).max(100),
  subscriptionId: z.string().min(1).max(100),
  signature: z.string().min(1).max(500),
});

/**
 * Browser checkout callback verification. Razorpay signs
 * `payment_id|subscription_id` with the key secret. A valid signature moves a
 * `created` subscription to `authenticated` so the user sees their plan
 * instantly; the server webhook remains the durable source of truth.
 */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return NextResponse.json({ error: "Payments are temporarily unavailable. Please contact support." }, { status: 503 });
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });

  const expected = createHmac("sha256", secret).update(`${body.data.paymentId}|${body.data.subscriptionId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(body.data.signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Payment signature mismatch." }, { status: 400 });
  }

  const workspaceId = await getUserWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: "No workspace yet." }, { status: 400 });
  if(isAzureBackend()) {
    if(await readWorkspaceRole(userId,workspaceId)!=='owner') return NextResponse.json({error:'Only workspace owners manage billing.'},{status:403});
    const stored=await subscription(userId,workspaceId);
    if(stored?.provider_subscription_id!==body.data.subscriptionId) return NextResponse.json({error:'Subscription not found.'},{status:404});
    try {
      await reconcileBillingEvent({id:`checkout:${body.data.paymentId}`,event:'checkout.verified',hash:createHash('sha256').update(`${body.data.subscriptionId}:${body.data.paymentId}`).digest('hex'),providerId:body.data.subscriptionId});
      const updated=await subscription(userId,workspaceId);
      return NextResponse.json({ok:true,applied:updated?.status==='active'||updated?.status==='authenticated'});
    } catch {return NextResponse.json({error:'Could not confirm the subscription with Razorpay. Please retry.'},{status:502});}
  }
  const admin = getServiceSupabase()!;
  const { data } = await admin
    .from("subscriptions")
    .update({ status: "authenticated", updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("provider_subscription_id", body.data.subscriptionId)
    .eq("status", "created")
    .select("workspace_id")
    .maybeSingle();

  await auditLog({
    actorUserId: userId,
    actorType: "user",
    workspaceId,
    action: "billing.checkout.verified",
    targetType: "subscription",
    targetId: body.data.subscriptionId,
    metadata: { paymentId: body.data.paymentId, applied: Boolean(data) },
  });
  return NextResponse.json({ ok: true, applied: Boolean(data) });
}
