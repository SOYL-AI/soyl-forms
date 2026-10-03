import { getServiceSupabase } from "@/lib/supabase/admin";
import { isValidAnswer } from "@/lib/forms/answers";
import { computeExpectedPaise } from "./connect";
import type { Block } from "@/types/forms";

/**
 * Server-side payment bookkeeping (public routes call these; no session).
 * Amounts are always recomputed from validated answers — never trusted
 * from the client or from the payment answer itself.
 */

/** Lenient numeric map: valid numbers only, everything else ignored. */
export function numericMapLenient(
  blocks: Block[],
  answers: Record<string, unknown>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of blocks) {
    const raw = answers[b.id];
    if (raw === undefined || raw === null) continue;
    if (!isValidAnswer(b, raw)) continue;
    const v = (raw as { value?: unknown }).value;
    if (typeof v === "number" && Number.isFinite(v)) out[b.id] = v;
  }
  return out;
}

/** Expected charge for a payment block, or null when unknowable. */
export function expectedPaiseForBlock(
  blocks: Block[],
  block: Block & { type: "payment" },
  answers: Record<string, unknown>,
): number | null {
  if (typeof block.amountPaise === "number") {
    const r = computeExpectedPaise({ amountPaise: block.amountPaise }, {});
    return r.ok ? r.paise : null;
  }
  if (block.amountFrom) {
    const r = computeExpectedPaise({ amountFrom: block.amountFrom }, numericMapLenient(blocks, answers));
    return r.ok ? r.paise : null;
  }
  return null;
}

export interface PaymentRow {
  id: string;
  status: string;
  amount_paise: number;
  submission_id: string | null;
}

/**
 * Atomically claim a paid row for an in-flight submission (single UPDATE
 * with all guards in WHERE, so double-spend races lose exactly once).
 */
export async function claimPayment(args: {
  formId: string;
  paymentId: string;
  expectedPaise: number;
  marker: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = getServiceSupabase();
  if (!admin) return { ok: false, error: "Service temporarily unavailable. Please try again." };
  const { data, error } = await admin
    .from("form_payments")
    .update({ submission_id: args.marker })
    .eq("form_id", args.formId)
    .eq("payment_id", args.paymentId)
    .eq("status", "paid")
    .eq("amount_paise", args.expectedPaise)
    .is("submission_id", null)
    .select("id");
  if (error || !data || (data as unknown[]).length === 0) {
    return { ok: false, error: "That payment was already used or doesn't match this form. Please pay again." };
  }
  return { ok: true };
}

/** Point a claimed marker at the real submission after a successful insert. */
export async function linkPaymentToSubmission(marker: string, submissionId: string): Promise<void> {
  const admin = getServiceSupabase();
  if (!admin) return;
  await admin.from("form_payments").update({ submission_id: submissionId }).eq("submission_id", marker);
}
