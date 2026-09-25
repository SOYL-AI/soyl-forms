import { getServerSupabase, getSessionUserId } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { ensurePersonalWorkspace, getUserWorkspaceId } from "@/lib/workspaces";
import { getWorkspacePlan } from "@/lib/billing/plan";
import { getAdminRole } from "@/lib/admin";
import { getPlatformFlags, type PlatformFlags } from "@/lib/platform";
import { PLANS, type Entitlements, type PlanCode } from "@/lib/plans";

export interface AppContext {
  userId: string;
  email: string | null;
  displayName: string | null;
  workspaceId: string;
  workspaceName: string;
  plan: PlanCode;
  entitlements: Entitlements;
  flags: PlatformFlags;
  isAdmin: boolean;
}

export type AppContextResult =
  | { ok: true; ctx: AppContext }
  | { ok: false; reason: "signed-out" | "registrations-paused" | "error"; message?: string };

/**
 * Everything a signed-in page needs, resolved once: identity, workspace,
 * effective plan, operator flags. Provisions the personal workspace on
 * first visit unless registrations are paused.
 */
export async function getAppContext(): Promise<AppContextResult> {
  const supabase = getServerSupabase();
  if (!supabase) return { ok: false, reason: "error", message: "Supabase is not configured." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "signed-out" };

  const flags = await getPlatformFlags();
  let workspaceId = await getUserWorkspaceId(user.id);
  if (!workspaceId) {
    if (!flags.registrationsEnabled) return { ok: false, reason: "registrations-paused" };
    try {
      ({ workspaceId } = await ensurePersonalWorkspace(user.id, user.email ?? null));
    } catch (e) {
      return { ok: false, reason: "error", message: (e as Error).message };
    }
  }

  const admin = getServiceSupabase()!;
  const [{ data: ws }, { data: profile }, plan, role] = await Promise.all([
    admin.from("workspaces").select("name, status").eq("id", workspaceId).maybeSingle(),
    admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    getWorkspacePlan(workspaceId),
    getAdminRole(user.id, user.email ?? null),
  ]);

  return {
    ok: true,
    ctx: {
      userId: user.id,
      email: user.email ?? null,
      displayName: (profile as { display_name: string | null } | null)?.display_name ?? null,
      workspaceId,
      workspaceName: (ws as { name: string } | null)?.name ?? "Your workspace",
      plan,
      entitlements: PLANS[plan].entitlements,
      flags,
      isAdmin: role !== null,
    },
  };
}

/** Convenience for pages that only need the user id (kept for old callers). */
export { getSessionUserId };
