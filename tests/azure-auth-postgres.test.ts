import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import pg from "pg";
import { getDatabasePool, withUserTransaction } from "@/lib/db/pool";

// Opt-in only; default unit tests never contact a database from ambient .env files.
const enabled = process.env.AZURE_DATABASE_TESTS === "true";
const runtime = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const owner = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 1 });
const subject = `integration-${randomUUID()}`;
const issuer = "https://postgres-test.example";
const challenge = randomBytes(32).toString("base64url");
const hash = () => createHash("sha256").update(randomBytes(32)).digest("hex");
let userId: string;
let stateHash: string;
let ticketHash: string;

describe.skipIf(!enabled)("real PostgreSQL auth under the non-owner runtime role", () => {
  beforeAll(async () => {
    for (const raw of [process.env.DATABASE_URL, process.env.DATABASE_MIGRATION_URL]) {
      const url = new URL(raw ?? "");
      if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/soyl_forms") throw new Error("Integration tests require the isolated local soyl_forms database");
    }
    const role = (await runtime.query("select rolsuper,rolbypassrls,rolcreaterole from pg_roles where rolname=current_user")).rows[0];
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false, rolcreaterole: false });
    const results = await Promise.all(Array.from({ length: 12 }, () => runtime.query<{ id: string }>(
      "select identity.resolve_user($1,$2,'integration@example.com',false,'Integration') as id", [issuer, subject])));
    expect(new Set(results.map((r) => r.rows[0].id)).size).toBe(1);
    userId = results[0].rows[0].id;
  });
  afterAll(async () => {
    if (userId) {
      await owner.query("delete from identity.sessions where user_id=$1", [userId]);
      await owner.query("delete from identity.native_handoffs where user_id=$1", [userId]);
      await owner.query("delete from identity.provider_identities where user_id=$1", [userId]);
      await owner.query("delete from public.app_users where id=$1", [userId]);
    }
    if (stateHash) await owner.query("delete from identity.oauth_transactions where state_hash=$1", [stateHash]);
    await runtime.end(); await owner.end();
    await getDatabasePool().end();
  });
  it("denies direct identity-table reads/writes and schema creation", async () => {
    await expect(runtime.query("select * from public.app_users")).rejects.toThrow(/permission denied/);
    await expect(runtime.query("select * from identity.sessions")).rejects.toThrow(/permission denied/);
    await expect(runtime.query("update public.app_users set status='active' where id=$1", [userId])).rejects.toThrow(/permission denied/);
    await expect(runtime.query("create table public.unauthorized(id int)")).rejects.toThrow(/permission denied/);
  });
  it("consumes OAuth transactions once across pooled connections", async () => {
    stateHash = hash();
    await runtime.query("select identity.begin_oauth($1)", [stateHash]);
    const results = await Promise.all(Array.from({ length: 20 }, () => runtime.query<{ consumed: boolean }>("select identity.consume_oauth($1) as consumed", [stateHash])));
    expect(results.filter((r) => r.rows[0].consumed)).toHaveLength(1);
  });
  it("clears the trusted user context after both commit and rollback", async () => {
    const current = await withUserTransaction(userId, async (client) => (await client.query("select current_setting('app.user_id',true) as id")).rows[0].id);
    expect(current).toBe(userId);
    expect((await getDatabasePool().query("select nullif(current_setting('app.user_id',true),'') as id")).rows[0].id).toBeNull();
    await expect(withUserTransaction(userId, async () => { throw new Error("Rollback fixture"); })).rejects.toThrow("Rollback fixture");
    expect((await getDatabasePool().query("select nullif(current_setting('app.user_id',true),'') as id")).rows[0].id).toBeNull();
  });
  it("redeems an app-bound native ticket once across concurrent requests", async () => {
    ticketHash = hash();
    await runtime.query("select identity.create_handoff($1,$2,$3,'/auth/entra/proof')", [userId, ticketHash, challenge]);
    const results = await Promise.all(Array.from({ length: 12 }, () => runtime.query<{ next: string | null }>("select identity.redeem_handoff($1,$2,$3) as next", [ticketHash, challenge, hash()])));
    expect(results.filter((r) => r.rows[0].next === "/auth/entra/proof")).toHaveLength(1);
    const count = await owner.query<{ count: number }>("select count(*)::int from identity.sessions where user_id=$1", [userId]);
    expect(count.rows[0].count).toBe(1);
  });
  it("rejects disabled accounts on every session read", async () => {
    const tokenHash = hash();
    await runtime.query("select identity.create_session($1,$2)", [userId, tokenHash]);
    expect((await runtime.query("select * from identity.read_session($1)", [tokenHash])).rowCount).toBe(1);
    await owner.query("update public.app_users set status='disabled' where id=$1", [userId]);
    expect((await runtime.query("select * from identity.read_session($1)", [tokenHash])).rowCount).toBe(0);
    await expect(runtime.query("select identity.create_session($1,$2)", [userId, hash()])).rejects.toThrow("Account unavailable");
  });
});
