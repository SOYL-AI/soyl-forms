import { getDatabasePool } from "@/lib/db/pool";
import type { Answers } from "@/types/forms";
import type { StoredSubscription } from "@/lib/billing/subscriptions";
export interface JobPayload {submissionId?:string;formId?:string;owners?:boolean;respondent?:boolean;hooks?:string[];notified?:boolean}
export interface JobLease {id:string;lease_token:string;workspace_id:string;attempts:number;payload:JobPayload}
export interface JobContext {submission:{id:string;form_id:string;form_version_id:string;submitted_at:string;answers:Answers}|null;version:{schema:unknown;settings:unknown}|null;subscription:StoredSubscription|null;hooks:Array<{id:string;delivered:boolean}>}
async function call<T>(sql:string,args:unknown[]=[]):Promise<T> {return (await getDatabasePool().query<{data:T}>(sql,args)).rows[0].data;}
export function claimJob():Promise<JobLease|null> {return call('select platform.claim_job() as data');}
export function jobContext(job:JobLease):Promise<JobContext|null> {return call('select platform.job_context($1,$2) as data',[job.id,job.lease_token]);}
export function checkpointJob(job:JobLease,payload:JobPayload):Promise<boolean> {return call('select platform.checkpoint_job($1,$2,$3) as data',[job.id,job.lease_token,JSON.stringify(payload)]);}
export function finishJob(job:JobLease,payload:JobPayload,ok:boolean,uncertain:boolean):Promise<boolean> {return call('select platform.finish_job($1,$2,$3,$4,$5) as data',[job.id,job.lease_token,JSON.stringify(payload),ok,uncertain]);}
export interface EmailReservation {status:string;created_at:string;request:unknown}
export function reserveEmail(job:Pick<JobLease,'id'|'lease_token'>,key:string,limit:number,quantity:number,mail:unknown):Promise<EmailReservation|null> {
  return call('select platform.reserve_email($1,$2,$3,$4,$5,$6) as data',[job.id,job.lease_token,key,limit,quantity,JSON.stringify(mail)]);
}
export function completeEmail(job:Pick<JobLease,'id'|'lease_token'>,key:string):Promise<boolean> {return call('select platform.complete_email($1,$2,$3) as data',[job.id,job.lease_token,key]);}
export function cleanupUploads():Promise<Array<{id:string;r2_key:string}>> {return call('select platform.cleanup_uploads() as data');}
export function completeCleanup(id:string,key:string):Promise<boolean> {return call('select platform.complete_upload_cleanup($1,$2) as data',[id,key]);}
export function cleanupExpiredData():Promise<number> {return call('select platform.cleanup_expired_data() as data');}
export interface QueueStatus {pending:number;processing:number;failed24h:number;oldestPendingSeconds:number;accountDeletions:number;oldestDeletionSeconds:number}
export function queueStatus():Promise<QueueStatus> {return call('select platform.worker_queue_status() as data');}
