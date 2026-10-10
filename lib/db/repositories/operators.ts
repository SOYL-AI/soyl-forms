import { getSessionUserId } from "@/lib/supabase/server";
import { withUserTransaction } from "@/lib/db/pool";
import type { PoolClient } from "pg";
import { dailySeries,revenueSnapshot } from "@/app/super-admin/stats";
import { PLANS } from "@/lib/plans";
import { pct } from "@/lib/utils";
import { resolveEffectivePlan,type StoredSubscription } from "@/lib/billing/subscriptions";

async function operator<T>(work:(db:PoolClient)=>Promise<T>):Promise<T> {
  const id=await getSessionUserId();
  if(!id) throw new Error('Operator sign-in required');
  return withUserTransaction(id,async db=>{
    if(!(await db.query<{role:string|null}>('select platform.admin_role() as role')).rows[0].role) throw new Error('Operator access required');
    return work(db);
  });
}
export interface OperatorUser {id:string;email:string|null;email_verified:boolean;created_at:string;last_sign_in_at:string|null;status:string;identities:Array<{provider:string}>}
interface Space {id:string;name:string;slug:string;status:string;created_at:string;owner_user_id:string}
interface Form {id:string;workspace_id:string;title:string;slug:string;status:string;updated_at:string;published_at:string|null}
type Subscription=StoredSubscription & {workspace_id:string;billing_interval:string|null;provider_subscription_id:string|null;provider_plan_id:string|null;current_period_end:string|null;cancel_at_period_end:boolean;updated_at:string};
interface Usage {workspace_id:string;completed_submissions:number;notification_emails:number;webhook_attempts:number;file_storage_bytes:number}
interface Audit {id:string;actor_user_id:string|null;actor_type:string;action:string;target_type:string;target_id:string|null;workspace_id:string|null;metadata:Record<string,unknown>;created_at:string}
const timeUsage='workspace_id,completed_submissions::float8,notification_emails::float8,webhook_attempts::float8,file_storage_bytes::float8';
const timeSpace='id,name,slug,status,owner_user_id,created_at::text';
const timeForm='id,workspace_id,title,slug,status,updated_at::text,published_at::text';
const timeSub='s.*,current_period_end::text,override_expires_at::text,updated_at::text';
const timeAudit='id,actor_user_id,actor_type,action,target_type,target_id,workspace_id,metadata,created_at::text';
async function users(db:PoolClient,query='',ids:string[]|null=null):Promise<OperatorUser[]> {
  return (await db.query<OperatorUser>('select id,email,email_verified,created_at::text,last_sign_in_at::text,status,identities from platform.operator_users($1,$2)',[query,ids])).rows;
}
export function userList(query:string) {
  return operator(async db=>{
    const list=await users(db,query),ids=list.map(u=>u.id);
    const members=(await db.query<{user_id:string;workspace_id:string;role:string}>('select user_id,workspace_id,role from workspace_members where user_id=any($1::uuid[])',[ids])).rows;
    const profiles=(await db.query<{id:string;display_name:string|null}>('select id,display_name from profiles where id=any($1::uuid[])',[ids])).rows;
    const admins=(await db.query<{user_id:string;role:string}>('select user_id,role from admin_users where user_id=any($1::uuid[])',[ids])).rows;
    const spaces=(await db.query<Space>(`select ${timeSpace} from workspaces where id=any($1::uuid[])`,[members.map(m=>m.workspace_id)])).rows;
    return {users:list,members,profiles,admins,spaces};
  });
}
export function userDetail(id:string) {
  return operator(async db=>{
    const user=(await users(db,'',[id]))[0];
    if(!user) return null;
    const profile=(await db.query<{display_name:string|null;created_at:string}>('select display_name,created_at::text from profiles where id=$1',[id])).rows[0] ?? null;
    const members=(await db.query<{workspace_id:string;role:string}>('select workspace_id,role from workspace_members where user_id=$1',[id])).rows;
    const adminRow=(await db.query<{role:string}>('select role from admin_users where user_id=$1',[id])).rows[0] ?? null;
    const audit=(await db.query<Audit>(`select ${timeAudit} from audit_logs where actor_user_id=$1 order by created_at desc,id desc limit 20`,[id])).rows;
    const wsIds=members.map(m=>m.workspace_id);
    const spaces=(await db.query<Space>(`select ${timeSpace} from workspaces where id=any($1::uuid[])`,[wsIds])).rows;
    const subs=(await db.query<Subscription>(`select ${timeSub} from subscriptions s where workspace_id=any($1::uuid[])`,[wsIds])).rows;
    const forms=(await db.query<Form>(`select ${timeForm} from forms where workspace_id=any($1::uuid[]) order by updated_at desc,id limit 50`,[wsIds])).rows;
    return {user,profile,members,adminRow,audit,spaces,subs,forms};
  });
}
export function formList(query:string) {
  return operator(async db=>{
    const forms=(await db.query<Form>(`select ${timeForm} from forms where $1='' or strpos(lower(title),lower($1))>0 or slug=$2 or id::text=$1 or workspace_id::text=$1 order by updated_at desc,id limit 100`,[query,query.replace(/^\/?f\//,'')])).rows;
    const spaces=(await db.query<Space>(`select ${timeSpace} from workspaces where id=any($1::uuid[])`,[forms.map(f=>f.workspace_id)])).rows;
    const totals=(await db.query<{form_id:string;n:string}>('select form_id,count(*) as n from submissions where form_id=any($1::uuid[]) and deleted_at is null group by form_id',[forms.map(f=>f.id)])).rows;
    return {forms,spaceById:new Map(spaces.map(w=>[w.id,w])),counts:new Map(totals.map(r=>[r.form_id,Number(r.n)]))};
  });
}
export function workspaceList(query:string) {
  return operator(async db=>{
    const spaces=(await db.query<Space>(`select ${timeSpace} from workspaces where $1='' or id::text=$1 or strpos(lower(name),lower($1))>0 order by created_at desc,id limit 100`,[query])).rows;
    const ids=spaces.map(w=>w.id);
    const subs=(await db.query<Subscription>(`select ${timeSub} from subscriptions s where workspace_id=any($1::uuid[])`,[ids])).rows;
    const counts=(await db.query<{workspace_id:string;total:string;live:string}>("select workspace_id,count(*) as total,count(*) filter(where status='published') as live from forms where workspace_id=any($1::uuid[]) group by workspace_id",[ids])).rows;
    const usage=(await db.query<Usage>(`select ${timeUsage} from usage_monthly where workspace_id=any($1::uuid[]) and month=date_trunc('month',now() at time zone 'UTC')::date`,[ids])).rows;
    return {spaces,subByWs:new Map(subs.map(s=>[s.workspace_id,s])),formCount:new Map(counts.map(r=>[r.workspace_id,{total:Number(r.total),live:Number(r.live)}])),usageByWs:new Map(usage.map(u=>[u.workspace_id,Number(u.completed_submissions)]))};
  });
}
export function workspaceDetail(id:string) {
  return operator(async db=>{
    const ws=(await db.query<Space>(`select ${timeSpace} from workspaces where id=$1`,[id])).rows[0];
    if(!ws) return null;
    const sub=(await db.query<Subscription>(`select ${timeSub} from subscriptions s where workspace_id=$1`,[id])).rows[0] ?? null;
    const members=(await db.query<{user_id:string;role:string;created_at:string}>('select user_id,role,created_at::text from workspace_members where workspace_id=$1',[id])).rows;
    const forms=(await db.query<Form>(`select ${timeForm} from forms where workspace_id=$1 order by updated_at desc,id limit 100`,[id])).rows;
    const usage=(await db.query<Usage>(`select ${timeUsage} from usage_monthly where workspace_id=$1 and month=date_trunc('month',now() at time zone 'UTC')::date`,[id])).rows[0] ?? null;
    const history=(await db.query<Usage & {month:string}>('select month::text,completed_submissions::float8,notification_emails::float8,webhook_attempts::float8 from usage_monthly where workspace_id=$1 order by month desc limit 6',[id])).rows;
    const metrics=(await db.query<{storage:string;live:string}>("select (select coalesce(sum(size_bytes),0) from uploaded_files where workspace_id=$1 and status<>'deleted') as storage,(select count(*) from forms where workspace_id=$1 and status='published') as live",[id])).rows[0];
    const credits=(await db.query<{balance:string}>('select balance from ai_credits where workspace_id=$1',[id])).rows[0] ?? null;
    const kits=(await db.query<{id:string;name:string;is_default:boolean}>('select id,name,is_default from brand_kits where workspace_id=$1 order by is_default desc,name,id',[id])).rows;
    const audit=(await db.query<Audit>(`select ${timeAudit} from audit_logs where workspace_id=$1 order by created_at desc,id desc limit 20`,[id])).rows;
    const membersUsers=await users(db,'',members.map(m=>m.user_id));
    return {ws,sub,members,forms,usage,history,storage:Number(metrics.storage),live:Number(metrics.live),credits,kits,audit,emails:new Map(membersUsers.filter(u=>u.email).map(u=>[u.id,u.email!]))};
  });
}
export function auditList(query:string) {
  return operator(async db=>(await db.query<Audit>(`select ${timeAudit} from audit_logs where $1='' or strpos(lower(action),lower($1))>0 or workspace_id::text=$1 or actor_user_id::text=$1 or target_id=$1 order by created_at desc,id desc limit 200`,[query])).rows);
}
export function billingList() {
  return operator(async db=>{
    const subs=(await db.query<Subscription>(`select ${timeSub} from subscriptions s where status<>'free' order by s.updated_at desc,s.id desc limit 200`)).rows;
    const events=(await db.query<{event_id:string;event_type:string;status:string;received_at:string;processed_at:string|null}>('select event_id,event_type,status,received_at::text,processed_at::text from razorpay_webhook_events order by received_at desc,event_id limit 30')).rows;
    const spaces=(await db.query<Space>(`select ${timeSpace} from workspaces where id=any($1::uuid[])`,[subs.map(s=>s.workspace_id)])).rows;
    const revenue=await revenueData(db);
    return {subs,events,revenue,nameById:new Map(spaces.map(w=>[w.id,w.name]))};
  });
}
async function revenueData(db:PoolClient) {
  const groups=(await db.query<{plan_code:string;status:string;billing_interval:string|null;count:number}>('select plan_code,status,billing_interval,count(*)::integer as count from subscriptions group by plan_code,status,billing_interval')).rows;
  return revenueSnapshot(groups);
}
export function overview() {
  return operator(async db=>{
    const userCounts=(await db.query<{data:{users:number;users7d:number;users30d:number;signups:Array<{at:string;count:number}>}}>('select platform.operator_user_counts() as data')).rows[0].data;
    const spaces=(await db.query<{active:number;suspended:number}>("select count(*) filter(where status='active')::integer as active,count(*) filter(where status='suspended')::integer as suspended from workspaces")).rows[0];
    const forms=(await db.query<{published:number;closed:number}>("select count(*) filter(where status='published')::integer as published,count(*) filter(where status='closed')::integer as closed from forms")).rows[0];
    const responses=(await db.query<{today:number;seven:number;thirty:number}>("select count(*) filter(where submitted_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')::integer as today,count(*) filter(where submitted_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'-interval '7 days')::integer as seven,count(*) filter(where submitted_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'-interval '30 days')::integer as thirty from submissions")).rows[0];
    const days=(await db.query<{at:string;count:number}>("select (submitted_at at time zone 'UTC')::date::text as at,count(*)::integer as count from submissions where submitted_at>=now()-interval '31 days' group by 1")).rows;
    const metrics=(await db.query<{storage:string;spent:string}>("select (select coalesce(sum(size_bytes),0) from uploaded_files where status<>'deleted') as storage,(select coalesce(sum(-delta),0) from ai_credit_ledger where delta<0 and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'-interval '30 days') as spent")).rows[0];
    const dl=(await db.query<{http_status:number|null}>('select http_status from webhook_deliveries order by delivered_at desc nulls first,id limit 500')).rows;
    const top=(await db.query<Usage & {name:string;plan_code:string;status:string}>("select u.workspace_id,u.completed_submissions::float8,u.notification_emails::float8,u.webhook_attempts::float8,u.file_storage_bytes::float8,w.name,s.plan_code,s.status from usage_monthly u join workspaces w on w.id=u.workspace_id left join subscriptions s on s.workspace_id=w.id where u.month=date_trunc('month',now() at time zone 'UTC')::date order by u.completed_submissions desc,u.workspace_id limit 10")).rows;
    const bursts=(await db.query<{form_id:string;n:number}>("select form_id,count(*)::integer as n from submissions where submitted_at>=now()-interval '1 hour' group by form_id having count(*)>=100 order by n desc,form_id limit 5")).rows;
    const revenue=await revenueData(db);
    return {users:userCounts.users,users7d:userCounts.users7d,users30d:userCounts.users30d,workspaces:spaces.active,suspendedWs:spaces.suspended,
      publishedForms:forms.published,closedForms:forms.closed,subsToday:responses.today,subs7d:responses.seven,subs30d:responses.thirty,
      revenue,storageBytes:Number(metrics.storage),dl,failedDl:dl.filter(d=>d.http_status===null||d.http_status>=400).length,creditsSpent:Number(metrics.spent),
      responseSeries:dailySeries(days,30,'responses'),signupSeries:dailySeries(userCounts.signups,30,'signups'),
      planMix:[{label:'Free',count:revenue.byPlan.free},{label:'Starter',count:revenue.byPlan.starter},{label:'Pro',count:revenue.byPlan.pro}],
      bursty:bursts.map(r=>[r.form_id,r.n] as [string,number]),top,nameById:new Map(top.map(w=>[w.workspace_id,w.name])),planById:new Map(top.map(s=>[s.workspace_id,s]))};
  });
}
export function usageOverview() {
  return operator(async db=>{
    const usage=(await db.query<Usage>("select * from usage_monthly where month=date_trunc('month',now() at time zone 'UTC')::date")).rows;
    const files=(await db.query<{workspace_id:string;storage:string;brand:string}>("select workspace_id,sum(size_bytes) as storage,coalesce(sum(size_bytes) filter(where kind<>'submission'),0) as brand from uploaded_files where status<>'deleted' group by workspace_id")).rows;
    const ledger=(await db.query<{workspace_id:string;spent:string}>("select workspace_id,sum(-delta) as spent from ai_credit_ledger where delta<0 and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' group by workspace_id")).rows;
    const subs=(await db.query<Subscription>(`select ${timeSub} from subscriptions s`)).rows;
    const outbox=(await db.query<{data:Record<string,number>}>('select platform.operator_outbox_summary() as data')).rows[0].data;
    const usageMap=new Map(usage.map(u=>[u.workspace_id,u])),storageMap=new Map(files.map(f=>[f.workspace_id,Number(f.storage)])),creditMap=new Map(ledger.map(l=>[l.workspace_id,Number(l.spent)]));
    const planMap=new Map(subs.map(s=>[s.workspace_id,resolveEffectivePlan(s).plan]));
    const ids=[...new Set([...usageMap.keys(),...storageMap.keys(),...creditMap.keys()])];
    const spaces=(await db.query<Space>(`select ${timeSpace} from workspaces where id=any($1::uuid[])`,[ids])).rows;
    const nameMap=new Map(spaces.map(w=>[w.id,w.name]));
    const merged=ids.map(id=>{const u=usageMap.get(id),plan=planMap.get(id) ?? 'free',storage=storageMap.get(id) ?? 0;return {id,name:nameMap.get(id) ?? id,plan,responses:Number(u?.completed_submissions ?? 0),emails:Number(u?.notification_emails ?? 0),webhooks:Number(u?.webhook_attempts ?? 0),storage,credits:creditMap.get(id) ?? 0,quota:pct(Number(u?.completed_submissions ?? 0),PLANS[plan].entitlements.monthlySubmissions),storageQuota:pct(storage,PLANS[plan].entitlements.storageBytes)};}).sort((a,b)=>b.responses-a.responses||b.storage-a.storage);
    const totals=merged.reduce((sum,r)=>({responses:sum.responses+r.responses,emails:sum.emails+r.emails,webhooks:sum.webhooks+r.webhooks,storage:sum.storage+r.storage,credits:sum.credits+r.credits}),{responses:0,emails:0,webhooks:0,storage:0,credits:0});
    return {merged:merged.slice(0,100),totals,brandBytes:files.reduce((sum,f)=>sum+Number(f.brand),0),obFailed:outbox.failed ?? 0};
  });
}
export function moderateWorkspace(id:string,status:'active'|'suspended',reason:string) {
  return operator(async db=>(await db.query<{ok:boolean}>('select platform.moderate_workspace($1,$2,$3) as ok',[id,status,reason])).rows[0].ok);
}
export function moderateForm(id:string,suspend:boolean,reason:string) {
  return operator(async db=>{
    const sub=(await db.query<Subscription>('select s.* from subscriptions s join forms f on f.workspace_id=s.workspace_id where f.id=$1',[id])).rows[0];
    const max=PLANS[resolveEffectivePlan(sub ?? null).plan].entitlements.maxActiveForms;
    return (await db.query<{ok:boolean}>('select platform.moderate_form_checked($1,$2,$3,$4) as ok',[id,suspend,reason,max])).rows[0].ok;
  });
}
export function overridePlan(id:string,plan:string|null,reason:string|null,expires:string|null) {
  return operator(async db=>(await db.query<{ok:boolean}>('select platform.set_override($1,$2,$3,$4) as ok',[id,plan,reason,expires])).rows[0].ok);
}
