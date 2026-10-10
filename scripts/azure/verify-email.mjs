import {randomUUID} from 'node:crypto';
import {sendAzureEmail} from './email-provider.ts';
import {ManagedIdentityCredential} from '@azure/identity';

// Run in an ephemeral job with the application's user-assigned identity.
// Default mode submits an empty, invalid payload with no sender or recipients.
// A validation response verifies authorization without creating any email.
const mail={to:['never-sent@example.invalid'],subject:'SOYL Forms Azure email verification',text:'Azure email verification.',html:'<p>Azure email verification.</p>',idempotencyKey:randomUUID(),providerOperationId:randomUUID(),providerOperationFresh:true,firstSentAt:new Date(Date.now()-600_000).toISOString()};
let phase='identity';
const started=Date.now();
try {
  const credential=new ManagedIdentityCredential({clientId:process.env.AZURE_CLIENT_ID,retryOptions:{maxRetries:0}});
  const token=await credential.getToken('https://communication.azure.com/.default',{abortSignal:AbortSignal.timeout(30_000)});
  console.log(JSON.stringify({event:'azure_email_identity_token_verified',elapsedMs:Date.now()-started}));
  phase='provider';
  const response=await fetch(`${process.env.AZURE_EMAIL_ENDPOINT}/emails:send?api-version=2023-03-31`,{method:'POST',body:'{}',headers:{authorization:`Bearer ${token.token}`,'content-type':'application/json'},signal:AbortSignal.timeout(12_000),redirect:'error'});
  await response.body?.cancel();
  console.log(JSON.stringify({event:'azure_email_provider_probe',httpStatus:response.status,elapsedMs:Date.now()-started}));
  if(response.status!==400) throw new Error('Expected provider validation rejection.');
} catch(error) {
  console.error(JSON.stringify({event:'azure_email_probe_failed',phase,elapsedMs:Date.now()-started,errorType:/^[a-z]+$/i.test(error?.name ?? '') ? error.name : 'unknown',identityEndpointPresent:Boolean(process.env.IDENTITY_ENDPOINT),identityHeaderPresent:Boolean(process.env.IDENTITY_HEADER)}));
  throw new Error('Azure email provider probe failed.');
}
const check=await sendAzureEmail(mail);
if(check.error!=='Azure email retry window expired.' || !check.uncertain) {console.error(JSON.stringify({event:'azure_email_authorization_failed',result:check}));throw new Error('Managed identity email authorization could not be verified.');}
console.log(JSON.stringify({event:'azure_email_authorization_verified',provider:'azure',mailSent:false}));
if(process.argv.includes('--send')) {
  const recipient=process.env.EMAIL_TEST_RECIPIENT;
  if(!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error('An explicitly authorized EMAIL_TEST_RECIPIENT is required.');
  const request={...mail,to:[recipient],firstSentAt:new Date().toISOString()};
  for(let attempt=0;attempt<12;attempt++) {
    const result=await sendAzureEmail({...request,providerOperationFresh:attempt===0});
    if(result.ok) {console.log(JSON.stringify({event:'azure_email_send_verified',provider:'azure',accepted:true}));process.exit(0);}
    if(result.uncertain || result.rejected || !result.deferred) throw new Error('Azure email test did not succeed. Inspect provider status.');
    await new Promise(resolve=>setTimeout(resolve,10_000));
  }
  throw new Error('Azure email operation did not finish during verification.');
}
