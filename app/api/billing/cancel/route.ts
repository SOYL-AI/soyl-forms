import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getSessionUserId } from "@/lib/supabase/server";
import { getRazorpay, isRazorpayConfigured } from "@/lib/billing/razorpay";
import { getUserWorkspaceId } from "@/lib/workspaces";

/** Request cancellation; the webhook confirms and drives the downgrade. */
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!isRazorpayConfigured()) {
    return NextResponse.json({ error: "Billing isn't connected yet." }, { status: 503 });
  }
  const workspaceId = await getUserWorkspaceId(userId);
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace yet." }, { status: 400 });
  }
  const admin = getServiceSupabase();
  const { data: sub } = await admin!
    .from("subscriptions")
    .select("provider_subscription_id, status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const row = sub as { provider_subscription_id: string | null; status: string } | null;
  if (!row?.provider_subscription_id) {
    return NextResponse.json({ error: "No active subscription to cancel." }, { status: 400 });
  }

  const rzp = getRazorpay();
  try {
    await rzp!.subscriptions.cancel(row.provider_subscription_id, false);
    await admin!
      .from("subscriptions")
      .update({ cancel_at_period_end: true })
      .eq("workspace_id", workspaceId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Cancellation failed at the provider." }, { status: 502 });
  }
}
