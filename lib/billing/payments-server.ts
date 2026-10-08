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
