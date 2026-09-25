"use server";

import { getSessionUserId } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getUserWorkspaceId } from "@/lib/workspaces";
import { getWorkspacePlan } from "@/lib/billing/plan";
import { canCreateBrandKit } from "@/lib/plans";
import {
  brandKitInputSchema,
  rowToBrandKit,
  toBrandKitSummary,
  type BrandKit,
  type BrandKitInput,
  type BrandKitRow,
  type BrandKitSummary,
} from "./types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Service-role read for server pages that already authorized the workspace. */
export async function listBrandKitSummaries(workspaceId: string): Promise<BrandKitSummary[]> {
  const admin = getServiceSupabase();
  if (!admin) return [];
  try {
    const { data } = await admin
      .from("brand_kits")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    return ((data ?? []) as BrandKitRow[]).map((r) => toBrandKitSummary(rowToBrandKit(r)));
  } catch {
    return [];
  }
}

export async function listBrandKits(workspaceId: string): Promise<BrandKit[]> {
  const admin = getServiceSupabase();
  if (!admin) return [];
  try {
    const { data } = await admin
      .from("brand_kits")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    return ((data ?? []) as BrandKitRow[]).map(rowToBrandKit);
  } catch {
    return [];
  }
}

export async function getBrandKit(workspaceId: string, kitId: string): Promise<BrandKit | null> {
  const admin = getServiceSupabase();
  if (!admin) return null;
  const { data } = await admin
    .from("brand_kits")
    .select("*")
    .eq("id", kitId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return data ? rowToBrandKit(data as BrandKitRow) : null;
}

async function caller(): Promise<{ userId: string; workspaceId: string } | { error: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { error: "Sign in first." };
  const workspaceId = await getUserWorkspaceId(userId);
  if (!workspaceId) return { error: "No workspace yet." };
  return { userId, workspaceId };
}

/** Create or update a brand kit (owner-authorized, validated, plan-capped). */
export async function saveBrandKit(args: {
  id?: string;
  input: BrandKitInput;
}): Promise<Result<{ id: string }>> {
  const who = await caller();
  if ("error" in who) return { ok: false, error: who.error };
  const parsed = brandKitInputSchema.safeParse(args.input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the brand kit fields." };
  }
  const admin = getServiceSupabase()!;
  const input = parsed.data;

  if (!args.id) {
    const plan = await getWorkspacePlan(who.workspaceId);
    const { count } = await admin
      .from("brand_kits")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", who.workspaceId);
    const gate = canCreateBrandKit({ plan, existing: count ?? 0 });
    if (!gate.ok) return { ok: false, error: gate.reason ?? "Plan limit reached." };
  } else {
    const existing = await getBrandKit(who.workspaceId, args.id);
    if (!existing) return { ok: false, error: "Brand kit not found." };
  }

  const makeDefault = input.isDefault ?? !args.id;
  if (makeDefault) {
    await admin.from("brand_kits").update({ is_default: false }).eq("workspace_id", who.workspaceId);
  }
  const row = {
    workspace_id: who.workspaceId,
    name: input.name,
    is_default: makeDefault,
    logo_url: input.logoUrl ?? null,
    logo_file_id: input.logoFileId ?? null,
    colors: input.colors,
    fonts: input.fonts,
    voice: input.voice,
    style: input.style,
    summary: input.summary,
    sources: input.sources,
    updated_at: new Date().toISOString(),
  };
  if (args.id) {
    const { error } = await admin.from("brand_kits").update(row).eq("id", args.id).eq("workspace_id", who.workspaceId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: args.id };
  }
  const { data, error } = await admin
    .from("brand_kits")
    .insert({ ...row, created_by: who.userId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save brand kit." };
  return { ok: true, id: (data as { id: string }).id };
}

export async function deleteBrandKit(args: { id: string }): Promise<Result> {
  const who = await caller();
  if ("error" in who) return { ok: false, error: who.error };
  const admin = getServiceSupabase()!;
  const { error } = await admin.from("brand_kits").delete().eq("id", args.id).eq("workspace_id", who.workspaceId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function setDefaultBrandKit(args: { id: string }): Promise<Result> {
  const who = await caller();
  if ("error" in who) return { ok: false, error: who.error };
  const admin = getServiceSupabase()!;
  const kit = await getBrandKit(who.workspaceId, args.id);
  if (!kit) return { ok: false, error: "Brand kit not found." };
  await admin.from("brand_kits").update({ is_default: false }).eq("workspace_id", who.workspaceId);
  const { error } = await admin.from("brand_kits").update({ is_default: true }).eq("id", args.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
