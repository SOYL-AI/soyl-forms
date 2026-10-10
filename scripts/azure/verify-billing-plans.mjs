import {readFile} from 'node:fs/promises';
import {PLANS} from '../../lib/plans.ts';
const settings=JSON.parse(await readFile('.azure-migration/platform-secrets-parameters.json','utf8')).parameters.settings.value;
const key=settings['razorpay-key-id']?.value,secret=settings['razorpay-key-secret']?.value;
if(!key?.startsWith('rzp_test_') || !secret) throw new Error('Test-mode credentials required');
try {
  for(const plan of ['starter','pro']) for(const interval of ['monthly','yearly']) {
    const id=settings[`razorpay-plan-${plan}-${interval}`]?.value;
    if(!/^plan_[a-zA-Z0-9]+$/.test(id??'')) throw new Error('Missing test plan configuration');
    const response=await fetch(`https://api.razorpay.com/v1/plans/${id}`,{headers:{authorization:'Basic '+Buffer.from(key+':'+secret).toString('base64')},redirect:'error',signal:AbortSignal.timeout(10_000)});
    if(!response.ok) {await response.body?.cancel();throw new Error(`Test plan verification failed: HTTP ${response.status}`);}
    const result=await response.json();
    const expected=PLANS[plan][interval==='monthly'?'monthlyPaise':'yearlyPaise'];
    const matches=result.id===id && result.period===interval && result.interval===1 && result.item?.amount===expected && result.item?.currency==='INR';
    console.log(JSON.stringify({event:'test_billing_plan_checked',plan,interval,matches,expectedPaise:expected}));
    if(!matches) throw new Error('Configured provider plan does not match centralized application pricing');
  }
} catch(error) {console.error(error instanceof Error?error.message:'Provider plan verification failed');process.exitCode=1;}
