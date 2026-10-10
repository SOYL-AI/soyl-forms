import "server-only";
import { NextResponse } from "next/server";
import { razorpayKeyId } from "./razorpay";
import * as billing from "@/lib/db/repositories/billing";
import { readWorkspaceRole } from "@/lib/db/repositories/workspaces";
import { fetchRazorpay,postRazorpay } from "./provider-api";
import { planFromRazorpayPlanId } from "./subscriptions";
import type { BillingInterval,PlanCode } from "@/lib/plans";

export async function startCheckout(userId:string,workspaceId:string,plan:PlanCode,interval:BillingInterval,planId:string) {
  let token:string|undefined;
  let createdId:string|undefined;
  try {
    const reservation=await billing.beginCheckout(userId,workspaceId,plan,interval);
    if(reservation.subscriptionId) return NextResponse.json({key:razorpayKeyId(),subscriptionId:reservation.subscriptionId,plan,interval});
    token=reservation.token;
    if(!token) throw new Error("Checkout unavailable");
    const created=await postRazorpay<{id:string}>("subscriptions",{plan_id:planId,customer_notify:1,total_count:interval==='monthly'?120:10,notes:{workspaceId,plan,interval}});
    createdId=created.id;
    if(!await billing.completeCheckout(userId,workspaceId,token,createdId,planId,plan,interval)) throw new Error("Checkout reservation expired");
    return NextResponse.json({key:razorpayKeyId(),subscriptionId:createdId,plan,interval});
  } catch(error) {
    if(token) await billing.abortCheckout(userId,workspaceId,token).catch(()=>{});
    if(createdId) console.error(JSON.stringify({event:'billing_checkout_persistence_failed',providerSubscriptionId:createdId}));
    const code=error && typeof error==='object' && 'code' in error ? String(error.code) : '';
    return NextResponse.json({error:code==='42501'?'Only workspace owners manage billing.':code==='P0001' && error instanceof Error ? error.message : 'Could not start checkout. Please try again.'},{status:code==='42501'?403:409});
  }
}

export async function reconcileBillingEvent(args:{id:string;event:string;hash:string;providerId:string|null}) {
  const observed=new Date().toISOString();
  if(!args.providerId) return billing.applyBillingEvent({...args,snapshot:null,observed});
  const live=await fetchRazorpay<{id:string;plan_id:string;status:string;current_start?:number|null;current_end?:number|null}>('subscriptions',args.providerId);
  if(live.id!==args.providerId || !['created','authenticated','active','pending','halted','paused','cancelled','expired','completed'].includes(live.status)) throw new Error('Invalid provider subscription');
  const match=planFromRazorpayPlanId(live.plan_id);
  if(!match && ['active','authenticated'].includes(live.status)) throw new Error('Unknown provider plan');
  const instant=(value:number|null|undefined) => value==null ? null : Number.isFinite(value) && value>0 ? new Date(value*1000).toISOString() : null;
  return billing.applyBillingEvent({...args,observed,snapshot:{status:live.status==='paused'?'halted':live.status,providerPlanId:live.plan_id,plan:match?.plan,interval:match?.interval,currentPeriodStart:instant(live.current_start),currentPeriodEnd:instant(live.current_end)}});
}

export async function cancelSubscription(userId:string,workspaceId:string) {
  if(await readWorkspaceRole(userId,workspaceId)!=='owner') return NextResponse.json({error:'Only workspace owners manage billing.'},{status:403});
  const sub=await billing.subscription(userId,workspaceId);
  if(!sub?.provider_subscription_id) return NextResponse.json({error:'No active subscription to cancel.'},{status:400});
  try {
    await postRazorpay(`subscriptions/${sub.provider_subscription_id}/cancel`,{cancel_at_cycle_end:1});
    if(!await billing.requestCancellation(userId,workspaceId,sub.provider_subscription_id)) throw new Error('Subscription changed');
    return NextResponse.json({ok:true});
  } catch {return NextResponse.json({error:'Could not request cancellation. Please retry.'},{status:502});}
}
