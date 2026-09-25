"use server";

import { redirect } from "next/navigation";
import { getServerSupabase, getSessionUserId } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function signOut(): Promise<void> {
  const supabase = getServerSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}

export async function updateProfile(args: {
  displayName: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const name = args.displayName.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Enter a name." };
  const admin = getServiceSupabase();
  if (!admin) return { ok: false, error: "Server misconfigured." };
  const { error } = await admin
    .from("profiles")
    .upsert({ id: userId, display_name: name, updated_at: new Date().toISOString() }, { onConflict: "id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function renameWorkspace(args: {
  workspaceId: string;
  name: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const name = args.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Enter a workspace name." };
  const admin = getServiceSupabase();
  if (!admin) return { ok: false, error: "Server misconfigured." };
  const { data: member } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", args.workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = (member as { role: string } | null)?.role;
  if (role !== "owner" && role !== "admin") return { ok: false, error: "Only owners can rename the workspace." };
  const { error } = await admin.from("workspaces").update({ name }).eq("id", args.workspaceId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
