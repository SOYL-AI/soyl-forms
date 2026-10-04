#!/usr/bin/env node
// Mint or revoke workspace API keys for the MCP server (/api/mcp).
//
//   node scripts/mint-mcp-key.mjs <workspace-id> [name]
//   node scripts/mint-mcp-key.mjs <workspace-id> --revoke <key-prefix>
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env or .env.
// The secret is printed ONCE — only its SHA-256 hash is stored (mirrors
// lib/mcp/keys.ts; keep the two in sync).
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PREFIX = "soyl_sk_";

function loadEnv() {
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (process.env[key]) continue;
    try {
      const env = fs.readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
      const m = env.match(new RegExp(`^${key}=(.*)$`, "m"));
      if (m) process.env[key] = m[1].trim().replace(/^["']|["']$/g, "");
    } catch {
      // No .env — env vars must be set already.
    }
  }
}

const [, , workspaceId, arg3, arg4] = process.argv;
if (!workspaceId || !/^[0-9a-f-]{36}$/i.test(workspaceId)) {
  console.error("Usage: node scripts/mint-mcp-key.mjs <workspace-id> [name|--revoke <prefix>]");
  process.exit(1);
}
loadEnv();
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

if (arg3 === "--revoke") {
  if (!arg4) {
    console.error("Usage: node scripts/mint-mcp-key.mjs <workspace-id> --revoke <key-prefix>");
    process.exit(1);
  }
  const { data, error } = await admin
    .from("workspace_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("key_prefix", arg4)
    .is("revoked_at", null)
    .select("id");
  if (error) {
    console.error(`Revoke failed: ${error.message}`);
    process.exit(1);
  }
  console.log(data.length ? `Revoked key ${arg4}.` : `No active key ${arg4} in that workspace.`);
  process.exit(0);
}

const secret = `${PREFIX}${randomBytes(32).toString("hex")}`;
const { error } = await admin.from("workspace_api_keys").insert({
  workspace_id: workspaceId,
  name: arg3 ?? "mcp",
  key_prefix: secret.slice(PREFIX.length, PREFIX.length + 12),
  key_hash: createHash("sha256").update(secret, "utf8").digest("hex"),
});
if (error) {
  console.error(`Mint failed: ${error.message}`);
  process.exit(1);
}
console.log("API key (copy it now — it is never shown again):");
console.log(secret);
