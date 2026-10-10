import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Read-only preservation export. This is not pg_dump or an atomic snapshot.
// Two identical passes detect source changes; freeze writes and repeat at cutover.
const source = process.env.NEXT_PUBLIC_SUPABASE_URL;
const credential = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!source || !credential) throw new Error("Existing source server configuration is required");
const client = createClient(source, credential, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }) },
});
const migrationDirectory = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const tables = new Set();
for (const file of (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql"))) {
  const sql = await readFile(`${migrationDirectory}/${file}`, "utf8");
  for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_]+)/gi)) tables.add(match[1]);
}
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};
const digest = (value) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const ordering = { plans: "code", platform_settings: "key", workspace_members: "workspace_id,user_id", usage_monthly: "workspace_id,month", subscriptions: "workspace_id", ai_credits: "workspace_id", workspace_payment_providers: "workspace_id", admin_users: "user_id", razorpay_webhook_events: "event_id", public_rate_limits: "key", email_reservations: "key" };
async function exportPass() {
  const result = {};
  for (const table of [...tables].sort()) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      let query = client.from(table).select("*").range(offset, offset + 499);
      for (const column of (ordering[table] ?? "id").split(",")) query = query.order(column);
      const { data, error } = await query;
      if (error) throw new Error(`Read-only export failed for ${table} (${error.code || "unknown"})`);
      rows.push(...data);
      if (data.length < 500) break;
    }
    result[table] = rows;
  }
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw new Error("Source account export failed");
    // Preserve metadata and IDs, never passwords or reusable tokens.
    users.push(...data.users.map(({ id, email, email_confirmed_at, phone, created_at, updated_at, banned_until, user_metadata, app_metadata, identities }) =>
      ({ id, email, email_confirmed_at, phone, created_at, updated_at, banned_until, user_metadata, app_metadata, identities })));
    if (data.users.length < 500) break;
  }
  result.source_users = users.sort((a, b) => a.id.localeCompare(b.id));
  return result;
}
try {
  const first = await exportPass();
  const second = await exportPass();
  if (digest(first) !== digest(second)) throw new Error("Source changed during export; freeze writes and repeat");
  const directory = fileURLToPath(new URL(`../../.azure-migration/source-export-${new Date().toISOString().replace(/[:.]/g, "-")}/`, import.meta.url));
  await mkdir(directory, { recursive: true });
  const manifest = { generatedAt: new Date().toISOString(), atomicSnapshot: false, stableDoubleRead: true, source: new URL(source).hostname, tables: {} };
  for (const [name, rows] of Object.entries(first)) {
    await writeFile(`${directory}/${name}.json`, JSON.stringify(canonical(rows), null, 2), { mode: 0o600 });
    manifest.tables[name] = { rows: rows.length, sha256: digest(rows) };
  }
  await writeFile(`${directory}/manifest.json`, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ event: "source_export_saved", directory, tables: Object.keys(first).length, rows: Object.values(first).reduce((n, rows) => n + rows.length, 0), atomicSnapshot: false, stableDoubleRead: true }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Read-only source export failed");
  process.exitCode = 1;
}
