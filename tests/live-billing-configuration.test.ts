import {describe,it,expect} from 'vitest';
import {validatePlan,selectProductionWebhook,enabledEvents,productionWebhook,validateWebhookSecret} from '../scripts/azure/configure-live-billing.mjs';
describe('live billing configuration guards',()=>{
  it('rejects public URLs and short webhook signing secrets before provider changes',()=>{
    for(const value of [undefined,'', 'short-secret',productionWebhook,'HTTPS://example.com/a-long-public-callback-path']) expect(()=>validateWebhookSecret(value)).toThrow();
    expect(()=>validateWebhookSecret('abc0123456789def'.repeat(4))).not.toThrow();
  });
  it('rejects the wrong amount, currency, interval and provider identity',()=>{
    const plan={id:'plan_checked',period:'monthly',interval:1,item:{amount:19900,currency:'INR'}};
    expect(validatePlan(plan,'plan_checked','starter','monthly').amountPaise).toBe(19900);
    for(const bad of [{...plan,id:'plan_other'},{...plan,period:'yearly'},{...plan,interval:2},{...plan,item:{amount:199000,currency:'INR'}},{...plan,item:{amount:19900,currency:'USD'}}]) expect(()=>validatePlan(bad,'plan_checked','starter','monthly')).toThrow();
  });
  it('selects only the exact production endpoint and refuses ambiguous or truncated inventories',()=>{
    const target={id:'target',url:productionWebhook};
    expect(selectProductionWebhook([{id:'other',url:'https://company.example/api/webhooks/razorpay'},target])).toBe(target);
    expect(selectProductionWebhook([{url:productionWebhook+'/extra'}])).toBeNull();
    expect(()=>selectProductionWebhook([target,{...target,id:'duplicate'}])).toThrow();
    expect(()=>selectProductionWebhook(Array(100).fill({url:'https://company.example'}))).toThrow();
  });
  it('preserves enabled extra events and ignores explicitly disabled events',()=>{
    expect(enabledEvents({events:{'subscription.charged':true,'payment.captured':true,'payment.failed':false}})).toEqual(['subscription.charged','payment.captured']);
    expect(enabledEvents({events:['subscription.charged']})).toEqual(['subscription.charged']);
  });
});
