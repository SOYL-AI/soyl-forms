import { createHmac, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import {
  applyRazorpayEvent,
  planFromRazorpayPlanId,
  type RzpSubscriptionEntity,
} from "@/lib/billing/subscriptions";
import { auditLog } from "@/lib/admin";

/**
 * Razorpay lifecycle webhook — the source of truth for subscriptions.
 * - Operates on the RAW body for signature verification.
 * - Deduplicates on `x-razorpay-event-id` (safe under retries/duplicates).
 * - Never trusts browser checkout callbacks for durable entitlements.
 */
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    // 503 so Razorpay retries after the secret is configured.
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const eventId = req.headers.get("x-razorpay-event-id") ?? "";

  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (!signature || signature !== expected) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }
  if (!eventId) {
    return NextResponse.json({ error: "Missing event id." }, { status: 400 });
  }

  const admin = getServiceSupabase();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }

  // Idempotency gate: an already-processed event id is acked, never re-applied.
  const payloadHash = createHash("sha256").update(raw).digest("hex");
  let parsed: { event?: string; payload?: { subscription?: { entity?: RzpSubscriptionEntity } } };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const { data: seen } = await admin
    .from("razorpay_webhook_events")
    .select("event_id, processed_at")
    .eq("event_id", eventId)
    .maybeSingle();
  if ((seen as { processed_at: string | null } | null)?.processed_at) {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  await admin.from("razorpay_webhook_events").upsert(
    {
      event_id: eventId,
      event_type: parsed.event ?? "unknown",
      payload_hash: payloadHash,
      status: "received",
    },
    { onConflict: "event_id" },
  );

  const finish = async (status: string) => {
    await admin
      .from("razorpay_webhook_events")
      .update({ status, processed_at: new Date().toISOString() })
      .eq("event_id", eventId);
  };

  const event = parsed.event ?? "";
  if (!event.startsWith("subscription.")) {
    await finish("ignored");
    return NextResponse.json({ ok: true, ignored: true });
  }

  const entity = parsed.payload?.subscription?.entity;
  if (!entity?.id) {
    await finish("invalid");
    return NextResponse.json({ error: "Missing subscription entity." }, { status: 400 });
  }

  const transition = applyRazorpayEvent(event, entity);
  if (!transition) {
    await finish("ignored");
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { data: local } = await admin
    .from("subscriptions")
    .select("workspace_id")
    .eq("provider_subscription_id", transition.providerSubscriptionId)
    .maybeSingle();
  const row = local as { workspace_id: string } | null;
  if (!row) {
    // Subscription created outside our checkout (or test event): record, don't invent access.
    await finish("orphan");
    await auditLog({
      action: "billing.webhook.orphan",
      targetType: "subscription",
      targetId: transition.providerSubscriptionId,
      metadata: { event },
    });
    return NextResponse.json({ ok: true, orphan: true });
  }

  const update: Record<string, unknown> = {
    status: transition.status,
    provider_plan_id: transition.providerPlanId ?? undefined,
    current_period_start: transition.currentPeriodStart,
    current_period_end: transition.currentPeriodEnd,
    cancel_at_period_end: false,
    updated_at: new Date().toISOString(),
  };
  if (transition.downgradeToFree) {
    // Downgrades preserve every form, response, and file — only limits change.
    update.plan_code = "free";
    update.billing_interval = null;
  } else if (transition.providerPlanId) {
    const match = planFromRazorpayPlanId(transition.providerPlanId);
    if (match) {
      update.plan_code = match.plan;
      update.billing_interval = match.interval;
    }
  }
  await admin.from("subscriptions").update(update).eq("workspace_id", row.workspace_id);
  await auditLog({
    workspaceId: row.workspace_id,
    action: `billing.${event}`,
    targetType: "subscription",
    targetId: transition.providerSubscriptionId,
    metadata: { status: transition.status },
  });
  await finish("processed");
  return NextResponse.json({ ok: true });
}
