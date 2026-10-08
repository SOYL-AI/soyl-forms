import { getSessionUserId } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isMemberRole, roleAtLeast, type MemberRole } from "@/lib/teams";

export async function hasWorkspaceRole(workspaceId: string, minimum: MemberRole = "viewer") {
  const userId = await getSessionUserId();
  const admin = getServiceSupabase();
  if (!userId || !admin) return false;
  const { data, error } = await admin.from("workspace_members").select("role")
    .eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  return !error && isMemberRole(data?.role) && roleAtLeast(data.role, minimum);
}
