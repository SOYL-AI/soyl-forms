import { getServiceSupabase } from "./supabase/admin";
import { AI_WELCOME_CREDITS } from "./plans";

/**
 * Resolve the caller's personal workspace, creating it exactly once.
 * Idempotent under concurrency: the workspace slug is derived from the user
 * id (`u-<uuid>`), so a second concurrent call conflicts on the unique slug
 * and falls through to the same row, then upserts the same membership.
 */
export async function ensurePersonalWorkspace(
  userId: string,
  email?: string | null,
): Promise<{ workspaceId: string; created: boolean }> {
  const admin = getServiceSupabase();
  if (!admin) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const { data: existing } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const row = existing as { workspace_id: string } | null;
  if (row) return { workspaceId: row.workspace_id, created: false };

  const slug = `u-${userId}`;
  const name =
    email && email.includes("@")
      ? `${email.split("@")[0]}'s workspace`
      : "Personal workspace";

  const { data: ws, error: wsError } = await admin
    .from("workspaces")
    .upsert(
      { slug, name, owner_user_id: userId, status: "active" },
      { onConflict: "slug" },
    )
    .select("id")
    .single();

  if (wsError || !ws) {
    throw new Error(`Could not provision workspace: ${wsError?.message}`);
  }
  const workspaceId = (ws as { id: string }).id;

  const { error: memberError } = await admin.from("workspace_members").upsert(
    { workspace_id: workspaceId, user_id: userId, role: "owner" },
    { onConflict: "workspace_id,user_id" },
  );
  if (memberError) {
    throw new Error(`Could not provision membership: ${memberError.message}`);
  }

  const displayName =
    email && email.includes("@") ? email.split("@")[0] : null;
  const { error: profileError } = await admin.from("profiles").upsert(
    { id: userId, display_name: displayName },
    { onConflict: "id" },
  );
  if (profileError) {
    throw new Error(`Could not provision profile: ${profileError.message}`);
  }

  const { error: subError } = await admin.from("subscriptions").upsert(
    { workspace_id: workspaceId, plan_code: "free", status: "free" },
    { onConflict: "workspace_id" },
  );
  if (subError) {
    throw new Error(`Could not provision subscription: ${subError.message}`);
  }

  // Welcome AI credits (idempotent via the ledger's unique grant key).
  // Best-effort: workspaces must provision even before migration 0006 lands.
  try {
    await admin.rpc("grant_ai_credits", {
      p_workspace_id: workspaceId,
      p_amount: AI_WELCOME_CREDITS,
      p_reason: "welcome",
      p_ref: "signup",
    });
  } catch {
    // Credits activate once 0006_ai_credits.sql has been applied.
  }

  return { workspaceId, created: true };
}

/** First workspace id for a user (service-role read for server flows). */
export async function getUserWorkspaceId(userId: string): Promise<string | null> {
  const admin = getServiceSupabase();
  if (!admin) return null;
  const { data } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return ((data as { workspace_id: string } | null)?.workspace_id ?? null) as
    | string
    | null;
}

/** Current AI credit balance (0 when the ledger is unreachable). */
export async function getAiBalance(workspaceId: string): Promise<number> {
  const admin = getServiceSupabase();
  if (!admin) return 0;
  const { data } = await admin
    .from("ai_credits")
    .select("balance")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return ((data as { balance: number } | null)?.balance ?? 0) as number;
}
