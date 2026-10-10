import {S3Client,HeadObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';

const source=process.argv[2];
if(!source) throw new Error('Pass a source-export directory; credentials are read only from environment variables.');
const files=JSON.parse(await readFile(join(resolve(source),'uploaded_files.json'),'utf8'));
const bucket=process.env.R2_BUCKET_NAME;
if(!bucket || !process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) throw new Error('R2 configuration is required');
const client=new S3Client({region:'auto',endpoint:process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY},maxAttempts:2,
  requestHandler:{connectionTimeout:5000,requestTimeout:60_000}});
const directory=resolve('.azure-migration',`object-backup-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await mkdir(directory,{recursive:true});
const manifest={generatedAt:new Date().toISOString(),sourceExport:resolve(source),bucket,objects:[]};
for(const file of files) {
  const entry={fileId:file.id,key:file.r2_key,status:file.status};
  try {
    const signal=AbortSignal.timeout(60_000);
    const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:file.r2_key}),{abortSignal:signal});
    if(!head.ETag) throw new Error('Missing object version');
    const object=await client.send(new GetObjectCommand({Bucket:bucket,Key:file.r2_key,IfMatch:head.ETag}),{abortSignal:signal});
    if(!object.Body) throw new Error('Object body unavailable');
    const filename=`${createHash('sha256').update(file.r2_key).digest('hex')}.bin`;
    const hash=createHash('sha256');let size=0;
    await pipeline(object.Body,new Transform({transform(chunk,encoding,done){hash.update(chunk);size+=chunk.length;done(null,chunk);}}),createWriteStream(join(directory,`${filename}.part`),{flags:'wx',mode:0o600}),{signal});
    const after=await client.send(new HeadObjectCommand({Bucket:bucket,Key:file.r2_key}),{abortSignal:signal});
    if(after.ETag!==head.ETag || size!==head.ContentLength) throw new Error('Source object changed');
    await rename(join(directory,`${filename}.part`),join(directory,filename));
    Object.assign(entry,{verified:true,filename,sha256:hash.digest('hex'),size,etag:head.ETag,mime:head.ContentType});
  } catch(error) {
    Object.assign(entry,{verified:false,httpStatus:error?.$metadata?.httpStatusCode ?? null});
  }
  manifest.objects.push(entry);
}
await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
client.destroy();
const verified=manifest.objects.filter(o=>o.verified).length;
console.log(JSON.stringify({event:'object_backup_saved',directory,objects:files.length,verified,unverified:files.length-verified}));
if(verified!==files.length) process.exitCode=1;
