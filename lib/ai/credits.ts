import { getServiceSupabase } from "@/lib/supabase/admin";
import { PLANS, type PlanCode } from "@/lib/plans";
import { getAiBalance } from "@/lib/workspaces";
import { isAzureBackend } from "@/lib/backend";
import { getSessionUserId } from "@/lib/supabase/server";
import { withUserTransaction } from "@/lib/db/pool";

export function monthRef(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

/**
 * Plan-aware monthly grant. Idempotent per workspace+month via the ledger's
 * unique (workspace, reason, ref) key — safe to call on every AI request.
 */
export async function ensureMonthlyCredits(workspaceId: string, plan: PlanCode, trustedActorId?: string): Promise<void> {
  if (isAzureBackend()) {
    const userId = trustedActorId ?? await getSessionUserId();
    if (!userId) throw new Error("Sign in required");
    await withUserTransaction(userId, db => db.query("select platform.grant_monthly_credits($1,$2,$3)", [workspaceId, PLANS[plan].entitlements.aiCreditsMonthly, plan]));
    return;
  }
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
export async function spendCredits(workspaceId: string, amount: number, reason: string, trustedActorId?: string): Promise<boolean> {
  if (isAzureBackend()) {
    const userId=trustedActorId ?? await getSessionUserId();
    if(!userId) return false;
    return withUserTransaction(userId,async db => (await db.query<{ok:boolean}>("select platform.spend_credits($1,$2,$3) as ok",[workspaceId,amount,reason])).rows[0].ok);
  }
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
export async function refundCredits(workspaceId: string, amount: number, ref: string, trustedActorId?: string): Promise<void> {
  if (isAzureBackend()) {
    const userId=trustedActorId ?? await getSessionUserId();
    if(!userId) return;
    await withUserTransaction(userId,db => db.query("select platform.refund_credits($1,$2,$3)",[workspaceId,amount,ref]));
    return;
  }
  const admin = getServiceSupabase();
  if (!admin) return;
  await admin
    .rpc("grant_ai_credits", { p_workspace_id: workspaceId, p_amount: amount, p_reason: "refund", p_ref: ref })
    .then(() => undefined, () => undefined);
}

export { getAiBalance };
