import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,access,readFile} from 'node:fs/promises';
const target='.azure-migration/platform-secrets-parameters.json';
try {await access(target);throw new Error('Platform parameters exist; refusing to rotate credentials.');} catch(error) {if(error.code!=='ENOENT') throw error;}
const source=process.argv[2];
if(!source) throw new Error('Pass the preserved source-export directory before preparing encryption configuration.');
const inventory=JSON.parse(await readFile(`${source}/manifest.json`,'utf8'));
if(!process.env.WEBHOOK_ENCRYPTION_KEY && ['webhooks','workspace_payment_providers'].some(t=>inventory.tables[t]?.rows>0)) throw new Error('Preserved encrypted credentials require the original production WEBHOOK_ENCRYPTION_KEY. Refusing to generate an incompatible key.');
const settings={};
function add(envName,value=process.env[envName]) {if(value?.trim()) settings[envName.toLowerCase().replaceAll('_','-')]={envName,value:value.trim()};}
for(const name of ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET_NAME','R2_ENDPOINT','RAZORPAY_KEY_SECRET','RAZORPAY_PLAN_STARTER_MONTHLY','RAZORPAY_PLAN_STARTER_YEARLY','RAZORPAY_PLAN_PRO_MONTHLY','RAZORPAY_PLAN_PRO_YEARLY','EMAIL_FROM','RESEND_API_KEY','AI_PROVIDER','AI_API_KEY','AI_BASE_URL','AI_MODEL','AI_API_VERSION','AI_EFFORT','ANTHROPIC_API_KEY']) add(name);
add('RAZORPAY_KEY_ID',process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID);
add('RAZORPAY_WEBHOOK_SECRET',process.env.RAZORPAY_WEBHOOK_SECRET || randomBytes(32).toString('hex'));
add('WEBHOOK_ENCRYPTION_KEY',process.env.WEBHOOK_ENCRYPTION_KEY || randomBytes(32).toString('hex'));
add('RATE_LIMIT_SECRET',randomBytes(32).toString('hex'));
add('CRON_SECRET',randomBytes(32).toString('hex'));
await mkdir('.azure-migration',{recursive:true});
await writeFile(target,JSON.stringify({$schema:'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',contentVersion:'1.0.0.0',parameters:{settings:{value:settings}}},null,2),{mode:0o600,flag:'wx'});
await writeFile('.azure-migration/platform-settings-list.json',JSON.stringify(Object.entries(settings).map(([secretName,entry])=>({secretName,envName:entry.envName})),null,2),{mode:0o600});
console.log(JSON.stringify({event:'platform_secret_parameters_prepared',count:Object.keys(settings).length,emailConfigured:Boolean(process.env.RESEND_API_KEY),webhookDashboardConfigurationRequired:!process.env.RAZORPAY_WEBHOOK_SECRET}));
