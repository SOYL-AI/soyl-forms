import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {S3Client,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {setTimeout as pause} from 'node:timers/promises';

// Deliberately cannot target production. Fixtures are labelled and removed in finally.
const origin='https://soyl-forms-web.wonderfuldesert-0fe0498b.centralindia.azurecontainerapps.io';
if(process.env.APP_ORIGIN!==origin || process.env.QA_RUN!=='true') throw new Error('Explicit staging-only QA configuration is required');
const raw=new URL(process.env.DATABASE_MIGRATION_URL ?? '');
if(raw.hostname!=='soyl-forms-pg-n4nsiocbpshei.postgres.database.azure.com' || raw.pathname!=='/soyl_forms') throw new Error('Expected isolated staging database');
for(const key of ['sslmode','sslcert','sslkey','sslrootcert','ssl','uselibpqcompat']) raw.searchParams.delete(key);
const db=new pg.Client({connectionString:raw.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:5000});
const run=randomUUID();const users=[],spaces=[],forms=[],acks=new Set();
const load=process.argv.includes('--load');
const hot=process.argv.includes('--hot');
if(load && hot) throw new Error('Choose one acceptance mode');
const schema={schemaVersion:1,title:`STAGING acceptance fixture ${run}`,blocks:[{id:'q',type:'short_text',title:'Test answer',required:true},{id:'file',type:'file_upload',title:'Test upload',required:false,maxSizeMb:1,allowedMimes:['image/png']}],logic:[]};
const stats={};
let completed=false;
function assert(value,message) {if(!value) throw new Error(message);}
async function http(path,body,method=body===undefined?'GET':'POST',headers={}) {
  const response=await fetch(origin+path,{method,body:body===undefined?undefined:JSON.stringify(body),headers:{...(body===undefined?{}:{'content-type':'application/json'}),...headers},redirect:'manual',signal:AbortSignal.timeout(20_000)});
  const text=await response.text();let json;
  try {json=JSON.parse(text);} catch {json=null;}
  return {status:response.status,json,text,location:response.headers.get('location')};
}
async function submit(form,extra={}) {
  const input={formVersionId:form.version,idempotencyKey:randomUUID(),sessionId:randomUUID(),answers:{q:{type:'short_text',value:'Synthetic staging acceptance answer'}},...extra};
  const response=await http(`/api/public/forms/${form.slug}/submit`,input);
  if(response.status===200 && response.json?.submissionId) acks.add(response.json.submissionId);
  return {response,input};
}
async function seed() {
  const count=load?100:2,rows=load?100:2;
  for(let i=0;i<count;i++) {
    const user=randomUUID();users.push(user);
    await db.query('begin');
    try {
      await db.query("insert into app_users(id,display_name) values($1,'STAGING automated acceptance fixture')",[user]);
      await db.query("select set_config('app.user_id',$1,true)",[user]);
      const workspace=(await db.query('select * from platform.ensure_personal_workspace(10)')).rows[0].workspace_id;spaces.push(workspace);
      const id=randomUUID(),slug=`qa-${run}-${i}`;
      await db.query('insert into forms(id,workspace_id,created_by,title,slug,draft_schema,theme,settings) values($1,$2,$3,$4,$5,$6,\'{}\',\'{}\')',[id,workspace,user,schema.title,slug,JSON.stringify(schema)]);
      const version=(await db.query("select * from platform.publish_form($1,$2,'{}','{}',2)",[id,JSON.stringify(schema)])).rows[0].version_id;
      await db.query("insert into submissions(workspace_id,form_id,form_version_id,idempotency_key,answers) select $1,$2,$3,'seed-'||n,jsonb_build_object('q',jsonb_build_object('type','short_text','value','Synthetic seed '||n)) from generate_series(1,$4::int) n",[workspace,id,version,rows]);
      await db.query("insert into usage_monthly(workspace_id,month,completed_submissions) values($1,date_trunc('month',now() at time zone 'UTC')::date,$2) on conflict(workspace_id,month) do update set completed_submissions=$2",[workspace,rows]);
      forms.push({id,slug,version,user,workspace,seed:rows});
      await db.query('commit');
    } catch(error) {await db.query('rollback');throw error;}
  }
  console.log(JSON.stringify({event:'staging_fixtures_created',run,workspaces:count,seedResponses:count*rows}));
}
async function workflow() {
  const form=forms[0],sessionId=randomUUID(),idempotencyKey=randomUUID();
  const path=`/api/public/forms/${form.slug}`;
  assert((await http(`/f/${form.slug}`)).status===200,'Published form SSR unavailable');
  assert((await http(path+'/start',{sessionId,formVersionId:form.version})).status===200,'Visit start failed');
  assert((await http(path+'/progress',{sessionId,formVersionId:form.version,blockId:'q'})).status===200,'Visit progress failed');
  const answers={q:{type:'short_text',value:'Synthetic resumed response'}};
  const saved=await http(path+'/resume',{sessionId,idempotencyKey,formVersionId:form.version,answers,history:['q'],currentId:'q'},'PUT');
  assert(saved.status===200 && /^[a-f0-9]{32}$/.test(saved.json?.token),'Resume persistence failed');
  assert((await http(path+`/resume?token=${saved.json.token}`)).status===200,'Resume retrieval failed');
  const input={sessionId,idempotencyKey,formVersionId:form.version,answers,resumeToken:saved.json.token};
  const response=await http(path+'/submit',input);assert(response.status===200 && response.json?.ok,'Submission failed');acks.add(response.json.submissionId);
  const retry=await http(path+'/submit',input);assert(retry.json?.duplicate && retry.json.submissionId===response.json.submissionId,'Submission retry duplicated a response');
  assert((await http(path+`/resume?token=${saved.json.token}`)).status===404,'Submitted resume link remained usable');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7XcAAAAASUVORK5CYII=','base64');
  const upload=await http(path+'/uploads',{formVersionId:form.version,questionId:'file',fileName:'staging-test.png',mimeType:'image/png',sizeBytes:png.length});
  assert(upload.status===200 && upload.json?.uploadUrl,'R2 upload authorization failed');
  const put=await fetch(upload.json.uploadUrl,{method:'PUT',headers:{'content-type':upload.json.contentType,Origin:origin},body:png,signal:AbortSignal.timeout(20_000)});await put.body?.cancel();assert(put.ok,'R2 direct PUT failed');
  const done=await http(path+'/uploads/complete',{fileId:upload.json.fileId,uploadToken:upload.json.uploadToken});assert(done.status===200 && done.json?.ok,'R2 verification/freeze failed');
  assert((await http(`/api/files/${upload.json.fileId}`)).status===401,'Private upload was anonymously readable');
  const attached=await submit(form,{answers:{q:{type:'short_text',value:'Synthetic file response'},file:{type:'file_upload',value:[upload.json.fileId]}}});
  assert(attached.response.status===200 && attached.response.json?.ok,'Verified file could not attach');
  assert((await db.query('select submission_id from uploaded_files where id=$1',[upload.json.fileId])).rows[0].submission_id===attached.response.json.submissionId,'File attachment mismatch');
  console.log(JSON.stringify({event:'staging_http_workflow_passed',resume:true,idempotentSubmit:true,realR2Upload:true,verifiedAttachment:true,privateDownloadDenied:true}));
}
function summarize(samples) {
  const latency=samples.filter(s=>s.status===200).map(s=>s.ms).sort((a,b)=>a-b);
  const percentile=p=>latency.length?Math.round(latency[Math.min(latency.length-1,Math.ceil(latency.length*p)-1)]):null;
  return {requests:samples.length,acknowledged:latency.length,p95Ms:percentile(.95),p99Ms:percentile(.99),rateLimited:samples.filter(s=>s.status===429).length,unexpected:samples.filter(s=>s.status!==200 && s.status!==429).length};
}
async function traffic(name,seconds,rps) {
  const samples=[],active=new Set(),started=Date.now();let lastReport=started;
  for(let n=0;n<seconds*rps;n++) {
    const delay=started+n*1000/rps-Date.now();if(delay>0) await pause(delay);
    while(active.size>=50) await Promise.race(active);
    const form=forms[n%forms.length];
    const task=(async()=>{const time=Date.now();try{const {response}=await submit(form);samples.push({status:response.status,ms:Date.now()-time});}catch{samples.push({status:0,ms:Date.now()-time});}})();
    active.add(task);void task.finally(()=>active.delete(task));
    if(Date.now()-lastReport>=60_000) {lastReport=Date.now();console.log(JSON.stringify({event:'staging_load_progress',phase:name,elapsedSeconds:Math.round((Date.now()-started)/1000),...summarize(samples)}));}
    if(n%20===0) {const read=await http(`/f/${form.slug}`);assert(read.status===200,'Mixed form read failed');}
  }
  await Promise.all(active);stats[name]=summarize(samples);
  console.log(JSON.stringify({event:'staging_load_phase_completed',phase:name,...stats[name]}));
}
async function validateAccounting() {
  const count=(await db.query('select count(*)::int as n,count(distinct id)::int as distinct_n from submissions where workspace_id=any($1::uuid[])',[spaces])).rows[0];
  const expected=forms.reduce((n,f)=>n+f.seed,0)+acks.size;
  assert(count.n===expected && count.distinct_n===expected,'Acknowledged response count mismatch');
  const usage=Number((await db.query('select sum(completed_submissions) as n from usage_monthly where workspace_id=any($1::uuid[])',[spaces])).rows[0].n);
  assert(usage===expected,'Submission quota accounting mismatch');
  console.log(JSON.stringify({event:'staging_response_accounting_verified',seed:expected-acks.size,acknowledged:acks.size,total:expected,usage}));
  const deadline=Date.now()+5*60_000;
  while(Date.now()<deadline) {
    const pending=(await db.query("select count(*)::int as n from outbox_events where workspace_id=any($1::uuid[]) and status<>'completed'",[spaces])).rows[0].n;
    if(!pending) {console.log(JSON.stringify({event:'staging_free_response_outbox_drained'}));return;}
    await pause(15_000);
  }
  throw new Error('Free response outbox did not drain in five minutes');
}
async function cleanup() {
  const files=(await db.query('select r2_key from uploaded_files where workspace_id=any($1::uuid[])',[spaces])).rows;
  const storage=new S3Client({region:'auto',endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY},requestHandler:{connectionTimeout:5000,requestTimeout:10000,throwOnRequestTimeout:true},maxAttempts:2});
  try {for(const file of files) await storage.send(new DeleteObjectCommand({Bucket:process.env.R2_BUCKET_NAME,Key:file.r2_key}));}
  catch {console.error(JSON.stringify({event:'staging_fixture_object_cleanup_failed',run}));throw new Error('Preserve fixture rows until storage cleanup succeeds');}
  finally {storage.destroy();}
  await db.query('begin');
  try {
    await db.query('delete from audit_logs where workspace_id=any($1::uuid[])',[spaces]);
    await db.query("delete from workspaces where id=any($1::uuid[]) and owner_user_id=any($2::uuid[])",[spaces,users]);
    await db.query("delete from app_users where id=any($1::uuid[]) and display_name='STAGING automated acceptance fixture'",[users]);
    await db.query('commit');
    console.log(JSON.stringify({event:'staging_fixtures_removed',run,users:users.length,workspaces:spaces.length,objects:files.length}));
  } catch(error) {await db.query('rollback');throw error;}
}
try {
  await db.connect();
  assert((await http('/api/health/ready')).status===200,'Staging is not ready');
  await seed();await workflow();
  if(load) {
    const simultaneous=await Promise.all(forms.slice(0,50).map(form=>submit(form)));
    assert(simultaneous.every(r=>r.response.status===200),'50 concurrent submissions failed');
    await traffic('steady',1800,5);await traffic('burst',300,10);
  } else if(hot) {
    // Azure jobs can use multiple genuine egress addresses. Verify the shared
    // 20/IP/form/minute limit using new HMAC bucket counts, without spoofing IPs.
    const before=(await db.query('select key from public_rate_limits')).rows.map(row=>row.key);
    const started=Date.now();
    const results=await Promise.all(Array.from({length:50},()=>submit(forms[1])));
    const accepted=results.filter(r=>r.response.status===200).length;
    const limited=results.filter(r=>r.response.status===429).length;
    const buckets=(await db.query('select hits from public_rate_limits where key<>all($1::text[])',[before])).rows;
    stats.hot={requests:50,acknowledged:accepted,intentionalRateLimits:limited,elapsedMs:Date.now()-started,sourceBuckets:buckets.length};
    console.log(JSON.stringify({event:'staging_hot_form_observed',...stats.hot,statuses:results.reduce((counts,r)=>({...counts,[r.response.status]:(counts[r.response.status]??0)+1}),{})}));
    assert(buckets.length>0 && buckets.length<=3 && accepted===buckets.reduce((total,row)=>total+Math.min(row.hits,20),0) && accepted+limited===50 && limited>0 && buckets.every(row=>row.hits<=21),'Hot form rate boundary or concurrent writes failed');
    console.log(JSON.stringify({event:'staging_hot_form_rate_boundary_verified',...stats.hot}));
  } else {
    const simultaneous=await Promise.all(Array.from({length:10},()=>submit(forms[1])));
    assert(simultaneous.every(r=>r.response.status===200),'Concurrent submission smoke failed');
  }
  await validateAccounting();
  if(load) assert(stats.steady.p95Ms<1000 && stats.burst.p95Ms<2000 && stats.steady.unexpected===0 && stats.burst.unexpected===0 && stats.steady.rateLimited===0 && stats.burst.rateLimited===0,'Load acceptance thresholds failed');
  completed=true;console.log(JSON.stringify({event:'staging_acceptance_passed',mode:load?'load':hot?'hot':'smoke',stats,excludes:['interactive browser and Android','paid payment flows','paid notification throughput','hot single-form distributed traffic']}));
} catch(error) {
  console.error(JSON.stringify({event:'staging_acceptance_failed',run,reason:error instanceof Error ? error.message : 'Unknown failure',code:typeof error?.code==='string'?error.code:undefined}));process.exitCode=1;
} finally {
  try {if(users.length) await cleanup();}catch {console.error(JSON.stringify({event:'staging_fixture_cleanup_required',run,completed}));process.exitCode=1;}
  await db.end().catch(()=>{});
}
