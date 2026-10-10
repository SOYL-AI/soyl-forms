import pg from 'pg';

const tenant='47f0c7e0-77a5-4ae0-b3b4-b9b48269d014';
const issuer=`https://${tenant}.ciamlogin.com/${tenant}/v2.0`;
const email=(process.env.SUPERADMIN_EMAIL ?? '').trim().toLowerCase();
const apply=process.env.SUPERADMIN_APPLY==='true';
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('An explicitly authorized account email is required.');
const url=new URL(process.env.DATABASE_MIGRATION_URL ?? '');
const local=process.env.AZURE_DATABASE_TESTS==='true' && ['localhost','127.0.0.1'].includes(url.hostname);
if(!local && (url.hostname!=='soyl-forms-pg-n4nsiocbpshei.postgres.database.azure.com' || url.pathname!=='/soyl_forms')) throw new Error('Expected SOYL Forms Azure database.');
for(const key of ['sslmode','sslcert','sslkey','sslrootcert','ssl','uselibpqcompat']) url.searchParams.delete(key);
const runtimePassword=process.env.DATABASE_RUNTIME_PASSWORD ?? (local && process.env.DATABASE_URL ? decodeURIComponent(new URL(process.env.DATABASE_URL).password) : undefined);
if(apply && !runtimePassword) throw new Error('Runtime verification credential is required before granting access.');
const db=new pg.Client({connectionString:url.href,ssl:local ? false : {rejectUnauthorized:true},connectionTimeoutMillis:5000});
let stage='connect';
try {
  await db.connect();
  await db.query('begin');
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='10s'");
  stage='inspect';
  const users=(await db.query('select id,status,email_verified from app_users where lower(email)=$1 for update',[email])).rows;
  const inventory=(await db.query('select (select count(*)::int from app_users) as users,(select count(*)::int from forms) as forms,(select count(*)::int from submissions) as responses,(select count(*)::int from admin_users) as administrators')).rows[0];
  const identities=users.length===1 ? (await db.query('select issuer,subject,object_id from identity.provider_identities where user_id=$1',[users[0].id])).rows : [];
  const identity=identities.length===1 && identities[0].issuer===issuer && identities[0].subject && identities[0].object_id ? identities[0] : null;
  console.log(JSON.stringify({event:'superadmin_account_inspected',matches:users.length,userId:users[0]?.id,active:users[0]?.status==='active',emailVerified:users[0]?.email_verified,dedicatedIdentity:Boolean(identity),objectId:identity?.object_id,inventory}));
  if(!apply) {await db.query('rollback');}
  else {
    stage='validate';
    // This is a manual grant to explicitly inspected IDs, never an email allowlist.
    // Entra can omit email_verified; the administrator must independently check
    // the registered directory identity before supplying its expected object ID.
    if(users.length!==1 || users[0].status!=='active' || !identity) throw new Error('An active account in the dedicated tenant is required.');
    if(users[0].id!==process.env.SUPERADMIN_EXPECTED_USER_ID || identity.object_id!==process.env.SUPERADMIN_EXPECTED_OBJECT_ID) throw new Error('Account identity does not match the inspected, authorized target.');
    stage='grant';
    const result=await db.query("insert into admin_users(user_id,role) values($1,'super_admin') on conflict(user_id) do update set role='super_admin' where admin_users.role is distinct from 'super_admin' returning user_id",[users[0].id]);
    if(result.rowCount) await db.query("insert into audit_logs(actor_type,action,target_type,target_id,metadata) values('system','admin.bootstrap.grant','user',$1,$2)",[users[0].id,JSON.stringify({role:'super_admin',reason:'Owner authorized the initial administrator for the fresh Azure launch.',providerObjectId:identity.object_id})]);
    await db.query('commit');
    stage='verify-runtime';
    const runtimeUrl=new URL(url);runtimeUrl.username='soyl_runtime';runtimeUrl.password=runtimePassword;
    const runtime=new pg.Client({connectionString:runtimeUrl.href,ssl:local ? false : {rejectUnauthorized:true},connectionTimeoutMillis:5000});
    try {
      await runtime.connect();await runtime.query('begin');
      await runtime.query("select set_config('app.user_id',$1,true)",[users[0].id]);
      const role=(await runtime.query('select platform.admin_role() as role')).rows[0].role;
      if(role!=='super_admin') throw new Error('Runtime admin gate did not recognize the grant.');
      await runtime.query("select set_config('app.user_id','',true)");
      if((await runtime.query('select platform.admin_role() as role')).rows[0].role!==null) throw new Error('Anonymous context gained operator access.');
      await runtime.query('rollback');
      console.log(JSON.stringify({event:'superadmin_grant_verified',userId:users[0].id,role,changed:result.rowCount===1,runtimeGateVerified:true,anonymousDenied:true}));
    } finally {await runtime.end();}
  }
} catch(error) {
  await db.query('rollback').catch(()=>{});
  console.error(JSON.stringify({event:'superadmin_bootstrap_failed',stage,code:/^[A-Z0-9]{5}$/.test(error?.code ?? '') ? error.code : 'guard'}));
  process.exitCode=1;
} finally {await db.end();}
