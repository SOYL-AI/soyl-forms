import { getServiceSupabase } from "@/lib/supabase/admin";
import { PLANS, type PlanCode } from "@/lib/plans";
import { resolveEffectivePlan, type StoredSubscription } from "./subscriptions";
import { isAzureBackend } from "@/lib/backend";
import { getSessionUserId } from "@/lib/supabase/server";
import { readWorkspacePlan } from "@/lib/db/repositories/workspaces";
import { getDatabasePool } from "@/lib/db/pool";

/**
 * The ONE way to learn a workspace's effective plan on the server.
 * Resolves override → entitled subscription → free, so a subscription that
 * was merely `created` at checkout (never paid) grants nothing.
 */
export async function getWorkspacePlan(workspaceId: string, trustedActorId?: string): Promise<PlanCode> {
  if (isAzureBackend()) {
    const userId = trustedActorId ?? await getSessionUserId();
    if (!userId) throw new Error("Sign in required");
    return readWorkspacePlan(userId, workspaceId);
  }
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

/** Public routes obtain only the entitlement code of an available published form. */
export async function getPublicFormPlan(form: { id: string; workspaceId: string }): Promise<PlanCode> {
  if (!isAzureBackend()) return getWorkspacePlan(form.workspaceId);
  const plan = (await getDatabasePool().query<{ plan: string | null }>("select platform.public_form_plan($1) as plan", [form.id])).rows[0]?.plan;
  if (plan !== "free" && plan !== "starter" && plan !== "pro") throw new Error("Form entitlements unavailable");
  return plan;
}
