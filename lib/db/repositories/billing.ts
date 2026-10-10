import { getDatabasePool,withUserTransaction } from "@/lib/db/pool";
import type { BillingInterval,PlanCode } from "@/lib/plans";
import type { StoredSubscription } from "@/lib/billing/subscriptions";
export interface SubscriptionRow extends StoredSubscription {provider_subscription_id:string|null;billing_interval:BillingInterval|null;current_period_end:string|null;cancel_at_period_end:boolean}
export async function subscription(userId:string,workspace:string):Promise<SubscriptionRow|null> {
  return withUserTransaction(userId,async db => (await db.query<SubscriptionRow>("select plan_code,status,provider_subscription_id,billing_interval,current_period_end::text,cancel_at_period_end,override_plan_code,override_reason,override_expires_at::text from subscriptions where workspace_id=$1",[workspace])).rows[0] ?? null);
}
export async function beginCheckout(userId:string,workspace:string,plan:PlanCode,interval:BillingInterval):Promise<{token?:string;subscriptionId?:string}> {
  return withUserTransaction(userId,async db => (await db.query<{data:{token?:string;subscriptionId?:string}}>("select platform.begin_checkout($1,$2,$3) as data",[workspace,plan,interval])).rows[0].data);
}
export async function completeCheckout(userId:string,workspace:string,token:string,id:string,planId:string,plan:PlanCode,interval:BillingInterval):Promise<boolean> {
  return withUserTransaction(userId,async db => (await db.query<{ok:boolean}>("select platform.complete_checkout($1,$2,$3,$4,$5,$6) as ok",[workspace,token,id,planId,plan,interval])).rows[0].ok);
}
export async function abortCheckout(userId:string,workspace:string,token:string):Promise<void> {
  await withUserTransaction(userId,db=>db.query("select platform.abort_checkout($1,$2)",[workspace,token]));
}
export async function requestCancellation(userId:string,workspace:string,id:string):Promise<boolean> {
  return withUserTransaction(userId,async db => (await db.query<{ok:boolean}>("select platform.request_cancellation($1,$2) as ok",[workspace,id])).rows[0].ok);
}
export async function purchaseCredits(userId:string,workspace:string,amount:number,paymentId:string):Promise<number> {
  return withUserTransaction(userId,async db => Number((await db.query<{balance:string}>("select platform.purchase_credits($1,$2,$3) as balance",[workspace,amount,paymentId])).rows[0].balance));
}
export async function applyBillingEvent(input:{id:string;event:string;hash:string;providerId:string|null;snapshot:Record<string,unknown>|null;observed:string}):Promise<{ok:boolean;duplicate?:boolean;orphan?:boolean;ignored?:boolean}> {
  return (await getDatabasePool().query<{data:{ok:boolean;duplicate?:boolean;orphan?:boolean;ignored?:boolean}}>("select platform.apply_billing_event($1,$2,$3,$4,$5,$6) as data",[input.id,input.event,input.hash,input.providerId,JSON.stringify(input.snapshot),input.observed])).rows[0].data;
}
export async function readUsage(userId:string,workspace:string) {
  return withUserTransaction(userId,async db => {
    const usage=(await db.query<{completed_submissions:number;notification_emails:number}>("select completed_submissions::integer,notification_emails::integer from usage_monthly where workspace_id=$1 and month=date_trunc('month',now() at time zone 'UTC')::date",[workspace])).rows[0] ?? {completed_submissions:0,notification_emails:0};
    const data=(await db.query<{active:string;storage:string}>("select (select count(*) from forms where workspace_id=$1 and status='published') as active,(select coalesce(sum(size_bytes),0) from uploaded_files where workspace_id=$1 and status<>'deleted') as storage",[workspace])).rows[0];
    return {usage,activeForms:Number(data.active),storage:Number(data.storage)};
  });
}
