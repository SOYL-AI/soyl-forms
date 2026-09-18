import { getServiceSupabase } from "./supabase/admin";
import { getSessionUserId } from "./supabase/server";
import type { PlanCode } from "./plans";

export type AdminRole = "super_admin" | "support_admin";

function bootstrapEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Server-side admin lookup. Never trust client claims. */
export async function getAdminRole(
  userId: string,
  email?: string | null,
): Promise<AdminRole | null> {
  if (email && bootstrapEmails().includes(email.toLowerCase())) {
    return "super_admin";
  }
  const admin = getServiceSupabase();
  if (!admin) return null;
  const { data } = await admin
    .from("admin_users")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  const role = (data as { role: string } | null)?.role;
  return role === "super_admin" || role === "support_admin" ? role : null;
}

export async function requireAdmin(): Promise<
  | { ok: true; userId: string; role: AdminRole }
  | { ok: false; reason: "signed-out" | "forbidden" }
> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, reason: "signed-out" };
  const admin = getServiceSupabase();
  let email: string | null = null;
  if (admin) {
    const { data } = await admin.auth.admin.getUserById(userId);
    email = data?.user?.email ?? null;
  }
  const role = await getAdminRole(userId, email);
  if (!role) return { ok: false, reason: "forbidden" };
  return { ok: true, userId, role };
}

export async function auditLog(args: {
  actorUserId?: string | null;
  actorType?: string;
  workspaceId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const admin = getServiceSupabase();
  if (!admin) return;
  await admin.from("audit_logs").insert({
    actor_user_id: args.actorUserId ?? null,
    actor_type: args.actorType ?? "admin",
    workspace_id: args.workspaceId ?? null,
    action: args.action,
    target_type: args.targetType,
    target_id: args.targetId ?? null,
    metadata: args.metadata ?? {},
  });
}

/**
 * Manual entitlement overrides demand an explicit reason AND an expiry.
 * Pure validation so it can be pinned by tests.
 */
export function validateOverride(args: {
  plan: string;
  reason: string;
  expiresAt: string;
}): { ok: true } | { ok: false; error: string } {
  const valid: PlanCode[] = ["free", "starter", "pro"];
  if (!valid.includes(args.plan as PlanCode)) {
    return { ok: false, error: "Pick a valid plan." };
  }
  if (!args.reason || args.reason.trim().length < 5) {
    return { ok: false, error: "An explicit reason (5+ characters) is required." };
  }
  const exp = new Date(args.expiresAt).getTime();
  if (!args.expiresAt || Number.isNaN(exp) || exp <= Date.now()) {
    return { ok: false, error: "A future expiry is required." };
  }
  return { ok: true };
}
