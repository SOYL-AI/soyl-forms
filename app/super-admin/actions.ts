"use server";

import { auditLog, requireAdmin, validateOverride } from "@/lib/admin";
import { getServiceSupabase } from "@/lib/supabase/admin";

export type AdminResult = { ok: true } | { ok: false; error: string };

type ServiceClient = NonNullable<ReturnType<typeof getServiceSupabase>>;

async function adminOnly(): Promise<
  { admin: ServiceClient; userId: string } | { error: string }
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: "Not an operator account." };
  const admin = getServiceSupabase();
  if (!admin) return { error: "Server misconfigured." };
  return { admin, userId: gate.userId };
}

export async function setWorkspaceStatus(args: {
  workspaceId: string;
  status: "active" | "suspended";
}): Promise<AdminResult> {
  const g = await adminOnly();
  if ("error" in g) return { ok: false, error: g.error };
  const { error } = await g.admin
    .from("workspaces")
    .update({ status: args.status })
    .eq("id", args.workspaceId);
  if (error) return { ok: false, error: error.message };
  await auditLog({
    actorUserId: g.userId,
    action: `workspace.${args.status === "suspended" ? "suspend" : "reactivate"}`,
    targetType: "workspace",
    targetId: args.workspaceId,
    workspaceId: args.workspaceId,
  });
  return { ok: true };
}

export async function setFormStatus(args: {
  formId: string;
  suspend: boolean;
}): Promise<AdminResult> {
  const g = await adminOnly();
  if ("error" in g) return { ok: false, error: g.error };
  const { data: form } = await g.admin
    .from("forms")
    .select("id, workspace_id, published_version_id")
    .eq("id", args.formId)
    .single();
  const row = form as { id: string; workspace_id: string; published_version_id: string | null } | null;
  if (!row) return { ok: false, error: "Form not found." };
  const status = args.suspend ? "closed" : row.published_version_id ? "published" : "draft";
  const { error } = await g.admin.from("forms").update({ status }).eq("id", args.formId);
  if (error) return { ok: false, error: error.message };
  await auditLog({
    actorUserId: g.userId,
    action: `form.${args.suspend ? "suspend" : "reactivate"}`,
    targetType: "form",
    targetId: args.formId,
    workspaceId: row.workspace_id,
  });
  return { ok: true };
}

export async function setPlanOverride(args: {
  workspaceId: string;
  plan: string;
  reason: string;
  expiresAt: string;
}): Promise<AdminResult> {
  const g = await adminOnly();
  if ("error" in g) return { ok: false, error: g.error };
  const valid = validateOverride(args);
  if (!valid.ok) return valid;
  const { error } = await g.admin.from("subscriptions").upsert(
    {
      workspace_id: args.workspaceId,
      plan_code: args.plan,
      override_reason: args.reason.trim(),
      override_expires_at: new Date(args.expiresAt).toISOString(),
    },
    { onConflict: "workspace_id" },
  );
  if (error) return { ok: false, error: error.message };
  await auditLog({
    actorUserId: g.userId,
    action: "billing.override",
    targetType: "workspace",
    targetId: args.workspaceId,
    workspaceId: args.workspaceId,
    metadata: { plan: args.plan, reason: args.reason.trim(), expiresAt: args.expiresAt },
  });
  return { ok: true };
}

export async function clearPlanOverride(args: {
  workspaceId: string;
}): Promise<AdminResult> {
  const g = await adminOnly();
  if ("error" in g) return { ok: false, error: g.error };
  const { error } = await g.admin
    .from("subscriptions")
    .update({ override_reason: null, override_expires_at: null })
    .eq("workspace_id", args.workspaceId);
  if (error) return { ok: false, error: error.message };
  await auditLog({
    actorUserId: g.userId,
    action: "billing.override.clear",
    targetType: "workspace",
    targetId: args.workspaceId,
    workspaceId: args.workspaceId,
  });
  return { ok: true };
}
