import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';

const origin='https://soyl-forms-web.wonderfuldesert-0fe0498b.centralindia.azurecontainerapps.io';
const recipient=process.env.EMAIL_TEST_RECIPIENT;
if(process.env.QA_RUN!=='true' || !recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error('An explicitly authorized recipient and staging QA configuration are required.');
const url=new URL(process.env.DATABASE_MIGRATION_URL ?? '');
if(url.hostname!=='soyl-forms-pg-n4nsiocbpshei.postgres.database.azure.com' || url.pathname!=='/soyl_forms') throw new Error('Expected staging database.');
for(const key of ['sslmode','sslcert','sslkey','sslrootcert','ssl','uselibpqcompat']) url.searchParams.delete(key);
const db=new pg.Client({connectionString:url.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:5000});
const user=randomUUID(),form=randomUUID(),run=randomUUID(),label=`STAGING email acceptance ${run}`;
let workspace,verified=false;
try {
  await db.connect();
  await db.query('begin');
  await db.query('insert into app_users(id,display_name) values($1,$2)',[user,label]);
  await db.query("select set_config('app.user_id',$1,true)",[user]);
  workspace=(await db.query('select * from platform.ensure_personal_workspace(10)')).rows[0].workspace_id;
  // A clearly labelled, temporary entitlement fixture; no provider subscription
  // or charge is created. It exercises the actual paid-notification code path.
  await db.query("update subscriptions set plan_code='starter',override_plan_code='starter',override_reason='STAGING email acceptance fixture',override_expires_at=now()+interval '1 day' where workspace_id=$1",[workspace]);
  const schema={schemaVersion:1,title:'SOYL Forms Azure email delivery test',blocks:[{id:'q',type:'short_text',title:'Verification',required:true}],logic:[]};
  const settings={notifyEmails:[recipient],responderEnabled:false};
  const slug=`qa-email-${run}`;
  await db.query("insert into forms(id,workspace_id,created_by,title,slug,draft_schema,theme,settings) values($1,$2,$3,$4,$5,$6,'{}',$7)",[form,workspace,user,schema.title,slug,JSON.stringify(schema),JSON.stringify(settings)]);
  const version=(await db.query("select * from platform.publish_form($1,$2,'{}',$3,2)",[form,JSON.stringify(schema),JSON.stringify(settings)])).rows[0].version_id;
  await db.query('commit');
  const response=await fetch(`${origin}/api/public/forms/${slug}/submit`,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({formVersionId:version,idempotencyKey:randomUUID(),sessionId:randomUUID(),answers:{q:{type:'short_text',value:'This single test confirms that a real form response can trigger an Azure email notification.'}}}),signal:AbortSignal.timeout(20_000),redirect:'error'});
  const body=await response.json();
  if(response.status!==200 || !body.submissionId) throw new Error('Staging email fixture submission failed.');
  console.log(JSON.stringify({event:'azure_email_outbox_fixture_submitted',run}));
  const until=Date.now()+600_000;
  while(Date.now()<until) {
    const row=(await db.query("select e.status,e.id,r.status as email_status,r.provider_operation_id from outbox_events e left join email_reservations r on r.key=e.id||':owners' where e.workspace_id=$1 and e.payload->>'submissionId'=$2",[workspace,body.submissionId])).rows[0];
    if(row?.status==='completed' && row.email_status==='sent' && row.provider_operation_id) {
      const usage=(await db.query("select completed_submissions,notification_emails from usage_monthly where workspace_id=$1",[workspace])).rows[0];
      if(Number(usage.completed_submissions)!==1 || Number(usage.notification_emails)!==1) throw new Error('Notification accounting mismatch.');
      console.log(JSON.stringify({event:'azure_email_outbox_verified',run,operationId:row.provider_operation_id,submissions:1,notificationEmails:1,providerSucceeded:true}));
      verified=true;
      break;
    }
    if(row?.status==='failed') throw new Error('Email outbox entered terminal failure.');
    if(Date.now()+10_000>=until) throw new Error('Email outbox did not finish before the deadline.');
    await pause(10_000);
  }
  if(!verified) throw new Error('Email outbox did not finish before the deadline.');
} catch {
  await db.query('rollback').catch(()=>{});
  console.error(JSON.stringify({event:'azure_email_outbox_verification_failed',run}));
  process.exitCode=1;
} finally {
  if(workspace) await db.query('delete from workspaces where id=$1 and owner_user_id=$2',[workspace,user]);
  await db.query('delete from app_users where id=$1 and display_name=$2',[user,label]).catch(()=>{});
  await db.end();
  console.log(JSON.stringify({event:'azure_email_outbox_fixtures_removed',run}));
}
