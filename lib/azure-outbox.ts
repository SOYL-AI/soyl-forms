import { NextResponse } from "next/server";
import * as jobs from "@/lib/db/repositories/jobs";
import { formSchemaV1,formSettingsSchema } from "@/lib/forms/schema";
import { resolveEffectivePlan } from "@/lib/billing/subscriptions";
import { PLANS } from "@/lib/plans";
import { deliverToWebhook } from "@/lib/webhooks/deliver";
import { deliverEmail } from "@/lib/email/deliver";
import { isEmailConfigured,responseEmail,confirmationEmail,resolveResponderRecipient } from "@/lib/email/resend";
import { displayAnswer } from "@/lib/forms/answers";
import { recallText } from "@/lib/forms/recall";
import { isAnswerable } from "@/lib/forms/logic";
import { submissionFields } from "@/lib/forms/csv";
import { getAppUrl,getProductName } from "@/lib/config";

export async function runAzureOutbox() {
  let delivered=0,failed=0,emails=0;
  const started=Date.now();
  const configured=Number(process.env.OUTBOX_BATCH_SIZE ?? 500);
  const batchSize=Number.isInteger(configured) ? Math.min(1000,Math.max(1,configured)) : 500;
  try {
    for(let i=0;i<batchSize && Date.now()-started<30_000;i++) {
      const job=await jobs.claimJob();
      if(!job) break;
      const payload={...job.payload,hooks:[...(job.payload.hooks ?? [])]};
      if(payload.notified){payload.owners=true;payload.respondent=true;}
      let ok=true,uncertain=false;
      const checkpoint=async () => {if(!await jobs.checkpointJob(job,payload)) throw new Error('Outbox lease lost');};
      try {
        const context=await jobs.jobContext(job);
        if(!context) throw new Error('Outbox lease or workspace unavailable');
        const submission=context.submission;
        if(submission) {
          const parsed=formSchemaV1.safeParse(context.version?.schema);
          const settings=formSettingsSchema.safeParse(context.version?.settings);
          if(!parsed.success || !settings.success) throw new Error('Original form version unavailable');
          const schema=parsed.data,config=settings.data;
          const ent=PLANS[resolveEffectivePlan(context.subscription).plan].entitlements;
          const rows=schema.blocks.filter(b=>isAnswerable(b.type)).map(b=>({question:recallText(b.title,schema.blocks,submission.answers),answer:displayAnswer(b,submission.answers[b.id])}));
          const send=async (kind:'owners'|'respondent') => {
            if(payload[kind]) return;
            const recipients=kind==='owners' ? config.notifyEmails ?? [] : config.responderEnabled ? [resolveResponderRecipient(schema.blocks,submission.answers,config.responderQuestionId)].filter((x):x is string=>Boolean(x)) : [];
            if(!recipients.length || !ent.emailNotifications) {payload[kind]=true;await checkpoint();return;}
            if(!isEmailConfigured()) {ok=false;return;}
            await checkpoint();
            const mail=kind==='owners' ? responseEmail({formTitle:schema.title,submittedAt:submission.submitted_at,rows,responseUrl:`${getAppUrl()}/forms/${submission.form_id}/responses/${submission.id}`,productName:getProductName()}) :
              confirmationEmail({formTitle:schema.title,subject:config.responderSubject,message:config.responderMessage,rows,productName:getProductName()});
            const outcome=await deliverEmail(`${job.id}:${kind}`,job.workspace_id,ent.monthlyNotificationEmails,{to:recipients,...mail,...(kind==='respondent'?{replyTo:config.notifyEmails?.[0]}:{})},job);
            if(outcome==='sent') emails++;
            if(outcome==='failed') ok=false;
            else if(outcome==='uncertain') {ok=false;uncertain=true;}
            else {payload[kind]=true;await checkpoint();}
          };
          await send('owners');await send('respondent');
          const event={eventId:job.id,formId:submission.form_id,submissionId:submission.id,submittedAt:submission.submitted_at,answers:submission.answers,fields:submissionFields(schema.blocks,submission.answers)};
          for(const hook of context.hooks) {
            if(payload.hooks.includes(hook.id)) continue;
            await checkpoint();
            if(!hook.delivered && !(await deliverToWebhook(hook.id,event,job.attempts,{lease:job})).ok) {ok=false;continue;}
            payload.hooks.push(hook.id);await checkpoint();
          }
        }
      } catch {ok=false;console.error(JSON.stringify({event:'azure_outbox_processing_failed',eventId:job.id}));}
      const terminal=!ok && (job.attempts>=5 || uncertain);
      if(await jobs.finishJob(job,payload,ok,uncertain)) {if(ok) delivered++;else if(terminal) failed++;}
      else console.error(JSON.stringify({event:'azure_outbox_lease_lost',eventId:job.id}));
    }
    return NextResponse.json({ok:true,delivered,failed,emails,queue:await jobs.queueStatus()});
  } catch {return NextResponse.json({error:'Could not process queued events. Please retry.'},{status:503});}
}
