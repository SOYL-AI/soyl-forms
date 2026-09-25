import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getSessionUserId } from "@/lib/supabase/server";
import { getRazorpay, isRazorpayConfigured, razorpayKeyId } from "@/lib/billing/razorpay";
import { razorpayPlanIdFor } from "@/lib/billing/subscriptions";
import { getUserWorkspaceId } from "@/lib/workspaces";
import type { BillingInterval, PlanCode } from "@/lib/plans";
import { getPlatformFlags } from "@/lib/platform";

const subscribeSchema = z.object({
  plan: z.enum(["starter", "pro"]),
  interval: z.enum(["monthly", "yearly"]),
});

/**
 * Create a Razorpay subscription server-side and hand the browser a checkout
 * session. Provider plan ids come only from server env — never the client.
 * The webhook remains the source of truth; checkout success alone grants
 * nothing durable.
 */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!isRazorpayConfigured()) {
    return NextResponse.json(
      { error: "Billing isn't connected yet (missing Razorpay keys). Test mode first." },
      { status: 503 },
    );
  }
  const flags = await getPlatformFlags();
  if (!flags.upgradesEnabled) {
    return NextResponse.json({ error: "Upgrades are paused right now. Try again later." }, { status: 503 });
  }
  const body = subscribeSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Pick a plan and billing period." }, { status: 400 });
  }
  const plan = body.data.plan as PlanCode;
  const interval = body.data.interval as BillingInterval;
  const providerPlanId = razorpayPlanIdFor(plan, interval);
  if (!providerPlanId) {
    return NextResponse.json(
      { error: `No Razorpay plan configured for ${plan} ${interval}.` },
      { status: 500 },
    );
  }

  const workspaceId = await getUserWorkspaceId(userId);
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace yet." }, { status: 400 });
  }

  const rzp = getRazorpay();
  try {
    const subscription = (await rzp!.subscriptions.create({
      plan_id: providerPlanId,
      customer_notify: 1,
      total_count: interval === "monthly" ? 120 : 10,
      notes: { workspaceId, plan, interval },
    })) as { id: string; status: string };

    const admin = getServiceSupabase();
    await admin!.from("subscriptions").upsert(
      {
        workspace_id: workspaceId,
        plan_code: plan,
        provider: "razorpay",
        provider_subscription_id: subscription.id,
        provider_plan_id: providerPlanId,
        billing_interval: interval,
        status: "created",
        cancel_at_period_end: false,
      },
      { onConflict: "workspace_id" },
    );

    return NextResponse.json({
      key: razorpayKeyId(),
      subscriptionId: subscription.id,
      plan,
      interval,
    });
  } catch {
    return NextResponse.json({ error: "Could not start checkout." }, { status: 502 });
  }
}
