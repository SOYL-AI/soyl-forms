import pg from "pg";
// Local fixture only. Production roles are provisioned separately through deployment automation.
const url = new URL(process.env.DATABASE_MIGRATION_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("This helper only supports localhost.");
const client = new pg.Client({ connectionString: url.href });
try {
  await client.connect();
  if (!(await client.query("select 1 from pg_roles where rolname='soyl_runtime'")).rowCount) {
    const runtimeUrl=new URL(process.env.DATABASE_URL ?? "");
    const password=decodeURIComponent(runtimeUrl.password);
    if(runtimeUrl.hostname!==url.hostname || runtimeUrl.username!=='soyl_runtime' || password.length<16) throw new Error('Invalid local runtime fixture configuration');
    const statement=await client.query("select format('create role soyl_runtime login password %L nosuperuser nocreatedb nocreaterole nobypassrls', $1::text) as sql",[password]);
    await client.query(statement.rows[0].sql);
  }
  await client.query("grant soyl_auth to soyl_runtime");
  if ((await client.query("select 1 from pg_roles where rolname='soyl_app'")).rowCount) await client.query("grant soyl_app to soyl_runtime");
  await client.query("revoke create on schema public from public,soyl_runtime");
  console.log("Local non-owner runtime has scoped auth/application grants; tenant access requires a trusted transaction identity.");
} finally { await client.end(); }
