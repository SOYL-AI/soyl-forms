import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

const suite=process.env.AZURE_DATABASE_TESTS==='true' ? describe : describe.skip;
suite('Manual superadmin bootstrap against isolated PostgreSQL',()=>{
  const user=randomUUID(),object=randomUUID(),other=randomUUID();
  const email=`bootstrap-${user}@example.test`;
  let db:pg.Client;
  beforeAll(async()=>{
    const url=new URL(process.env.DATABASE_MIGRATION_URL!);
    if(!['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Isolated localhost database required.');
    db=new pg.Client({connectionString:url.href});await db.connect();
    await db.query('insert into app_users(id,email,email_verified) values($1,$2,false),($3,$4,true)',[user,email,other,`other-${other}@example.test`]);
    const tenant='47f0c7e0-77a5-4ae0-b3b4-b9b48269d014';
    await db.query('insert into identity.provider_identities(issuer,subject,user_id,object_id) values($1,$2,$3,$4)',[`https://${tenant}.ciamlogin.com/${tenant}/v2.0`,randomUUID(),user,object]);
  });
  afterAll(async()=>{
    if(!db) return;
    await db.query("delete from audit_logs where action='admin.bootstrap.grant' and target_id=$1",[user]);
    await db.query('delete from identity.provider_identities where user_id=$1',[user]);
    await db.query('delete from app_users where id=any($1::uuid[])',[[user,other]]);await db.end();
  });
  const run=(apply:boolean,expectedObject=object)=>spawnSync(process.execPath,['scripts/azure/bootstrap-superadmin.mjs'],{encoding:'utf8',timeout:15_000,env:{...process.env,SUPERADMIN_EMAIL:email,SUPERADMIN_APPLY:String(apply),SUPERADMIN_EXPECTED_USER_ID:user,SUPERADMIN_EXPECTED_OBJECT_ID:expectedObject}});
  it('defaults to inspection and refuses a mismatched provider identity without writes',async()=>{
    expect(run(false).status).toBe(0);
    expect(run(true,randomUUID()).status).toBe(1);
    expect((await db.query('select count(*)::int as n from admin_users where user_id=$1',[user])).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int as n from audit_logs where action='admin.bootstrap.grant' and target_id=$1",[user])).rows[0].n).toBe(0);
  });
  it('grants only the pinned account, verifies restricted-role access, and audits once across retries',async()=>{
    const first=run(true);expect(first.status,first.stderr).toBe(0);
    const event=first.stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line)).find(item=>item.event==='superadmin_grant_verified');
    expect(event).toMatchObject({userId:user,role:'super_admin',changed:true,runtimeGateVerified:true,anonymousDenied:true});
    const repeated=run(true);expect(repeated.status,repeated.stderr).toBe(0);
    expect(repeated.stdout).toContain('"changed":false');
    expect((await db.query('select role from admin_users where user_id=$1',[other])).rows).toEqual([]);
    expect((await db.query("select count(*)::int as n from audit_logs where action='admin.bootstrap.grant' and target_id=$1",[user])).rows[0].n).toBe(1);
  });
});
