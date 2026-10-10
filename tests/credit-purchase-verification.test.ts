import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { fetchRazorpay,verifyCreditPurchase } from '@/lib/billing/provider-api';

describe('captured credit-pack verification',()=>{
  const args={workspaceId:'workspace-fixture',packId:'pack-fixture',credits:100,amount:49900,orderId:'order_fixture',paymentId:'pay_fixture'};
  const captured={id:args.paymentId,status:'captured',amount:args.amount,currency:'INR',order_id:args.orderId,amount_refunded:0};
  const order={id:args.orderId,amount:args.amount,currency:'INR',notes:{workspaceId:args.workspaceId,packId:args.packId,credits:'100'}};
  function provider(payment:unknown=captured,sourceOrder:unknown=order) {
    vi.stubGlobal('fetch',vi.fn(async (url:string)=>Response.json(url.includes('/payments/')?payment:sourceOrder)));
  }
  beforeEach(()=>{vi.stubEnv('RAZORPAY_KEY_ID','rzp_test_fixture');vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID','');vi.stubEnv('RAZORPAY_KEY_SECRET','test-secret');provider();});
  afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
  it('accepts only the captured payment bound to the server-priced pack and workspace',async()=>{
    expect(await verifyCreditPurchase(args)).toBe(true);
    const calls=vi.mocked(fetch).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toMatchObject({redirect:'error',cache:'no-store'});
    expect(calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([
    ['smaller captured amount',{...captured,amount:100}],
    ['uncaptured authorization',{...captured,status:'authorized'}],
    ['different order',{...captured,order_id:'order_other'}],
    ['different currency',{...captured,currency:'USD'}],
    ['refunded purchase',{...captured,amount_refunded:1}],
    ['different payment identity',{...captured,id:'pay_other'}],
  ])('rejects %s',async(_name,payment)=>{provider(payment);expect(await verifyCreditPurchase(args)).toBe(false);});
  it.each([
    ['another workspace',{...order,notes:{...order.notes,workspaceId:'other-workspace'}}],
    ['another pack',{...order,notes:{...order.notes,packId:'other-pack'}}],
    ['larger claimed credit count',{...order,notes:{...order.notes,credits:'1000'}}],
    ['order amount mismatch',{...order,amount:100}],
    ['missing provider notes',{...order,notes:undefined}],
  ])('rejects %s',async(_name,sourceOrder)=>{provider(captured,sourceOrder);expect(await verifyCreditPurchase(args)).toBe(false);});
  it('rejects malformed provider references before network access',async()=>{
    await expect(fetchRazorpay('payments','../secret')).rejects.toThrow('Invalid provider reference');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not expose provider error bodies',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('private provider details',{status:401})));
    await expect(fetchRazorpay('payments',args.paymentId)).rejects.toThrow('Payment provider request failed');
  });
});
