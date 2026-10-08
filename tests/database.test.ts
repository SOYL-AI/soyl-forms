import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const db = new PGlite();
const owner = randomUUID(), workspace = randomUUID(), form = randomUUID(), version = randomUUID();
async function scalar<T>(sql: string, args: unknown[] = []) {
  return (await db.query<{ value: T }>(`select ${sql} as value`, args)).rows[0]!.value;
}
async function submit(key: string, answers: unknown = {}, limit = 10) {
  return scalar<{ ok: boolean; error?: string; submission_id?: string; duplicate?: boolean }>(
    "submit_form_safe($1,$2,$3,$4,$5,'{}',null,1000,$6,null,null)", [form, workspace, version, key, JSON.stringify(answers), limit]);
}

beforeAll(async () => {
  await db.exec(`create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon; create role authenticated; create role service_role bypassrls;`);
  const directory = path.resolve(__dirname, "../supabase/migrations");
  for (const file of fs.readdirSync(directory).filter((f) => f.endsWith(".sql")).sort()) {
    // gen_random_uuid is native PostgreSQL. PGlite doesn't ship pgcrypto's optional extension.
    let sql = fs.readFileSync(path.join(directory, file), "utf8").replace(/create extension if not exists "pgcrypto";/i, "");
    if (file.startsWith("0012")) await db.exec("grant select on all tables in schema public to authenticated;");
    await db.exec(sql);
  }
}, 60_000);

beforeEach(async () => {
  await db.exec("begin");
  await db.query("insert into auth.users(id) values($1)", [owner]);
  await db.query("insert into workspaces(id,name,slug,owner_user_id) values($1,'Test','test',$2)", [workspace, owner]);
  await db.query("insert into workspace_members(workspace_id,user_id,role) values($1,$2,'owner')", [workspace, owner]);
  await db.query("insert into forms(id,workspace_id,title,slug,status) values($1,$2,'Test','test','published')", [form, workspace]);
  await db.query("insert into form_versions(id,form_id,version_number,schema) values($1,$2,1,$3)",
    [version, form, JSON.stringify({ schemaVersion: 1, title: "Test", blocks: [], logic: [] })]);
  await db.query("update forms set published_version_id = $1 where id = $2", [version, form]);
});
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

describe("submission transactions", () => {
  it("saves paid responses with a real UUID and acknowledges retries even after closure", async () => {
    const payment = randomUUID();
    await db.query(`insert into form_payments(id,workspace_id,form_id,form_version_id,block_id,order_id,payment_id,amount_paise,status)
      values($1,$2,$3,$4,'pay','order_1','payment_1',500,'paid')`, [payment, workspace, form, version]);
    const answers = { pay: { type: "payment", value: { payment_id: "payment_1", order_id: "order_1", amount_paise: 500 } } };
    const first = await submit("retry-key", answers);
    expect(first.ok).toBe(true);
    expect(await scalar("(select submission_id from form_payments where id=$1)", [payment])).toBe(first.submission_id);
    await db.query("update forms set status='closed' where id=$1", [form]);
    expect(await submit("retry-key", answers)).toMatchObject({ ok: true, duplicate: true, submission_id: first.submission_id });
    expect(await scalar("(select count(*)::int from submissions)")).toBe(1);
    expect(await scalar("(select count(*)::int from outbox_events)")).toBe(1);
  });

  it("doesn't consume any payment when another payment fails validation", async () => {
    await db.query(`insert into form_payments(workspace_id,form_id,form_version_id,block_id,order_id,payment_id,amount_paise,status)
      values($1,$2,$3,'a','o','p',500,'paid')`, [workspace, form, version]);
    const result = await submit("key", {
      a: { type: "payment", value: { payment_id: "p", order_id: "o", amount_paise: 500 } },
      b: { type: "payment", value: { payment_id: "missing", order_id: "missing", amount_paise: 500 } },
    });
    expect(result).toMatchObject({ ok: false, error: "PAYMENT_MISMATCH" });
    expect(await scalar("(select submission_id from form_payments limit 1)")).toBeNull();
    expect(await scalar("(select count(*)::int from submissions)")).toBe(0);
  });

  it("rejects reused payments and payments from another question/version", async () => {
    await db.query(`insert into form_payments(workspace_id,form_id,form_version_id,block_id,order_id,payment_id,amount_paise,status)
      values($1,$2,$3,'pay','o','p',500,'paid')`, [workspace, form, version]);
    const answer = { type: "payment", value: { payment_id: "p", order_id: "o", amount_paise: 500 } };
    expect(await submit("wrong", { other: answer })).toMatchObject({ error: "PAYMENT_MISMATCH" });
    expect((await submit("one", { pay: answer })).ok).toBe(true);
    expect(await submit("two", { pay: answer })).toMatchObject({ error: "PAYMENT_MISMATCH" });
  });

  it("enforces monthly and per-form caps without consuming paid rows", async () => {
    expect((await submit("one", {}, 1)).ok).toBe(true);
    expect(await submit("two", {}, 1)).toMatchObject({ error: "LIMIT_REACHED" });
    await db.query("update form_versions set settings=$1 where id=$2", [JSON.stringify({ submissionLimit: 1 }), version]);
    expect(await submit("three", {}, 10)).toMatchObject({ error: "FORM_LIMIT_REACHED" });
  });

  it("only attaches verified files bound to the same form and question", async () => {
    const file = randomUUID();
    await db.query(`insert into uploaded_files(id,workspace_id,form_id,question_id,r2_key,original_name,mime_type,size_bytes)
      values($1,$2,$3,'upload','key','file.txt','text/plain',10)`, [file, workspace, form]);
    expect(await submit("one", { upload: { type: "file_upload", value: [file] } })).toMatchObject({ error: "FILE_MISMATCH" });
    await db.query("update uploaded_files set verified_at=now() where id=$1", [file]);
    expect(await submit("two", { other: { type: "file_upload", value: [file] } })).toMatchObject({ error: "FILE_MISMATCH" });
    expect((await submit("three", { upload: { type: "file_upload", value: [file] } })).ok).toBe(true);
    expect(await scalar("(select status::text from uploaded_files where id=$1)", [file])).toBe("attached");
  });
});

describe("shared quotas, resume, and outbox", () => {
  it("expires abandoned uploads but never deletes an attached response file", async () => {
    const first = randomUUID(), second = randomUUID();
    await db.query(`insert into uploaded_files(id,workspace_id,form_id,question_id,r2_key,original_name,mime_type,size_bytes,verified_at,created_at)
      values($1,$3,$4,'upload','old','f.txt','text/plain',10,now(),now()-interval '2 days'),
            ($2,$3,$4,'upload','attached','f.txt','text/plain',10,now(),now()-interval '2 days')`, [first, second, workspace, form]);
    expect(await scalar("expire_pending_upload($1,now()-interval '1 day')", [first])).toMatchObject({ id: first });
    expect(await submit("expired", { upload: { type: "file_upload", value: [first] } })).toMatchObject({ error: "FILE_MISMATCH" });
    expect((await submit("attached", { upload: { type: "file_upload", value: [second] } })).ok).toBe(true);
    expect(await scalar("expire_pending_upload($1,now()-interval '1 day')", [second])).toBeNull();
    expect(await scalar("(select status::text from uploaded_files where id=$1)", [second])).toBe("attached");
  });
  it("reserves quota using every stored file, including pending uploads", async () => {
    const row = { id: randomUUID(), workspace_id: workspace, form_id: form, r2_key: "one", original_name: "f", mime_type: "text/plain", size_bytes: 6, kind: "submission" };
    expect(await scalar("reserve_upload($1,10)", [JSON.stringify(row)])).toBe(true);
    expect(await scalar("reserve_upload($1,10)", [JSON.stringify({ ...row, id: randomUUID(), r2_key: "two" })])).toBe(false);
  });

  it("updates one resume row across devices without changing its identity", async () => {
    const save = (session: string, token: string | null, answers = {}) => scalar<{ token: string; sessionId: string; idempotencyKey: string }>(
      "save_partial_response($1,$2,$3,$4,$5,$6,'q',array['q'])", [form, version, session, token, JSON.stringify(answers), "stable-key"]);
    const first = await save("device-one", null);
    const second = await save("device-two", first.token, { q: "updated" });
    expect(second).toEqual(first);
    expect(await scalar("(select count(*)::int from partial_responses)")).toBe(1);
    await scalar("submit_form_safe($1,$2,$3,'stable-key','{}','{}',null,0,10,$4,$5)", [form, workspace, version, first.sessionId, first.token]);
    expect(await scalar("(select count(*)::int from partial_responses)")).toBe(0);
    expect(await save("device-two", first.token)).toBeNull();
  });

  it("claims an event once and recovers expired processing leases", async () => {
    await submit("key");
    const first = (await db.query<{ lease_token: string }>("select * from claim_outbox_event()")).rows[0]!;
    expect((await db.query("select * from claim_outbox_event()")).rows).toHaveLength(0);
    await db.exec("update outbox_events set lease_until=now()-interval '1 second'");
    const second = (await db.query<{ lease_token: string; attempts: number }>("select * from claim_outbox_event()")).rows[0]!;
    expect(second.lease_token).not.toBe(first.lease_token);
    expect(second.attempts).toBe(2);
  });

  it("shares rate counts and preserves email reservation identity", async () => {
    expect(await scalar("consume_rate_limit('hashed-key',1,60000)")).toMatchObject({ ok: true });
    expect(await scalar("consume_rate_limit('hashed-key',1,60000)")).toMatchObject({ ok: false });
    expect(await scalar("reserve_notification_email('mail',$1,1,1,'{}')", [workspace])).toMatchObject({ status: "reserved" });
    expect(await scalar("reserve_notification_email('mail',$1,1,1,'{}')", [workspace])).toMatchObject({ status: "reserved" });
    expect(await scalar("reserve_notification_email('other',$1,1,1,'{}')", [workspace])).toMatchObject({ status: "limited" });
    expect(await scalar("(select notification_emails::int from usage_monthly)")).toBe(1);
  });
});

describe("response queries and database access", () => {
  it("counts more than 2000 responses and finds answers beyond the first page", async () => {
    await db.query(`insert into submissions(workspace_id,form_id,form_version_id,idempotency_key,answers,tags)
      select $1,$2,$3,i::text,jsonb_build_object('q',jsonb_build_object('type','number','value',i)),
        case when i=1 then array['old'] else '{}'::text[] end from generate_series(1,2100) i`, [workspace, form, version]);
    const stats = await scalar<{ completions: number; days: Record<string, number> }>("form_analytics($1,array['q'])", [form]);
    expect(stats.completions).toBe(2100);
    expect(Object.values(stats.days).reduce((s, n) => s + n, 0)).toBe(2100);
    const filtered = await scalar<{ total: number; rows: unknown[]; tags: string[] }>("search_form_responses($1,'','old')", [form]);
    expect(filtered.total).toBe(1);
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.tags).toEqual(["old"]);
    expect(await scalar("search_form_responses($1,'','','2020-01-01',null,100,100)", [form])).toMatchObject({ total: 2100 });
  });

  it("denies authenticated clients access to payment/webhook secrets and privileged RPCs", async () => {
    expect(await scalar("has_column_privilege('authenticated','workspace_payment_providers','key_id','SELECT')")).toBe(true);
    expect(await scalar("has_column_privilege('authenticated','workspace_payment_providers','secret_encrypted','SELECT')")).toBe(false);
    expect(await scalar("has_column_privilege('authenticated','webhooks','secret_encrypted','SELECT')")).toBe(false);
    expect(await scalar("has_function_privilege('authenticated','submit_form_safe(uuid,uuid,uuid,text,jsonb,jsonb,text,bigint,bigint,text,text)','EXECUTE')")).toBe(false);
  });
});
