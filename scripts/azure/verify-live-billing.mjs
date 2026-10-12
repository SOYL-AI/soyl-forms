import {createHmac,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='https://forms.soylai.com';
const secret=process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
if(!process.env.RAZORPAY_KEY_ID?.trim().startsWith('rzp_live_')||!secret) throw new Error('The expected live payment configuration is required.');
const configured=JSON.parse(await readFile('.azure-migration/live-webhook-configured.json','utf8'));
if(configured.url!==origin+'/api/webhooks/razorpay'||configured.mode!=='live') throw new Error('Configure the production live webhook first.');
const eventId='azure_live_config_'+randomUUID().replaceAll('-','');
// An ignored operational marker exercises signature verification and duplicate
// accounting without creating a provider subscription, order, payment or access.
const body=JSON.stringify({event:'deployment.verification',payload:{}});
const signature=createHmac('sha256',secret).update(body).digest('hex');
async function post(signatureValue) {
  return fetch(configured.url,{method:'POST',body,headers:{'content-type':'application/json','x-razorpay-signature':signatureValue,'x-razorpay-event-id':eventId},redirect:'error',signal:AbortSignal.timeout(15000)});
}
try {
  const invalid=await post('0'.repeat(64));assert.equal(invalid.status,400);await invalid.body?.cancel();
  const first=await post(signature);assert.equal(first.status,200);const accepted=await first.json();assert.equal(accepted.ok,true);assert.equal(accepted.ignored,true);
  const repeat=await post(signature);assert.equal(repeat.status,200);const duplicate=await repeat.json();assert.equal(duplicate.ok,true);assert.equal(duplicate.duplicate,true);
  const ready=await fetch(origin+'/api/health/ready',{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(ready.status,200);assert.equal((await ready.json()).status,'ready');
  const evidence={event:'live_billing_runtime_verified',verifiedAt:new Date().toISOString(),origin,eventId,invalidSignatureDenied:true,configuredSignatureAccepted:true,duplicateEventRecognized:true,ready:true,chargesCreated:0,checkoutAcceptanceStillRequired:true,providerDeliveryNotExercised:true};
  await writeFile('.azure-migration/live-billing-runtime-evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}catch {console.error(JSON.stringify({event:'live_billing_runtime_verification_failed',detailsWithheld:true}));process.exitCode=1;}
