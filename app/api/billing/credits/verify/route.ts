import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getSessionUserId } from "@/lib/supabase/server";
import { AI_CREDIT_PACKS } from "@/lib/plans";
import { getAiBalance, getUserWorkspaceId } from "@/lib/workspaces";

const verifySchema = z.object({
  orderId: z.string().min(1).max(100),
  paymentId: z.string().min(1).max(100),
  signature: z.string().min(1).max(500),
  packId: z.string().min(1).max(50),
});

/**
 * Verify a completed Razorpay payment (HMAC over order|payment) and credit
 * the workspace. Idempotent: the ledger's unique (purchase, paymentId) key
 * makes double-verification safe.
 */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Payments aren't connected yet." }, { status: 503 });
  }
  const body = verifySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid payment payload." }, { status: 400 });
  }
  const pack = AI_CREDIT_PACKS.find((p) => p.id === body.data.packId);
  if (!pack) {
    return NextResponse.json({ error: "Unknown credit pack." }, { status: 400 });
  }

  const expected = createHmac("sha256", secret)
    .update(`${body.data.orderId}|${body.data.paymentId}`)
    .digest("hex");
  if (expected !== body.data.signature) {
    return NextResponse.json({ error: "Payment signature mismatch." }, { status: 400 });
  }

  const workspaceId = await getUserWorkspaceId(userId);
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace yet." }, { status: 400 });
  }
  const admin = getServiceSupabase();
  const { data: balance } = await admin!.rpc("grant_ai_credits", {
    p_workspace_id: workspaceId,
    p_amount: pack.credits,
    p_reason: "purchase",
    p_ref: body.data.paymentId,
  });
  void balance;

  return NextResponse.json({ ok: true, balance: await getAiBalance(workspaceId) });
}
