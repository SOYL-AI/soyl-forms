import pg from "pg";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// One-shot migration job. Runtime never receives the owner URL or role-management password.
let url;
try { url = new URL(process.env.DATABASE_MIGRATION_URL ?? ""); } catch { throw new Error("Migration database URL is invalid"); }
for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "ssl", "uselibpqcompat"]) url.searchParams.delete(key);
const runtimePassword = process.env.DATABASE_RUNTIME_PASSWORD;
if (!runtimePassword || runtimePassword.length < 32) throw new Error("Database runtime password is missing or too short");
const client = new pg.Client({ connectionString: url.href, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 5000 });
let stage = "connect";
try {
  await client.connect();
  stage = "runtime-role";
  await client.query("select pg_advisory_lock(hashtextextended('soyl-forms:bootstrap', 0))");
  const existing = await client.query("select rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolcanlogin from pg_roles where rolname='soyl_runtime'");
  const role = existing.rows[0];
  if (role && (role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.rolbypassrls || !role.rolcanlogin)) {
    throw new Error("Existing runtime role has unexpected privileges or cannot log in");
  }
  // Azure's administrator is not a PostgreSQL superuser. Reasserting protected
  // attributes with ALTER ROLE fails even when they are already false. Validate
  // those attributes above and alter only the credential on subsequent runs.
  const operation = role
    ? "alter role soyl_runtime password %L"
    : "create role soyl_runtime login password %L nosuperuser nocreatedb nocreaterole noreplication nobypassrls";
  const statement = await client.query(`select format('${operation}', $1::text) as sql`, [runtimePassword]);
  await client.query(statement.rows[0].sql);
  await client.query("revoke create on schema public from public,soyl_runtime");
  stage = "migrations";
  const migration = spawnSync(process.execPath, [fileURLToPath(new URL("./migrate.mjs", import.meta.url))], { stdio: "inherit", env: process.env, timeout: 120_000 });
  if (migration.status !== 0) throw new Error("Migration runner failed");
  stage = "grant-runtime-auth";
  await client.query("grant soyl_auth to soyl_runtime");
  if ((await client.query("select 1 from pg_roles where rolname='soyl_app'")).rowCount) {
    await client.query("grant soyl_app to soyl_runtime");
  }
  console.log("Azure database bootstrap completed with separate migration/runtime roles.");
} catch (error) {
  console.error(JSON.stringify({ event: "azure_database_bootstrap_failed", stage, code: typeof error?.code === "string" && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : "unknown" }));
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
