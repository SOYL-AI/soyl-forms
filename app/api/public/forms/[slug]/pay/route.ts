import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getWorkspacePlan } from "@/lib/billing/plan";
import { PLANS } from "@/lib/plans";
import { getWorkspaceRazorpay } from "@/lib/billing/connect-actions";
import { clientIp, formAcceptance, resolveFormVersion, resolvePublicForm } from "@/lib/forms/public";
import { expectedPaiseForBlock } from "@/lib/billing/payments-server";

const paySchema = z.object({
  blockId: z.string().min(1).max(64),
  formVersionId: z.string().min(1).max(100),
  answers: z.record(z.unknown()),
  email: z.string().email().max(200).optional(),
});

/**
 * Create a Razorpay order for one payment block, using the FORM OWNER's
 * connected keys. The amount is recomputed server-side (fixed price or the
 * linked question's validated answer) — the client never names a price.
 */
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const limit = checkRateLimit(`pay:${clientIp(req.headers)}:${params.slug}`, 10, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const body = paySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payment request." }, { status: 400 });

  const resolved = await resolvePublicForm(params.slug);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const form = resolved.form;
  const acceptance = formAcceptance(form);
  if (!acceptance.open) return NextResponse.json({ error: acceptance.message }, { status: 410 });

  const plan = await getWorkspacePlan(form.workspaceId);
  if (!PLANS[plan].entitlements.paymentCollection) {
    return NextResponse.json({ error: "This form can't accept payments." }, { status: 403 });
  }

  let answered = { versionId: form.versionId, schema: form.schema };
  if (body.data.formVersionId !== form.versionId) {
    const older = await resolveFormVersion(form.id, body.data.formVersionId);
    if (!older) return NextResponse.json({ error: "This form changed — please refresh." }, { status: 409 });
    answered = older;
  }

  const block = answered.schema.blocks.find((b) => b.id === body.data.blockId);
  if (!block || block.type !== "payment") {
    return NextResponse.json({ error: "Unknown payment step." }, { status: 400 });
  }
  const expected = expectedPaiseForBlock(answered.schema.blocks, block, body.data.answers);
  if (expected === null) {
    return NextResponse.json({ error: "The amount isn't known yet — answer the earlier questions first." }, { status: 400 });
  }

  const provider = await getWorkspaceRazorpay(form.workspaceId);
  if (!provider) {
    return NextResponse.json({ error: "The form owner hasn't connected payments yet." }, { status: 409 });
  }

  let order: { id: string };
  try {
    order = (await provider.client.orders.create({
      amount: expected,
      currency: "INR",
      receipt: `fp_${randomBytes(8).toString("hex")}`,
      notes: { formId: form.id, blockId: block.id, versionId: answered.versionId },
    })) as { id: string };
    if (!order?.id) throw new Error("no order id");
  } catch {
    return NextResponse.json({ error: "Couldn't start the payment. Please try again." }, { status: 502 });
  }

  const admin = getServiceSupabase();
  const { error } = await admin!
    .from("form_payments")
    .insert({
      workspace_id: form.workspaceId,
      form_id: form.id,
      form_version_id: answered.versionId,
      block_id: block.id,
      order_id: order.id,
      amount_paise: expected,
      currency: "INR",
      status: "created",
      respondent_email: body.data.email?.trim() ?? null,
    });
  if (error) return NextResponse.json({ error: "Couldn't start the payment. Please try again." }, { status: 500 });

  return NextResponse.json({ key: provider.keyId, orderId: order.id, amountPaise: expected });
}
