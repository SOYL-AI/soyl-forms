import { getDatabasePool,withUserTransaction } from "@/lib/db/pool";
import type { WebhookSummary } from "@/lib/forms/actions";
import type { JobLease } from "./jobs";
export async function listWebhooks(userId:string,form:string):Promise<WebhookSummary[]> {
  return withUserTransaction(userId,async db => (await db.query<WebhookSummary>('select id,url,is_active,events,created_at::text from webhooks where form_id=$1 order by created_at desc,id',[form])).rows);
}
export async function readWebhook(userId:string,id:string):Promise<{id:string;form_id:string;url:string;is_active:boolean}|null> {
  return withUserTransaction(userId,async db => (await db.query<{id:string;form_id:string;url:string;is_active:boolean}>('select id,form_id,url,is_active from webhooks where id=$1',[id])).rows[0] ?? null);
}
export async function createWebhook(userId:string,form:string,url:string,encrypted:string,max:number):Promise<string> {
  return withUserTransaction(userId,async db => (await db.query<{id:string}>('select platform.create_webhook($1,$2,$3,$4) as id',[form,url,encrypted,max])).rows[0].id);
}
export async function changeWebhook(userId:string,id:string,active:boolean|null):Promise<boolean> {
  return withUserTransaction(userId,async db => (await db.query<{ok:boolean}>('select platform.change_webhook($1,$2) as ok',[id,active])).rows[0].ok);
}
export interface DeliveryWebhook {id:string;url:string;secret_encrypted:string;is_active:boolean}
export async function deliveryWebhook(userId:string|null,id:string,lease?:Pick<JobLease,'id'|'lease_token'>):Promise<DeliveryWebhook|null> {
  const work=async (db:Pick<ReturnType<typeof getDatabasePool>,'query'>) => (await db.query<{data:DeliveryWebhook|null}>('select platform.delivery_webhook($1,$2,$3) as data',[id,lease?.id ?? null,lease?.lease_token ?? null])).rows[0].data;
  return userId ? withUserTransaction(userId,work) : work(getDatabasePool());
}
export async function recordDelivery(userId:string|null,id:string,eventId:string,attempt:number,status:number|null,error:string|null,lease?:Pick<JobLease,'id'|'lease_token'>):Promise<boolean> {
  const work=async (db:Pick<ReturnType<typeof getDatabasePool>,'query'>) => (await db.query<{ok:boolean}>('select platform.record_delivery($1,$2,$3,$4,$5,$6) as ok',[id,eventId,attempt,status,error,lease?.lease_token ?? null])).rows[0].ok;
  return userId ? withUserTransaction(userId,work) : work(getDatabasePool());
}
