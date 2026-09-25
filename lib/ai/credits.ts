import { getServiceSupabase } from "@/lib/supabase/admin";
import { PLANS, type PlanCode } from "@/lib/plans";
import { getAiBalance } from "@/lib/workspaces";

export function monthRef(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

/**
 * Plan-aware monthly grant. Idempotent per workspace+month via the ledger's
 * unique (workspace, reason, ref) key — safe to call on every AI request.
 */
export async function ensureMonthlyCredits(workspaceId: string, plan: PlanCode): Promise<void> {
  const admin = getServiceSupabase();
  if (!admin) return;
  const amount = PLANS[plan].entitlements.aiCreditsMonthly;
  if (amount <= 0) return;
  try {
    await admin.rpc("grant_ai_credits", {
      p_workspace_id: workspaceId,
      p_amount: amount,
      p_reason: "monthly",
      p_ref: `${monthRef()}:${plan}`,
    });
  } catch {
    // Ledger not migrated yet — balance stays 0 and the route reports it.
  }
}

/** Atomically spend credits; false when the balance can't cover it. */
export async function spendCredits(workspaceId: string, amount: number, reason: string): Promise<boolean> {
  const admin = getServiceSupabase();
  if (!admin) return false;
  const { data } = await admin.rpc("spend_ai_credits", {
    p_workspace_id: workspaceId,
    p_amount: amount,
    p_reason: reason,
  });
  return Boolean(data);
}

/** Refund after a provider failure so users never pay for nothing. */
export async function refundCredits(workspaceId: string, amount: number, ref: string): Promise<void> {
  const admin = getServiceSupabase();
  if (!admin) return;
  await admin
    .rpc("grant_ai_credits", { p_workspace_id: workspaceId, p_amount: amount, p_reason: "refund", p_ref: ref })
    .then(() => undefined, () => undefined);
}

export { getAiBalance };
