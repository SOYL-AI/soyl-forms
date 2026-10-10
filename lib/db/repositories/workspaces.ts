import { withUserTransaction } from "@/lib/db/pool";
import { AI_WELCOME_CREDITS } from "@/lib/plans";
import { resolveEffectivePlan, type StoredSubscription } from "@/lib/billing/subscriptions";

export async function ensureWorkspace(userId: string): Promise<{ workspaceId: string; created: boolean }> {
  return withUserTransaction(userId, async (db) => {
    const row = (await db.query<{ workspace_id: string; created: boolean }>("select * from platform.ensure_personal_workspace($1)", [AI_WELCOME_CREDITS])).rows[0];
    if (!row) throw new Error("Workspace setup could not be completed");
    return { workspaceId: row.workspace_id, created: row.created };
  });
}
export async function findWorkspaceId(userId: string): Promise<string | null> {
  return withUserTransaction(userId, async (db) => (await db.query<{ workspace_id: string }>(
    "select m.workspace_id from workspace_members m join workspaces w on w.id=m.workspace_id where m.user_id=$1 order by m.created_at,m.workspace_id limit 1", [userId])).rows[0]?.workspace_id ?? null);
}
export async function readWorkspace(userId: string, workspaceId: string) {
  return withUserTransaction(userId, async (db) => (await db.query<{ id: string; name: string; status: string; display_name: string | null }>(
    "select w.id,w.name,w.status,p.display_name from workspaces w left join profiles p on p.id=$1 where w.id=$2", [userId, workspaceId])).rows[0] ?? null);
}
export async function readWorkspacePlan(userId: string, workspaceId: string) {
  return withUserTransaction(userId, async (db) => {
    const row = (await db.query<StoredSubscription>(
      "select plan_code,status,override_plan_code,override_reason,override_expires_at::text from subscriptions where workspace_id=$1", [workspaceId])).rows[0] ?? null;
    if (!row) throw new Error("Workspace subscription is unavailable");
    return resolveEffectivePlan(row).plan;
  });
}
export async function readCreditBalance(userId: string, workspaceId: string): Promise<number> {
  return withUserTransaction(userId, async (db) => Number((await db.query<{ balance: string }>("select balance from ai_credits where workspace_id=$1", [workspaceId])).rows[0]?.balance ?? 0));
}
export async function readWorkspaceRole(userId: string, workspaceId: string): Promise<string | null> {
  return withUserTransaction(userId, async db => (await db.query<{ role: string | null }>("select platform.workspace_role($1) as role", [workspaceId])).rows[0]?.role ?? null);
}
export async function renameWorkspace(userId: string, workspaceId: string, name: string): Promise<boolean> {
  return withUserTransaction(userId, async (db) => (await db.query("update workspaces set name=$1,updated_at=clock_timestamp() where id=$2 returning id", [name, workspaceId])).rowCount === 1);
}
export async function updateProfile(userId: string, name: string): Promise<boolean> {
  return withUserTransaction(userId, async (db) => (await db.query("update profiles set display_name=$1,updated_at=clock_timestamp() where id=$2 returning id", [name, userId])).rowCount === 1);
}
