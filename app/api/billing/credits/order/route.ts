import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/supabase/server";
import { AI_CREDIT_PACKS } from "@/lib/plans";
import { getRazorpay, isRazorpayConfigured, razorpayKeyId } from "@/lib/billing/razorpay";
import { getUserWorkspaceId } from "@/lib/workspaces";

const orderSchema = z.object({ packId: z.string().min(1).max(50) });

/** Create a one-time Razorpay order for a credit pack. Test mode first. */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!isRazorpayConfigured()) {
    return NextResponse.json(
      { error: "Payments aren't connected yet (missing Razorpay keys)." },
      { status: 503 },
    );
  }
  const body = orderSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Pick a credit pack." }, { status: 400 });
  }
  const pack = AI_CREDIT_PACKS.find((p) => p.id === body.data.packId);
  if (!pack) {
    return NextResponse.json({ error: "Unknown credit pack." }, { status: 400 });
  }
  const workspaceId = await getUserWorkspaceId(userId);
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace yet." }, { status: 400 });
  }

  const rzp = getRazorpay();
  try {
    const order = (await rzp!.orders.create({
      amount: pack.paise,
      currency: "INR",
      receipt: `ai-${workspaceId.slice(0, 8)}-${Date.now()}`,
      notes: { workspaceId, packId: pack.id, credits: String(pack.credits) },
    })) as { id: string; amount: number };
    return NextResponse.json({
      key: razorpayKeyId(),
      orderId: order.id,
      amount: order.amount,
      packId: pack.id,
    });
  } catch {
    return NextResponse.json({ error: "Could not start checkout." }, { status: 502 });
  }
}
