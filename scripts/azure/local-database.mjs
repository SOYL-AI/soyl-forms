import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import pg from "pg";

const envPath = new URL("../../.env.azure.local", import.meta.url);
const existing = readFileSync(envPath, "utf8");
if (/^DATABASE_(?:URL|MIGRATION_URL)=/m.test(existing)) throw new Error("Local database credentials already exist; refusing to overwrite.");
const password = randomBytes(32).toString("hex");
const runtimePassword = randomBytes(32).toString("hex");
const container = "soyl-forms-auth-postgres";
const result = spawnSync("docker", ["run", "--detach", "--name", container,
  "--publish", "127.0.0.1:55433:5432", "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_DB=soyl_forms",
  "--mount", "type=volume,source=soyl-forms-auth-postgres-data,target=/var/lib/postgresql/data", "postgres:17-alpine"],
{ encoding: "utf8", env: { ...process.env, POSTGRES_PASSWORD: password }, timeout: 180_000 });
if (result.status !== 0) {
  console.error("Could not create isolated PostgreSQL container. Check Docker and whether the container already exists; existing data is never removed automatically.");
  process.exit(1);
}
const migrationUrl = `postgresql://postgres:${password}@localhost:55433/soyl_forms`;
appendFileSync(envPath, `\nDATABASE_MIGRATION_URL=${migrationUrl}\nDATABASE_URL=postgresql://soyl_runtime:${runtimePassword}@localhost:55433/soyl_forms\n`);
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  const client = new pg.Client({ connectionString: migrationUrl, connectionTimeoutMillis: 1000 });
  try {
    await client.connect();
    const query = await client.query("select format('create role soyl_runtime login password %L nosuperuser nocreatedb nocreaterole nobypassrls', $1::text) as sql", [runtimePassword]);
    await client.query(query.rows[0].sql);
    ready = true;
    break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } finally { await client.end().catch(() => {}); }
}
if (!ready) throw new Error("PostgreSQL did not become ready. Credentials were saved locally; inspect the isolated container.");
console.log("Isolated PostgreSQL 17 ready on localhost:55433; separate owner/runtime credentials saved locally.");
