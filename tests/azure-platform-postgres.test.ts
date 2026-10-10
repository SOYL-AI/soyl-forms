import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { getDatabasePool, withUserTransaction } from "@/lib/db/pool";
import * as forms from "@/lib/db/repositories/forms";
import { ensureWorkspace } from "@/lib/db/repositories/workspaces";
import type { FormSchemaV1 } from "@/types/forms";
import { readDashboard } from "@/lib/db/repositories/dashboard";
import { responseCsvStream } from "@/lib/db/export";
import * as actions from "@/lib/forms/actions";
import { POST as submitApi } from "@/app/api/public/forms/[slug]/submit/route";
import { POST as startApi } from "@/app/api/public/forms/[slug]/start/route";
import { POST as progressApi } from "@/app/api/public/forms/[slug]/progress/route";
import { PUT as saveApi, GET as resumeApi } from "@/app/api/public/forms/[slug]/resume/route";
import { readResponse, searchResponses } from "@/lib/db/repositories/responses";
import * as uploads from "@/lib/db/repositories/uploads";
import * as teams from "@/lib/db/repositories/teams";
import * as billing from "@/lib/db/repositories/billing";
import * as jobs from "@/lib/db/repositories/jobs";
import * as hooks from "@/lib/db/repositories/webhooks";
import * as operators from "@/lib/db/repositories/operators";
import { readWorkspacePlan } from "@/lib/db/repositories/workspaces";
import { hashMcpKey,newMcpKey,verifyMcpKey } from "@/lib/mcp/keys";
import { MCP_TOOLS } from "@/lib/mcp/tools";

const authState = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth/session", () => ({ getEntraSessionUser: async () => authState.id ? {id:authState.id,email:"owner@example.test",email_verified:true,display_name:"Test"} : null }));

const enabled = process.env.AZURE_DATABASE_TESTS === "true";
const suite = enabled ? describe : describe.skip;
suite("Azure platform against real PostgreSQL and non-owner roles", () => {
  const ownerId = randomUUID(), otherId = randomUUID(), viewerId = randomUUID();
  let admin: pg.Client;
  let workspace: string, otherWorkspace: string;
  const schema: FormSchemaV1 = { schemaVersion: 1, title: "Tenant test", blocks: [{ id: "q", type: "short_text", title: "Name", required: true }], logic: [] };
  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND","azure");
    authState.id=ownerId;
    const url = new URL(process.env.DATABASE_MIGRATION_URL ?? "");
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Destructive fixtures require isolated localhost PostgreSQL");
    admin = new pg.Client({ connectionString: url.href });
    await admin.connect();
    await admin.query("insert into app_users(id,email) values($1,'owner@example.test'),($2,'other@example.test'),($3,'viewer@example.test')", [ownerId, otherId, viewerId]);
    const results = await Promise.all(Array.from({ length: 4 }, () => ensureWorkspace(ownerId)));
    expect(new Set(results.map(r => r.workspaceId)).size).toBe(1);
    expect(results.filter(r => r.created)).toHaveLength(1);
    workspace = results[0].workspaceId;
    otherWorkspace = (await ensureWorkspace(otherId)).workspaceId;
    await admin.query("insert into workspace_members(workspace_id,user_id,role) values($1,$2,'viewer')", [workspace, viewerId]);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    if (!admin) return;
    await admin.query("delete from audit_logs where workspace_id=any($1::uuid[])",[[workspace,otherWorkspace]]);
    await admin.query("delete from workspaces where owner_user_id=any($1::uuid[])", [[ownerId, otherId]]);
    await admin.query("delete from app_users where id=any($1::uuid[])", [[ownerId, otherId, viewerId]]);
    await admin.end();
    await getDatabasePool().end();
    delete (globalThis as typeof globalThis & { soylDatabasePool?: pg.Pool }).soylDatabasePool;
  });

  it("provisions workspace, membership, subscription and welcome credits exactly once", async () => {
    expect((await admin.query("select balance from ai_credits where workspace_id=$1", [workspace])).rows[0].balance).toBe("10");
    expect((await admin.query("select count(*) from subscriptions where workspace_id=$1", [workspace])).rows[0].count).toBe("1");
    expect((await admin.query("select count(*) from ai_credit_ledger where workspace_id=$1", [workspace])).rows[0].count).toBe("1");
  });

  it('shares an atomic rate limit across concurrent runtime connections',async()=>{
    const key=randomUUID().replaceAll('-','').repeat(2);
    try {
      const replies=await Promise.all(Array.from({length:50},()=>getDatabasePool().query<{data:{ok:boolean}}> ('select platform.consume_rate_limit($1,20,60000) as data',[key])));
      expect(replies.filter(reply=>reply.rows[0].data.ok)).toHaveLength(20);
      expect((await admin.query('select hits from public_rate_limits where key=$1',[key])).rows[0].hits).toBe(21);
    } finally {await admin.query('delete from public_rate_limits where key=$1',[key]);}
  });
  it("scopes bearer API access to current creator permissions without a browser cookie", async () => {
    const secret=newMcpKey(),id=randomUUID();
    await admin.query("insert into workspace_api_keys(id,workspace_id,key_hash,key_prefix,created_by) values($1,$2,$3,'test',$4)",[id,workspace,hashMcpKey(secret),ownerId]);
    expect(await verifyMcpKey(secret)).toMatchObject({workspaceId:workspace,userId:ownerId,keyId:id});
    const formId=await forms.insertForm(ownerId,workspace,schema);
    const readTool=MCP_TOOLS.find(t=>t.def.name==='get_form_schema')!;
    expect(JSON.parse((await readTool.run({workspaceId:workspace,userId:ownerId},{formId})).content[0].text).id).toBe(formId);
    await expect(readTool.run({workspaceId:otherWorkspace,userId:ownerId},{formId})).rejects.toMatchObject({hint:'not_found'});
    await expect(readTool.run({workspaceId:workspace},{formId})).rejects.toMatchObject({hint:'auth'});
    await admin.query("update workspace_api_keys set revoked_at=now() where id=$1",[id]);
    expect(await verifyMcpKey(secret)).toBeNull();
    await admin.query("delete from workspace_api_keys where id=$1",[id]);
    await admin.query("delete from forms where id=$1",[formId]);
  });
  it("disables access immediately and durably fences account deletion until providers and files finish", async () => {
    const subject=randomUUID(),oid=randomUUID(),issuer='https://identity.example.test';
    const user=(await getDatabasePool().query<{id:string}>("select identity.resolve_verified_user($1,$2,'delete@example.test',false,'Delete',$3) as id",[issuer,subject,oid])).rows[0].id;
    const space=(await ensureWorkspace(user)).workspaceId;
    const token='9'.repeat(64);
    await getDatabasePool().query('select identity.create_session($1,$2)',[user,token]);
    await expect(getDatabasePool().query("select identity.resolve_verified_user($1,$2,null,false,null,$3)",[issuer,subject,randomUUID()])).rejects.toThrow('Provider identity changed');
    const fileId=randomUUID(),key=`delete-test/${randomUUID()}`;
    await admin.query("insert into uploaded_files(id,workspace_id,r2_key,original_name,mime_type,size_bytes,status) values($1,$2,$3,'test.pdf','application/pdf',1,'pending')",[fileId,space,key]);
    const request=(await withUserTransaction(user,db=>db.query<{id:string}>('select platform.request_account_deletion() as id'))).rows[0].id;
    await expect(getDatabasePool().query('select * from identity.deletion_requests')).rejects.toMatchObject({code:'42501'});
    expect((await getDatabasePool().query('select * from identity.read_session($1)',[token])).rows).toHaveLength(0);
    expect(await forms.readForm(user,randomUUID())).toBeNull();
    await admin.query("update identity.deletion_requests set available_at=now()-interval '1 minute' where id=$1",[request]);
    const job=(await getDatabasePool().query('select platform.claim_account_deletion() as job')).rows[0].job;
    expect(job.objects).toEqual([key]);
    expect((await getDatabasePool().query('select platform.claim_account_deletion() as job')).rows[0].job).toBeNull();
    expect((await getDatabasePool().query('select platform.checkpoint_account_deletion($1,$2,$3,$4) as ok',[request,randomUUID(),'object',key])).rows[0].ok).toBe(false);
    expect((await getDatabasePool().query('select platform.finish_account_deletion($1,$2) as ok',[request,job.lease_token])).rows[0].ok).toBe(false);
    for(const [stage,value] of [['object',key],['billing',null],['provider',null]]) await getDatabasePool().query('select platform.checkpoint_account_deletion($1,$2,$3,$4)',[request,job.lease_token,stage,value]);
    expect((await getDatabasePool().query('select platform.finish_account_deletion($1,$2) as ok',[request,job.lease_token])).rows[0].ok).toBe(true);
    expect((await admin.query('select id from app_users where id=$1',[user])).rows).toHaveLength(0);
    expect((await admin.query('select id from workspaces where id=$1',[space])).rows).toHaveLength(0);
    await admin.query('delete from audit_logs where target_id=$1',[user]);
  });
  it("denies cross-workspace reads, writes, moves and raw private-function access", async () => {
    const id = await forms.insertForm(ownerId, workspace, schema);
    expect(await forms.readForm(otherId, id)).toBeNull();
    expect(await forms.renameForm(otherId, id, "Attack")).toBe(false);
    await expect(forms.insertForm(otherId, workspace, schema)).rejects.toMatchObject({ code: "42501" });
    await expect(withUserTransaction(ownerId, db => db.query("update forms set workspace_id=$1 where id=$2", [otherWorkspace, id]))).rejects.toMatchObject({ code: "42501" });
    await expect(getDatabasePool().query("select platform_private.grant_ai_credits($1,1000,'attack','attack')", [workspace])).rejects.toMatchObject({ code: "42501" });
    expect((await getDatabasePool().query("select id from forms")).rows).toHaveLength(0);
    await admin.query("delete from forms where id=$1", [id]);
  });
  it("allows viewer reads while rejecting edits, publication and direct status escalation", async () => {
    const id = await forms.insertForm(ownerId, workspace, schema);
    expect(await forms.readForm(viewerId, id)).toMatchObject({ id });
    expect(await forms.renameForm(viewerId, id, "Attack")).toBe(false);
    await expect(forms.publishForm(viewerId, { formId: id, schema, theme: {}, settings: {}, maxActive: 1 })).rejects.toMatchObject({ code: "42501" });
    for (const role of [null, "soyl_app", "soyl_auth"]) {
      await expect(withUserTransaction(ownerId, async db => {
        if (role) await db.query(`set local role ${role}`);
        await db.query("update forms set status='published' where id=$1", [id]);
      })).rejects.toMatchObject({ code: "42501" });
    }
    await admin.query("delete from forms where id=$1", [id]);
  });
  it("detects draft conflicts and prevents publishing beyond a concurrent quota", async () => {
    const first = await forms.insertForm(ownerId, workspace, schema), second = await forms.insertForm(ownerId, workspace, schema);
    expect(await forms.saveDraft(ownerId, { formId: first, revision: 0, schema })).toBe(true);
    expect(await forms.saveDraft(ownerId, { formId: first, revision: 0, schema })).toBe(false);
    const results = await Promise.allSettled([first, second].map(formId => forms.publishForm(ownerId, { formId, schema, theme: {}, settings: {}, maxActive: 1 })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await forms.activeFormCount(ownerId, workspace)).toBe(1);
    const published = (await admin.query("select id,slug,published_version_id from forms where workspace_id=$1 and status='published'", [workspace])).rows[0];
    expect(await forms.readPublicForm(published.slug)).toMatchObject({ id: published.id, version_id: published.published_version_id });
    await expect(withUserTransaction(ownerId, db => db.query("update form_versions set schema='{}' where id=$1", [published.published_version_id]))).rejects.toMatchObject({ code: "42501" });
    await admin.query("delete from forms where id=any($1::uuid[])", [[first, second]]);
  });
  it("atomically limits concurrent public responses and records one outbox event per response", async () => {
    const id = await forms.insertForm(ownerId, workspace, schema);
    const version = await forms.publishForm(ownerId, { formId: id, schema, theme: {}, settings: {}, maxActive: 1 });
    const submit = async (key: string) => (await getDatabasePool().query<{ result: { ok: boolean; error?: string; duplicate?: boolean } }>(
      "select platform.submit_response($1,$2,$3,$4,$5,'{}',null,100,1,null,null) as result", [id, workspace, version.version_id, key, JSON.stringify({ q: { type: "short_text", value: "Test" } })])).rows[0].result;
    const results = await Promise.all([submit("response-key-00001"), submit("response-key-00002")]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.filter(r => r.error === "LIMIT_REACHED")).toHaveLength(1);
    const key = results[0].ok ? "response-key-00001" : "response-key-00002";
    await forms.changeFormStatus(ownerId, id, "closed");
    expect(await submit(key)).toMatchObject({ ok: true, duplicate: true });
    expect((await admin.query("select count(*) from submissions where form_id=$1", [id])).rows[0].count).toBe("1");
    expect((await admin.query("select count(*) from outbox_events where payload->>'formId'=$1", [id])).rows[0].count).toBe("1");
    await admin.query("delete from forms where id=$1",[id]);
  });

  it("runs the existing create/save/publish and public progress/resume/submit API workflow on Azure", async () => {
    const created=await actions.createFormFromDraft({title:"API workflow",schema});
    expect(created.ok).toBe(true);
    if(!created.ok) throw Error(created.error);
    expect(await actions.saveDraft({formId:created.id,title:"API workflow",schema,revision:0})).toMatchObject({ok:true,revision:1});
    const published=await actions.publishForm({formId:created.id});
    expect(published).toMatchObject({ok:true,version:1});
    const form=await forms.readForm(ownerId,created.id);
    if(!form?.published_version_id) throw Error("Publication missing");
    const props={params:Promise.resolve({slug:form.slug})};
    const session=randomUUID(), key=randomUUID();
    const request=(path:string,method:string,body:unknown) => new Request(`http://localhost/api/public/forms/${form.slug}/${path}`,{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    expect((await startApi(request("start","POST",{sessionId:session,formVersionId:form.published_version_id}),props)).status).toBe(200);
    expect((await progressApi(request("progress","POST",{sessionId:session,formVersionId:form.published_version_id,blockId:"q"}),props)).status).toBe(200);
    const answers={q:{type:"short_text",value:"API respondent"}};
    const saved=await saveApi(request("resume","PUT",{sessionId:session,idempotencyKey:key,formVersionId:form.published_version_id,answers,history:["q"],currentId:"q"}),props);
    expect(saved.status).toBe(200);
    const resume=await saved.json();
    expect((await resumeApi(new Request(`http://localhost/api/public/forms/${form.slug}/resume?token=${resume.token}`),props)).status).toBe(200);
    const submitted=await submitApi(request("submit","POST",{sessionId:session,idempotencyKey:key,formVersionId:form.published_version_id,answers,resumeToken:resume.token}),props);
    expect(submitted.status).toBe(200);
    const result=await submitted.json();
    expect(result).toMatchObject({ok:true,duplicate:false});
    expect(await readResponse(ownerId,form.id,result.submissionId)).toMatchObject({answers});
    expect(await readResponse(otherId,form.id,result.submissionId)).toBeNull();
    expect((await resumeApi(new Request(`http://localhost/api/public/forms/${form.slug}/resume?token=${resume.token}`),props)).status).toBe(404);
    expect(await (await submitApi(request("submit","POST",{idempotencyKey:key,formVersionId:form.published_version_id,answers}),props)).json()).toMatchObject({ok:true,duplicate:true,submissionId:result.submissionId});
    expect((await searchResponses(ownerId,form.id,{q:"API respondent",tag:"",from:null,to:null,offset:0})).total).toBe(1);
    expect(await actions.updateSubmissionAnswer({formId:form.id,submissionId:result.submissionId,blockId:"q",value:{type:"short_text",value:"Corrected"}})).toMatchObject({ok:true});
    expect(await actions.setSubmissionTags({formId:form.id,submissionId:result.submissionId,tags:["Reviewed"]})).toMatchObject({ok:true});
    expect((await admin.query("select count(*) from audit_logs where target_id=$1",[result.submissionId])).rows[0].count).toBe("2");
    await admin.query("delete from audit_logs where workspace_id=$1",[workspace]);
    await admin.query("delete from forms where id=$1",[form.id]);
  });

  it("aggregates and consistently streams more than 10,000 responses without truncation", async () => {
    const id=await forms.insertForm(otherId,otherWorkspace,schema);
    const version=await forms.publishForm(otherId,{formId:id,schema,theme:{},settings:{},maxActive:1});
    await admin.query(`insert into submissions(workspace_id,form_id,form_version_id,idempotency_key,answers,hidden_fields,tags)
      select $1,$2,$3,'bulk-'||n,jsonb_build_object('q',jsonb_build_object('type','short_text','value','Answer '||n)),
        case when n=10005 then '{"campaign":"last-row"}'::jsonb else '{}'::jsonb end,
        case when n=10005 then array['tail-tag'] else '{}'::text[] end from generate_series(1,10005) n`,[otherWorkspace,id,version.version_id]);
    expect((await readDashboard(otherId,otherWorkspace)).total.get(id)).toBe(10005);
    const stream=responseCsvStream(otherId,id,schema.blocks);
    expect(stream).not.toBeNull();
    expect(responseCsvStream(otherId,id,schema.blocks)).toBeNull();
    const reader=stream!.getReader(), decoder=new TextDecoder();
    let csv=decoder.decode((await reader.read()).value);
    await admin.query("insert into submissions(workspace_id,form_id,form_version_id,idempotency_key) values($1,$2,$3,'after-snapshot')",[otherWorkspace,id,version.version_id]);
    for(;;){const next=await reader.read();if(next.done)break;csv+=decoder.decode(next.value);}
    expect(csv.trimEnd().split("\n")).toHaveLength(10006);
    expect(csv.split("\n")[0]).toContain("campaign,tags");
    expect(csv).toContain("last-row,tail-tag");
    const cancellation=responseCsvStream(otherId,id,schema.blocks)!;
    await cancellation.cancel();
    const subsequent=responseCsvStream(otherId,id,schema.blocks)!;
    expect(subsequent).not.toBeNull();
    await subsequent.cancel();
    await admin.query("delete from forms where id=$1",[id]);
  }, 60_000);

  it("binds private uploads to capabilities and workspace roles, with atomic storage reservations", async () => {
    const fileSchema:FormSchemaV1={...schema,blocks:[{id:'file',type:'file_upload',title:'Document'}]};
    const id=await forms.insertForm(ownerId,workspace,fileSchema);
    const version=await forms.publishForm(ownerId,{formId:id,schema:fileSchema,theme:{},settings:{},maxActive:1});
    const file:uploads.FileReservation={id:randomUUID(),workspace_id:workspace,form_id:id,question_id:'file',kind:'submission',r2_key:`${workspace}/pending`,original_name:'test.pdf',mime_type:'application/pdf',size_bytes:10,upload_token_hash:'a'.repeat(64)};
    expect(await uploads.reserveFile(null,file,10,version.version_id)).toBe(true);
    expect(await uploads.reserveFile(null,{...file,id:randomUUID()},10,version.version_id)).toBe(false);
    expect(await uploads.readUpload(null,file.id,id,'b'.repeat(64))).toBeNull();
    expect(await uploads.readUpload(otherId,file.id)).toBeNull();
    expect(await uploads.publicAsset(file.id)).toBeNull();
    const row=(await uploads.readUpload(null,file.id,id,'a'.repeat(64)))!;
    expect(row).not.toBeNull();
    expect(await uploads.freezeFile(null,row,'frozen','b'.repeat(64))).toBe(false);
    expect(await uploads.freezeFile(null,row,'frozen','a'.repeat(64))).toBe(true);
    expect(await uploads.freezeFile(null,row,'stale-writer','a'.repeat(64))).toBe(false);
    expect(await uploads.publicAsset(file.id)).toBeNull();
    const creator={...file,id:randomUUID(),kind:'brand_asset',question_id:null,mime_type:'image/png',r2_key:'creator'};
    await expect(uploads.reserveFile(otherId,creator,100)).resolves.toBe(false);
    expect(await uploads.reserveFile(ownerId,creator,100)).toBe(true);
    const asset=(await uploads.readUpload(ownerId,creator.id))!;
    expect(await uploads.freezeFile(viewerId,asset,'creator-frozen',null)).toBe(false);
    expect(await uploads.freezeFile(ownerId,asset,'creator-frozen',null)).toBe(true);
    expect(await uploads.publicAsset(creator.id)).toMatchObject({r2_key:'creator-frozen'});
    await admin.query('delete from forms where id=$1',[id]);
    await admin.query('delete from uploaded_files where id=$1',[creator.id]);
  });

  it("serializes subscription checkout, applies billing atomically and rejects cross-workspace purchase replay", async () => {
    await expect(billing.beginCheckout(viewerId,workspace,'starter','monthly')).rejects.toMatchObject({code:'42501'});
    const checkouts=await Promise.allSettled([billing.beginCheckout(ownerId,workspace,'starter','monthly'),billing.beginCheckout(ownerId,workspace,'starter','monthly')]);
    expect(checkouts.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const winner=checkouts.find(r=>r.status==='fulfilled')!;
    if(winner.status!=='fulfilled' || !winner.value.token) throw Error('Checkout token missing');
    const subId=`sub_${randomUUID().replaceAll('-','')}`;
    expect(await billing.completeCheckout(ownerId,workspace,winner.value.token,subId,'plan_test','starter','monthly')).toBe(true);
    expect(await billing.completeCheckout(ownerId,workspace,winner.value.token,subId,'plan_test','pro','monthly')).toBe(false);
    const event={id:randomUUID(),event:'subscription.activated',hash:'a'.repeat(64),providerId:subId,observed:new Date().toISOString(),snapshot:{status:'active',plan:'starter',interval:'monthly'}};
    expect(await billing.applyBillingEvent(event)).toMatchObject({ok:true});
    expect(await billing.applyBillingEvent(event)).toMatchObject({ok:true,duplicate:true});
    await expect(billing.applyBillingEvent({...event,hash:'b'.repeat(64)})).rejects.toMatchObject({code:'P0001'});
    await billing.applyBillingEvent({...event,id:randomUUID(),observed:new Date(Date.now()-10_000).toISOString(),snapshot:{status:'authenticated',plan:'starter',interval:'monthly'}});
    expect((await billing.subscription(ownerId,workspace))?.status).toBe('active');
    const paymentId=`pay_${randomUUID().replaceAll('-','')}`;
    const initial=Number((await admin.query('select balance from ai_credits where workspace_id=$1',[workspace])).rows[0].balance);
    expect(await billing.purchaseCredits(ownerId,workspace,100,paymentId)).toBe(initial+100);
    expect(await billing.purchaseCredits(ownerId,workspace,100,paymentId)).toBe(initial+100);
    await expect(billing.purchaseCredits(otherId,otherWorkspace,100,paymentId)).rejects.toMatchObject({code:'P0001'});
    await admin.query('delete from razorpay_webhook_events where event_id=$1 or payload_hash=$2',[event.id,event.hash]);
  });

  it("fences outbox data, webhook secrets and immutable email reservations with the current lease", async () => {
    const id=await forms.insertForm(ownerId,workspace,schema);
    const version=await forms.publishForm(ownerId,{formId:id,schema,theme:{},settings:{},maxActive:1});
    const hookId=await hooks.createWebhook(ownerId,id,'https://example.com/receiver','encrypted-fixture',3);
    await expect(getDatabasePool().query('select secret_encrypted from webhooks where id=$1',[hookId])).rejects.toMatchObject({code:'42501'});
    const sub=(await getDatabasePool().query<{data:{submission_id:string}}>("select platform.submit_response($1,$2,$3,$4,$5,'{}',null,100,100,null,null) as data",[id,workspace,version.version_id,randomUUID(),JSON.stringify({q:{type:'short_text',value:'Queue test'}})])).rows[0].data;
    const evt=(await admin.query("update outbox_events set available_at=now()-interval '100 years' where payload->>'submissionId'=$1 returning id",[sub.submission_id])).rows[0];
    const job=(await jobs.claimJob())!;
    expect(job.id).toBe(evt.id);
    const queue=await jobs.queueStatus();
    expect(queue.processing).toBeGreaterThan(0);
    expect(queue.oldestPendingSeconds).toBeGreaterThanOrEqual(0);
    expect(Object.keys(queue).sort()).toEqual(['accountDeletions','failed24h','oldestDeletionSeconds','oldestPendingSeconds','pending','processing']);
    expect((await jobs.jobContext(job))?.submission?.id).toBe(sub.submission_id);
    const stale={...job,lease_token:randomUUID()};
    expect(await jobs.jobContext(stale)).toBeNull();
    expect(await jobs.checkpointJob(stale,job.payload)).toBe(false);
    expect(await hooks.deliveryWebhook(null,hookId,stale)).toBeNull();
    expect(await hooks.deliveryWebhook(otherId,hookId)).toBeNull();
    expect(await hooks.deliveryWebhook(null,hookId,job)).toMatchObject({id:hookId});
    const key=`${job.id}:owners`,request={to:['fixture@example.test'],subject:'First immutable request'};
    const first=await jobs.reserveEmail(job,key,1,1,request);
    expect(first?.status).toBe('reserved');
    expect((await jobs.reserveEmail(job,key,1,1,{subject:'Changed'}))?.request).toEqual(request);
    expect((await jobs.reserveEmail(job,`${job.id}:respondent`,1,1,request))?.status).toBe('limited');
    expect(await jobs.completeEmail(stale,key)).toBe(false);
    expect(await jobs.completeEmail(job,key)).toBe(true);
    await admin.query("update outbox_events set lease_until=now()-interval '1 second' where id=$1",[job.id]);
    expect(await jobs.finishJob(job,job.payload,true,false)).toBe(false);
    const reclaimed=(await jobs.claimJob())!;
    expect(reclaimed.id).toBe(job.id);
    expect(reclaimed.lease_token).not.toBe(job.lease_token);
    expect(await hooks.recordDelivery(null,hookId,reclaimed.id,reclaimed.attempts,200,null,reclaimed)).toBe(true);
    expect((await jobs.jobContext(reclaimed))?.hooks).toContainEqual({id:hookId,delivered:true});
    expect(await jobs.finishJob(reclaimed,{...reclaimed.payload,hooks:[hookId],owners:true,respondent:true},true,false)).toBe(true);
    await admin.query('delete from forms where id=$1',[id]);
  });

  it("gates operator access and preserves overrides through provider changes and expiry", async () => {
    await expect(operators.userList('')).rejects.toThrow('Operator access required');
    await admin.query("insert into admin_users(user_id,role) values($1,'support_admin')",[ownerId]);
    expect((await operators.userList('other@example.test')).users.map(u=>u.id)).toContain(otherId);
    expect((await operators.workspaceList('')).spaces.map(w=>w.id)).toContain(otherWorkspace);
    await expect(operators.overridePlan(workspace,'pro','Testing override',new Date(Date.now()+86400_000).toISOString())).rejects.toMatchObject({code:'42501'});
    expect(await operators.moderateWorkspace(otherWorkspace,'suspended','Test')).toBe(true);
    expect(await forms.readForm(otherId,randomUUID())).toBeNull();
    expect(await operators.moderateWorkspace(otherWorkspace,'active','Test')).toBe(true);
    await admin.query("update admin_users set role='super_admin' where user_id=$1",[ownerId]);
    expect(await operators.overridePlan(workspace,'pro','Testing override',new Date(Date.now()+86400_000).toISOString())).toBe(true);
    expect(await readWorkspacePlan(ownerId,workspace)).toBe('pro');
    await admin.query("update subscriptions set status='cancelled',plan_code='free' where workspace_id=$1",[workspace]);
    expect(await readWorkspacePlan(ownerId,workspace)).toBe('pro');
    expect(await operators.overridePlan(workspace,null,null,null)).toBe(true);
    expect(await readWorkspacePlan(ownerId,workspace)).toBe('free');
    expect((await operators.overview()).users).toBeGreaterThanOrEqual(3);
    expect((await operators.usageOverview()).totals.responses).toBeGreaterThan(0);
    expect(await operators.userDetail(otherId)).toMatchObject({user:{id:otherId}});
    expect(await operators.workspaceDetail(otherWorkspace)).toMatchObject({ws:{id:otherWorkspace}});
    expect((await operators.billingList()).subs).toBeDefined();
    expect((await operators.auditList('billing.override')).length).toBeGreaterThan(0);
    await admin.query('delete from admin_users where user_id=$1',[ownerId]);
  });

  it("rotates invite capabilities and prevents concurrent removal of the last owner", async () => {
    await expect(teams.createInvite(viewerId,workspace,'viewer@example.test','owner')).rejects.toMatchObject({code:'42501'});
    const oldId=await teams.createInvite(ownerId,workspace,'other@example.test','owner');
    const freshId=await teams.createInvite(ownerId,workspace,'other@example.test','owner');
    expect(freshId).not.toBe(oldId);
    expect(await teams.readInvite(otherId,oldId)).toBeNull();
    const acceptance=await Promise.allSettled([teams.acceptInvite(otherId,freshId),teams.acceptInvite(otherId,freshId)]);
    expect(acceptance.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    // The empty personal workspace is absorbed atomically; no unrelated content is deleted.
    expect((await admin.query('select count(*) from workspaces where id=$1',[otherWorkspace])).rows[0].count).toBe('0');
    const exits=await Promise.allSettled([teams.changeMember(ownerId,workspace,ownerId,null,true),teams.changeMember(otherId,workspace,otherId,null,true)]);
    expect(exits.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect((await admin.query("select count(*) from workspace_members where workspace_id=$1 and role='owner'",[workspace])).rows[0].count).toBe('1');
    // Restore fixture ownership so cleanup does not depend on which transaction won.
    await admin.query('update workspaces set owner_user_id=$1 where id=$2',[ownerId,workspace]);
  });
});
