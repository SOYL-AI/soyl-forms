import "server-only";
import { getAuthSessionCookie } from "@/lib/auth/session";
import { deleteDirectoryUser } from "@/lib/auth/directory";
import { getDatabasePool,withUserTransaction } from "@/lib/db/pool";
import { deleteR2Object } from "@/lib/r2";
import { fetchRazorpay,postRazorpay } from "@/lib/billing/provider-api";

export async function requestDeletion(userId:string):Promise<{ok:true;pending:true}|{ok:false;error:string}> {
  try {
    await withUserTransaction(userId,db=>db.query('select platform.request_account_deletion()'));
    (await getAuthSessionCookie()).destroy();
    return {ok:true,pending:true};
  } catch(error) {
    const reauthenticate=error instanceof Error && error.message==='Sign out and sign in again before deleting your account';
    console.error(JSON.stringify({event:'account_deletion_request_failed',reauthenticate}));
    return {ok:false,error:reauthenticate?'Sign out and sign in again before deleting your account.':'Could not request deletion. Please try again.'};
  }
}

interface DeletionJob {
  id:string;lease_token:string;billing_done:boolean;provider_done:boolean;
  providers:Array<{issuer:string;objectId:string}>;subscriptions:string[];objects:string[];
}
export async function processAccountDeletion(deadline=Date.now()+40_000):Promise<{requested:boolean;completed:boolean}> {
  const db=getDatabasePool();
  const job=(await db.query<{data:DeletionJob|null}>('select platform.claim_account_deletion() as data')).rows[0].data;
  if(!job) return {requested:false,completed:false};
  async function checkpoint(stage:string,key:string|null=null) {
    if(Date.now()>deadline) throw new Error('Deletion time budget reached');
    const ok=(await db.query<{ok:boolean}>('select platform.checkpoint_account_deletion($1,$2,$3,$4) as ok',[job!.id,job!.lease_token,stage,key])).rows[0].ok;
    if(!ok) throw new Error('Deletion lease expired');
  }
  try {
    if(!job.billing_done) {
      for(const id of job.subscriptions) {
        const sub=await fetchRazorpay<{id:string;status:string}>('subscriptions',id);
        if(sub.id!==id) throw new Error('Invalid subscription reference');
        if(!['cancelled','expired','completed'].includes(sub.status)) {
          const cancelled=await postRazorpay<{status:string}>(`subscriptions/${id}/cancel`,{cancel_at_cycle_end:0});
          if(cancelled.status!=='cancelled') throw new Error('Subscription cancellation has not finished');
        }
        if(Date.now()>deadline) throw new Error('Deletion time budget reached');
      }
      await checkpoint('billing');
    }
    for(const key of job.objects) {
      if(Date.now()>deadline) throw new Error('Deletion time budget reached');
      await deleteR2Object(key);
      await checkpoint('object',key);
    }
    if(!job.provider_done) {
      for(const provider of job.providers) await deleteDirectoryUser(provider);
      await checkpoint('provider');
    }
    const completed=(await db.query<{ok:boolean}>('select platform.finish_account_deletion($1,$2) as ok',[job.id,job.lease_token])).rows[0].ok;
    return {requested:true,completed};
  } catch {
    // The durable request and completed stages remain. Never log identity/file/provider payloads.
    console.error(JSON.stringify({event:'account_deletion_retry',requestId:job.id}));
    return {requested:true,completed:false};
  }
}
