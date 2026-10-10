import {randomUUID} from 'node:crypto';
import {sendAzureEmail} from './email-provider.ts';

// Run in an ephemeral job with the application's user-assigned identity.
// Default mode authenticates and polls a nonexistent operation. It sends no mail.
const mail={to:['never-sent@example.invalid'],subject:'SOYL Forms Azure email verification',text:'Azure email verification.',html:'<p>Azure email verification.</p>',idempotencyKey:randomUUID(),firstSentAt:new Date(Date.now()-600_000).toISOString()};
const check=await sendAzureEmail(mail);
if(check.error!=='Azure email retry window expired.' || !check.uncertain) throw new Error('Managed identity email authorization could not be verified.');
console.log(JSON.stringify({event:'azure_email_authorization_verified',provider:'azure',mailSent:false}));
if(process.argv.includes('--send')) {
  const recipient=process.env.EMAIL_TEST_RECIPIENT;
  if(!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error('An explicitly authorized EMAIL_TEST_RECIPIENT is required.');
  const request={...mail,to:[recipient],firstSentAt:new Date().toISOString()};
  for(let attempt=0;attempt<12;attempt++) {
    const result=await sendAzureEmail(request);
    if(result.ok) {console.log(JSON.stringify({event:'azure_email_send_verified',provider:'azure',accepted:true}));process.exit(0);}
    if(result.uncertain || result.rejected || !result.deferred) throw new Error('Azure email test did not succeed. Inspect provider status.');
    await new Promise(resolve=>setTimeout(resolve,10_000));
  }
  throw new Error('Azure email operation did not finish during verification.');
}
