import { getSessionUserId } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isAzureBackend } from "@/lib/backend";
import { withUserTransaction } from "@/lib/db/pool";
import { isMemberRole, roleAtLeast, type MemberRole } from "@/lib/teams";

export async function hasWorkspaceRole(workspaceId: string, minimum: MemberRole = "viewer") {
  const userId = await getSessionUserId();
  if (isAzureBackend()) return userId ? withUserTransaction(userId, async db => (await db.query<{ allowed: boolean }>("select platform.can_access($1,$2) as allowed", [workspaceId, minimum])).rows[0].allowed) : false;
  const admin = getServiceSupabase();
  if (!userId || !admin) return false;
  const { data, error } = await admin.from("workspace_members").select("role")
    .eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  return !error && isMemberRole(data?.role) && roleAtLeast(data.role, minimum);
}
