import pg from 'pg';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const source=new URL(process.env.DATABASE_MIGRATION_URL ?? '');
if(source.hostname!=='soyl-forms-pg-n4nsiocbpshei.postgres.database.azure.com' || source.pathname!=='/soyl_forms') throw new Error('Expected isolated SOYL Forms staging source.');
const restored=new URL(source);restored.hostname='soyl-forms-restore-20261010.postgres.database.azure.com';
for(const key of ['sslmode','sslcert','sslkey','sslrootcert','ssl','uselibpqcompat']) restored.searchParams.delete(key);
const client=new pg.Client({connectionString:restored.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10_000});
try {
  await client.connect();
  await client.query('begin read only');
  const history=(await client.query('select name,checksum from platform_migrations.history order by name')).rows;
  const files=(await readdir('azure/migrations')).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort();
  if(history.length!==files.length) throw new Error('Restored migration count mismatch');
  for(const file of files) {
    const checksum=createHash('sha256').update(await readFile(`azure/migrations/${file}`)).digest('hex');
    if(history.find(h=>h.name===file)?.checksum!==checksum) throw new Error('Restored migration checksum mismatch');
  }
  const counts=(await client.query("select (select count(*)::int from app_users) as users,(select count(*)::int from identity.provider_identities) as identities,(select count(*)::int from identity.sessions) as sessions")).rows[0];
  if(counts.users<1 || counts.identities<1) throw new Error('Expected the preserved customer account in the restored database');
  const role=(await client.query("select rolsuper,rolbypassrls,rolcreaterole from pg_roles where rolname='soyl_runtime'")).rows[0];
  if(!role || role.rolsuper || role.rolbypassrls || role.rolcreaterole) throw new Error('Restored runtime role permissions are invalid');
  await client.query('rollback');
  const runtime=new URL(restored);runtime.username='soyl_runtime';runtime.password=process.env.DATABASE_RUNTIME_PASSWORD;
  const reader=new pg.Client({connectionString:runtime.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10_000});
  try {
    await reader.connect();
    const version=(await reader.query('select platform.schema_version() as version')).rows[0].version;
    await reader.query('select * from identity.read_session($1)',['0'.repeat(64)]);
    if((await reader.query('select id from forms')).rowCount!==0) throw new Error('Restored runtime exposed unauthenticated workspace rows');
    console.log(JSON.stringify({event:'azure_restore_verified',migrations:history.length,counts,runtimePermissionsVerified:true,version}));
  } finally {await reader.end();}
} catch {console.error(JSON.stringify({event:'azure_restore_verification_failed'}));process.exitCode=1;}
finally {await client.end().catch(()=>{});}
