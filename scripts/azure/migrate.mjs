import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const directory = fileURLToPath(new URL("../../azure/migrations/", import.meta.url));
const raw = process.env.DATABASE_MIGRATION_URL;
if (!raw) throw new Error("DATABASE_MIGRATION_URL is required. Runtime credentials must not own the schema.");
let url;
try { url = new URL(raw); } catch { throw new Error("DATABASE_MIGRATION_URL is not a valid PostgreSQL URL"); }
if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_MIGRATION_URL must use PostgreSQL");
const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "ssl", "uselibpqcompat"]) url.searchParams.delete(key);
const client = new pg.Client({ connectionString: url.href, ssl: local ? false : { rejectUnauthorized: true }, connectionTimeoutMillis: 5000 });
let locked = false;
try {
  await client.connect();
  await client.query("set lock_timeout = '10s'");
  await client.query("set statement_timeout = '60s'");
  await client.query("select pg_advisory_lock(1936681068, 1)");
  locked = true;
  await client.query("create schema if not exists platform_migrations");
  await client.query(`create table if not exists platform_migrations.history (
    name text primary key, checksum text not null, applied_at timestamptz not null default clock_timestamp()
  )`);
  const files = (await readdir(directory)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const history = (await client.query("select name,checksum from platform_migrations.history order by name")).rows;
  for (const row of history) {
    if (!files.includes(row.name)) throw new Error(`Applied migration missing from source: ${row.name}`);
  }
  for (const name of files) {
    const sql = await readFile(`${directory}/${name}`, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prior = history.find((row) => row.name === name);
    if (prior) {
      if (prior.checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    if (history.some((row) => row.name > name)) throw new Error(`Refusing out-of-order migration: ${name}`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into platform_migrations.history(name,checksum) values($1,$2)", [name, checksum]);
      await client.query("commit");
      console.log(`Applied ${name}`);
    } catch (error) { await client.query("rollback"); throw error; }
  }
  console.log(`Azure migration history verified (${files.length} files).`);
} catch (error) {
  // Keep database URLs, SQL and provider details out of build logs.
  console.error(`Azure migration failed${error instanceof Error && /^(Applied migration|Refusing out-of-order)/.test(error.message) ? `: ${error.message}` : ". Check database access and migration SQL locally."}`);
  process.exitCode = 1;
} finally {
  if (locked) await client.query("select pg_advisory_unlock(1936681068, 1)").catch(() => {});
  await client.end().catch(() => {});
}
