import pg from "pg";
// Local fixture only. Production roles are provisioned separately through deployment automation.
const url = new URL(process.env.DATABASE_MIGRATION_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("This helper only supports localhost.");
const client = new pg.Client({ connectionString: url.href });
try {
  await client.connect();
  await client.query("grant soyl_auth to soyl_runtime");
  await client.query("revoke create on schema public from public,soyl_runtime");
  console.log("Local non-owner runtime identity can execute auth functions; direct table access is denied.");
} finally { await client.end(); }
