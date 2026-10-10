import {S3Client,GetBucketCorsCommand,PutBucketCorsCommand} from '@aws-sdk/client-s3';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.argv[2];
if(!origin || !/^https:\/\/soyl-forms-web\.[a-z0-9-]+\.centralindia\.azurecontainerapps\.io$/.test(origin)) throw new Error('Pass the exact SOYL Forms staging origin.');
const client=new S3Client({region:'auto',endpoint:process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY},requestHandler:{connectionTimeout:5000,requestTimeout:10_000}});
try {
  const bucket=process.env.R2_BUCKET_NAME;
  const old=await client.send(new GetBucketCorsCommand({Bucket:bucket}));
  const rules=structuredClone(old.CORSRules ?? []);
  await mkdir('.azure-migration',{recursive:true});
  await writeFile(`.azure-migration/r2-cors-before-${Date.now()}.json`,JSON.stringify(old.CORSRules,null,2),{flag:'wx',mode:0o600});
  let rule=rules.find(r=>r.AllowedMethods?.includes('PUT') && r.AllowedOrigins?.includes('https://forms.soylai.com'));
  if(!rule) {rule={AllowedOrigins:[],AllowedMethods:['PUT','GET','HEAD'],AllowedHeaders:['content-type']};rules.push(rule);}
  rule.AllowedOrigins=[...new Set([...rule.AllowedOrigins,origin,'http://localhost:3001'])];
  await client.send(new PutBucketCorsCommand({Bucket:bucket,CORSConfiguration:{CORSRules:rules}}));
  const result=await client.send(new GetBucketCorsCommand({Bucket:bucket}));
  if(!result.CORSRules.some(r=>r.AllowedOrigins?.includes(origin) && r.AllowedMethods?.includes('PUT'))) throw new Error('Staging CORS verification failed');
  console.log(JSON.stringify({event:'staging_storage_cors_verified',origin,existingRulesPreserved:true}));
} catch {
  console.error('Staging storage CORS configuration failed; inspect the preserved rule backup.');process.exitCode=1;
} finally {client.destroy();}
