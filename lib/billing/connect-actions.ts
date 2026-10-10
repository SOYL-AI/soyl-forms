"use server";

import { createRazorpay } from "./razorpay";
import { getSessionUserId } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { encryptSecret, isSecretEncryptionConfigured } from "@/lib/security/secrets";
import { auditLog } from "@/lib/admin";
import { getMyRole } from "@/lib/team-actions";
import { isValidKeyId, isValidKeySecret, keyMode } from "./connect";
import { isAzureBackend } from "@/lib/backend";
import { providerStatus,saveProvider } from "@/lib/db/repositories/payments";
import { databaseResult } from "@/lib/db/result";

export type ProviderActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface ProviderStatus {
  connected: boolean;
  keyId: string | null;
  mode: "test" | "live" | null;
  updatedAt: string | null;
}

/** Connection status for the UI (secret never included). */
export async function getProviderStatus(workspaceId: string): Promise<ProviderActionResult<ProviderStatus>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const role = await getMyRole(workspaceId, userId);
  if (role !== "owner" && role !== "admin") return { ok: false, error: "Only owners and admins manage payments." };
  const admin = getServiceSupabase();
  if (!isAzureBackend() && !admin) return { ok: false, error: "Service temporarily unavailable. Please try again." };
  const { data } = isAzureBackend() ? await databaseResult(providerStatus(userId,workspaceId)) : await admin!
    .from("workspace_payment_providers")
    .select("key_id, mode, updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const row = data as { key_id: string; mode: string; updated_at: string } | null;
  if (!row) return { ok: true, connected: false, keyId: null, mode: null, updatedAt: null };
  return {
    ok: true,
    connected: true,
    keyId: row.key_id,
    mode: row.mode === "live" ? "live" : "test",
    updatedAt: row.updated_at,
  };
}

/**
 * Connect the workspace's own Razorpay keys. Validates formats, detects
 * test/live, and proves the keys with a harmless API call before storing
 * the secret encrypted. Re-connecting replaces the pair.
 */
export async function connectProvider(args: {
  workspaceId: string;
  keyId: string;
  keySecret: string;
}): Promise<ProviderActionResult<{ mode: "test" | "live" }>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const role = await getMyRole(args.workspaceId, userId);
  if (role !== "owner" && role !== "admin") return { ok: false, error: "Only owners and admins manage payments." };
  if (!isSecretEncryptionConfigured()) {
    return { ok: false, error: "Payment storage isn't configured on this server yet." };
  }
  const keyId = args.keyId.trim();
  if (!isValidKeyId(keyId)) return { ok: false, error: "That key ID doesn't look right." };
  if (!isValidKeySecret(args.keySecret)) return { ok: false, error: "That key secret doesn't look right." };
  const mode = keyMode(keyId);
  if (!mode) return { ok: false, error: "Key IDs start with rzp_test_ or rzp_live_." };

  // Prove the pair with a read-only call before storing anything.
  try {
    const probe = createRazorpay(keyId,args.keySecret);
    await probe.orders.all({ count: 1 });
  } catch {
    return { ok: false, error: "Razorpay rejected these keys. Check them and try again." };
  }

  const admin = getServiceSupabase();
  if (!isAzureBackend() && !admin) return { ok: false, error: "Service temporarily unavailable. Please try again." };
  let encrypted: string;
  try {
    encrypted = encryptSecret(args.keySecret);
  } catch {
    return { ok: false, error: "Couldn't store the keys securely." };
  }
  const { error } = isAzureBackend() ? await databaseResult(saveProvider(userId,args.workspaceId,keyId,encrypted,mode)) : await admin!.from("workspace_payment_providers").upsert(
    {
      workspace_id: args.workspaceId,
      provider: "razorpay",
      key_id: keyId,
      secret_encrypted: encrypted,
      mode,
      status: "active",
      connected_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id" },
  );
  if (error) return { ok: false, error: "Couldn't save the connection." };
  if(!isAzureBackend()) await auditLog({
    actorUserId: userId,
    actorType: "user",
    workspaceId: args.workspaceId,
    action: "payments.provider.connected",
    targetType: "workspace",
    targetId: args.workspaceId,
    metadata: { mode },
  });
  return { ok: true, mode };
}

export async function disconnectProvider(args: { workspaceId: string }): Promise<ProviderActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const role = await getMyRole(args.workspaceId, userId);
  if (role !== "owner" && role !== "admin") return { ok: false, error: "Only owners and admins manage payments." };
  const admin = getServiceSupabase();
  if (!isAzureBackend() && !admin) return { ok: false, error: "Service temporarily unavailable. Please try again." };
  const { error } = isAzureBackend() ? await databaseResult(saveProvider(userId,args.workspaceId,null,null,null)) : await admin!.from("workspace_payment_providers").delete().eq("workspace_id", args.workspaceId);
  if (error) return { ok: false, error: "Couldn't disconnect." };
  if(!isAzureBackend()) await auditLog({
    actorUserId: userId,
    actorType: "user",
    workspaceId: args.workspaceId,
    action: "payments.provider.disconnected",
    targetType: "workspace",
    targetId: args.workspaceId,
  });
  return { ok: true };
}
