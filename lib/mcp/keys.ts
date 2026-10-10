import { createHash, randomBytes } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/admin";

import { isAzureBackend } from "@/lib/backend";
import { getDatabasePool } from "@/lib/db/pool";

export const MCP_KEY_PREFIX = "soyl_sk_";
const SECRET_BYTES = 32;

/** `soyl_sk_<64 hex chars>`. */
export function newMcpKey(): string {
  return `${MCP_KEY_PREFIX}${randomBytes(SECRET_BYTES).toString("hex")}`;
}

export function hashMcpKey(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** First 12 chars after the prefix — enough to identify, useless to replay. */
export function keyPrefix(secret: string): string {
  return secret.slice(MCP_KEY_PREFIX.length, MCP_KEY_PREFIX.length + 12);
}

/** Pull the Bearer secret from an Authorization header, or null. */
export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ", 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  if (!token.startsWith(MCP_KEY_PREFIX)) return null;
  return token;
}

export interface VerifiedKey {
  workspaceId: string;
  keyId: string;
  userId?: string;
  prefix: string;
}

/**
 * Verify a presented secret against stored hashes. Fails closed on any
 * DB/config problem. Touches last_used_at on success (best-effort).
 */
export async function verifyMcpKey(secret: string): Promise<VerifiedKey | null> {
  if (isAzureBackend()) {
    try {
      const row = (await getDatabasePool().query<{workspace_id:string;key_id:string;key_prefix:string;user_id:string}>(
        "select * from platform.verify_api_key($1)", [hashMcpKey(secret)])).rows[0];
      return row ? {workspaceId:row.workspace_id,keyId:row.key_id,prefix:row.key_prefix,userId:row.user_id} : null;
    } catch { return null; }
  }
  const admin = getServiceSupabase();
  if (!admin) return null;
  const { data } = await admin
    .from("workspace_api_keys")
    .select("id, workspace_id, key_prefix, revoked_at")
    .eq("key_hash", hashMcpKey(secret))
    .maybeSingle();
  const row = data as {
    id: string;
    workspace_id: string;
    key_prefix: string;
    revoked_at: string | null;
  } | null;
  if (!row || row.revoked_at) return null;
  void admin
    .from("workspace_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("workspace_id", row.workspace_id)
    .then(
      () => undefined,
      () => undefined,
    );
  return { workspaceId: row.workspace_id, keyId: row.id, prefix: row.key_prefix };
}
