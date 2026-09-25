import { getServiceSupabase } from "@/lib/supabase/admin";
import { PLANS, type PlanCode } from "@/lib/plans";
import { resolveEffectivePlan, type StoredSubscription } from "./subscriptions";

/**
 * The ONE way to learn a workspace's effective plan on the server.
 * Resolves override → entitled subscription → free, so a subscription that
 * was merely `created` at checkout (never paid) grants nothing.
 */
export async function getWorkspacePlan(workspaceId: string): Promise<PlanCode> {
  const admin = getServiceSupabase();
  if (!admin) return "free";
  const { data } = await admin
    .from("subscriptions")
    .select("plan_code, status, override_reason, override_expires_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return resolveEffectivePlan((data as StoredSubscription | null) ?? null).plan;
}

export async function getWorkspaceEntitlements(workspaceId: string) {
  const plan = await getWorkspacePlan(workspaceId);
  return { plan, entitlements: PLANS[plan].entitlements };
}
