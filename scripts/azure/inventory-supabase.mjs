import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Existing Supabase server configuration is required for read-only inventory.");
const directory = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const names = new Set();
for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql"))) {
  const sql = readFileSync(`${directory}/${file}`, "utf8");
  for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_]+)/gi)) names.add(match[1]);
}
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) },
});
const tables = {};
const queue = [...names].sort();
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const name = queue.shift();
    let { count, error } = await client.from(name).select("*", { count: "exact", head: true });
    if (error) {
      const fallback = await client.from(name).select("*", { count: "exact" }).limit(0);
      count = fallback.count;
      error = fallback.error;
    }
    tables[name] = error ? { available: false, code: error.code ?? "unknown" } : { available: true, rows: count };
  }
}));
const users = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
const report = {
  generatedAt: new Date().toISOString(), mode: "read-only-counts",
  consistentSnapshot: false,
  authUsers: users.error ? { available: false } : { available: true, count: users.data.total ?? null },
  tables: Object.fromEntries(Object.entries(tables).sort(([a], [b]) => a.localeCompare(b))),
};
const output = fileURLToPath(new URL("../../.azure-migration/", import.meta.url));
mkdirSync(output, { recursive: true });
writeFileSync(`${output}/supabase-inventory.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (Object.values(tables).some((table) => !table.available)) process.exitCode = 1;
