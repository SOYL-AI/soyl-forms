import {readFile,writeFile} from 'node:fs/promises';
// Test-mode staging only. Never edits an existing webhook or touches live mode.
const settings=JSON.parse(await readFile('.azure-migration/platform-secrets-parameters.json','utf8')).parameters.settings.value;
const key=settings['razorpay-key-id']?.value,secret=settings['razorpay-key-secret']?.value;
const signature=settings['razorpay-webhook-secret']?.value;
if(!key?.startsWith('rzp_test_') || !secret || !signature) throw new Error('Configured test-mode credentials required');
const url='https://soyl-forms-web.wonderfuldesert-0fe0498b.centralindia.azurecontainerapps.io/api/webhooks/razorpay';
const events=['subscription.authenticated','subscription.activated','subscription.charged','subscription.pending','subscription.halted','subscription.cancelled','subscription.completed','subscription.paused','subscription.resumed','subscription.updated'];
const eventList=hook=>Array.isArray(hook.events)?hook.events:Object.entries(hook.events??{}).filter(([,enabled])=>enabled).map(([name])=>name);
async function api(path,body) {
  const response=await fetch('https://api.razorpay.com/v1/'+path,{method:body?'POST':'GET',headers:{authorization:'Basic '+Buffer.from(key+':'+secret).toString('base64'),'content-type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(10_000)});
  if(!response.ok) {
    const failure=await response.json().catch(()=>null);
    const code=typeof failure?.error?.code==='string' && /^[A-Z_]+$/.test(failure.error.code)?failure.error.code:'unavailable';
    const field=typeof failure?.error?.field==='string' && /^[a-z_]+$/.test(failure.error.field)?failure.error.field:'unspecified';
    // Preserve diagnostics locally without exposing a provider response in tool logs.
    await writeFile('.azure-migration/test-billing-error.json',JSON.stringify(failure),{mode:0o600});
    throw new Error(`Test billing configuration failed (HTTP ${response.status}, code ${code}, field ${field}); provider payload withheld`);
  }
  return response.json();
}
try {
  const all=await api('webhooks?count=100');
  if(!Array.isArray(all.items) || all.items.length>=100) throw new Error('Could not safely enumerate existing webhooks');
  let hook=all.items.find(h=>h.url===url);
  if(hook) {
    if(!hook.active || !hook.secret_exists || !events.every(e=>eventList(hook).includes(e))) throw new Error('Existing staging hook requires manual review; refusing to overwrite it');
  } else hook=await api('webhooks',{url,secret:signature,active:true,events:Object.fromEntries(events.map(event=>[event,true]))});
  if(hook.url!==url || !hook.active || !hook.secret_exists || !events.every(e=>eventList(hook).includes(e))) throw new Error('Test webhook configuration not confirmed');
  await writeFile('.azure-migration/test-billing-webhook.json',JSON.stringify({id:hook.id,url,events,testMode:true,verifiedAt:new Date().toISOString()},null,2),{mode:0o600});
  console.log(JSON.stringify({event:'test_billing_webhook_configured',testMode:true,existingWebhooksPreserved:true,events:events.length,realCheckoutAcceptanceStillRequired:true}));
} catch(error) {console.error(error instanceof Error?error.message:'Test webhook configuration unavailable');process.exitCode=1;}
