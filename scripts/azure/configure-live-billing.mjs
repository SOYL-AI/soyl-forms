import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {PLANS} from '../../lib/plans.ts';

export const productionWebhook='https://forms.soylai.com/api/webhooks/razorpay';
export const requiredEvents=['subscription.authenticated','subscription.activated','subscription.charged','subscription.pending','subscription.halted','subscription.cancelled','subscription.completed','subscription.paused','subscription.resumed','subscription.updated'];
export function validateWebhookSecret(value) {
  if(typeof value!=='string'||value.length<32||/^https?:\/\//i.test(value)) throw new Error('Use an independently generated random webhook secret of at least 32 characters, not a public URL.');
}
export function enabledEvents(hook) {
  return Array.isArray(hook.events)?hook.events:Object.entries(hook.events??{}).filter(([,enabled])=>enabled).map(([event])=>event);
}
export function selectProductionWebhook(items) {
  if(!Array.isArray(items)||items.length>=100) throw new Error('Cannot safely enumerate provider webhooks.');
  const matches=items.filter(hook=>hook.url===productionWebhook);
  if(matches.length>1) throw new Error('Ambiguous production webhooks.');
  return matches[0]??null;
}
export function validatePlan(actual,id,plan,interval) {
  const expected=PLANS[plan]?.[interval==='monthly'?'monthlyPaise':'yearlyPaise'];
  if(!['starter','pro'].includes(plan)||!['monthly','yearly'].includes(interval)||actual.id!==id||actual.period!==interval||actual.interval!==1||actual.item?.amount!==expected||actual.item?.currency!=='INR') throw new Error('Provider plan differs from application pricing: '+plan+' '+interval);
  return {plan,interval,amountPaise:expected,currency:'INR'};
}
function configuration() {
  const names=['RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET','RAZORPAY_PLAN_STARTER_MONTHLY','RAZORPAY_PLAN_STARTER_YEARLY','RAZORPAY_PLAN_PRO_MONTHLY','RAZORPAY_PLAN_PRO_YEARLY'];
  const settings=Object.fromEntries(names.map(name=>[name.toLowerCase().replaceAll('_','-'),{envName:name,value:process.env[name]?.trim()??''}]));
  if(Object.values(settings).some(entry=>!entry.value)||!/^rzp_live_[A-Za-z0-9]+$/.test(settings['razorpay-key-id'].value)) throw new Error('Complete live-mode payment configuration is required.');
  validateWebhookSecret(settings['razorpay-webhook-secret'].value);
  const ids=Object.entries(settings).filter(([name])=>name.startsWith('razorpay-plan-')).map(([,entry])=>entry.value);
  if(ids.some(id=>!/^plan_[A-Za-z0-9]+$/.test(id))||new Set(ids).size!==4) throw new Error('Four distinct plan IDs are required.');
  return settings;
}
async function main() {
  const apply=process.argv.includes('--apply-webhook'),prepare=process.argv.includes('--prepare');
  if(apply&&prepare) throw new Error('Prepare and apply must run separately.');
  const settings=configuration(),fingerprint=createHash('sha256').update(JSON.stringify(settings)).digest('hex');
  const key=settings['razorpay-key-id'].value,secret=settings['razorpay-key-secret'].value;
  async function api(path,method='GET',body) {
    if(method!=='GET' && !(/^webhooks(?:\/[A-Za-z0-9]+)?$/.test(path)&&['PUT','POST'].includes(method))) throw new Error('Only webhook configuration mutations are allowed.');
    const response=await fetch('https://api.razorpay.com/v1/'+path,{method,headers:{authorization:'Basic '+Buffer.from(key+':'+secret).toString('base64'),'content-type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok) {await response.body?.cancel();throw new Error('Provider configuration HTTP '+response.status);}
    return response.json();
  }
  const plans=[];
  for(const plan of ['starter','pro']) for(const interval of ['monthly','yearly']) {
    const id=settings[`razorpay-plan-${plan}-${interval}`].value;
    plans.push(validatePlan(await api('plans/'+id),id,plan,interval));
  }
  const before=selectProductionWebhook((await api('webhooks?count=100')).items);
  if(prepare) {
    await writeFile('.azure-migration/live-payment-settings.json',JSON.stringify({$schema:'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',contentVersion:'1.0.0.0',parameters:{settings:{value:settings}}},null,2),{mode:0o600});
    await writeFile('.azure-migration/live-payment-prepared.json',JSON.stringify({fingerprint,webhookId:before?.id??null,preparedAt:new Date().toISOString(),plans},null,2),{mode:0o600});
  }
  if(apply) {
    const prepared=JSON.parse(await readFile('.azure-migration/live-payment-prepared.json','utf8'));
    if(prepared.fingerprint!==fingerprint||prepared.webhookId!==(before?.id??null)) throw new Error('Payment input or production webhook changed since preparation.');
    await writeFile('.azure-migration/live-webhook-before.json',JSON.stringify(before,null,2),{mode:0o600});
    const events=[...new Set([...enabledEvents(before??{}),...requiredEvents])];
    const body={url:productionWebhook,secret:settings['razorpay-webhook-secret'].value,active:true,events:Object.fromEntries(events.map(event=>[event,true])),...(typeof before?.alert_email==='string'?{alert_email:before.alert_email}:{})};
    if(before) await api('webhooks/'+before.id,'PUT',body);else await api('webhooks','POST',body);
    const after=selectProductionWebhook((await api('webhooks?count=100')).items);
    if(!after?.active||!after.secret_exists||!requiredEvents.every(event=>enabledEvents(after).includes(event))||!events.every(event=>enabledEvents(after).includes(event))||(before&&after.id!==before.id)) throw new Error('Production webhook configuration not confirmed.');
    await writeFile('.azure-migration/live-webhook-configured.json',JSON.stringify({id:after.id,url:after.url,events:enabledEvents(after),mode:'live',verifiedAt:new Date().toISOString(),otherWebhooksPreserved:true,checkoutAcceptanceStillRequired:true},null,2),{mode:0o600});
    console.log(JSON.stringify({event:'live_payment_webhook_configured',mode:'live',events:enabledEvents(after).length,otherWebhooksPreserved:true,chargeCreated:false}));
  } else console.log(JSON.stringify({event:prepare?'live_payment_settings_prepared':'live_payment_settings_inspected',mode:'live',plans,existingProductionWebhook:Boolean(before),existingEventCount:enabledEvents(before??{}).length,providerMutationsPerformed:false}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(()=>{console.error(JSON.stringify({event:'live_payment_configuration_failed',detailsWithheld:true}));process.exitCode=1;});
