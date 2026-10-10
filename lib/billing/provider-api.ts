import "server-only";
import { razorpayKeyId } from "./razorpay";

/** Fixed provider origin, no redirects, bounded response and a real network
 * timeout. Provider error bodies and credentials never reach callers/logs. */
export async function fetchRazorpay<T>(resource:"orders"|"payments"|"subscriptions",id:string):Promise<T> {
  if(!/^[A-Za-z0-9_]{1,100}$/.test(id)) throw new Error("Invalid provider reference");
  return requestRazorpay<T>(`${resource}/${id}`);
}
export function postRazorpay<T>(path:string,body:Record<string,unknown>):Promise<T> {
  if(!/^(subscriptions|orders)(?:\/[A-Za-z0-9_]{1,100}\/cancel)?$/.test(path)) throw new Error("Invalid payment operation");
  return requestRazorpay<T>(path,body);
}
async function requestRazorpay<T>(path:string,body?:Record<string,unknown>):Promise<T> {
  const secret=process.env.RAZORPAY_KEY_SECRET;
  const key=razorpayKeyId();
  if(!secret || !key) throw new Error("Payment provider unavailable");
  const response=await fetch(`https://api.razorpay.com/v1/${path}`,{
    method:body ? 'POST' : 'GET',body:body ? JSON.stringify(body) : undefined,
    headers:{'content-type':'application/json',authorization:`Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`},
    redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10_000),
  });
  if(!response.ok || !response.body) {await response.body?.cancel();throw new Error("Payment provider request failed");}
  const reader=response.body.getReader();
  const chunks:Uint8Array[]=[];
  let size=0;
  try {for(;;){const chunk=await reader.read();if(chunk.done) break;size+=chunk.value.length;if(size>1_048_576) throw new Error("Provider response too large");chunks.push(chunk.value);}}
  finally {await reader.cancel().catch(()=>{});}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

export interface CapturedPayment { id:string;status:string;amount:number;currency:string;order_id:string;amount_refunded?:number }
export interface ProviderOrder { id:string;amount:number;currency:string;notes?:Record<string,string> }
export async function verifyCreditPurchase(args:{workspaceId:string;packId:string;credits:number;amount:number;orderId:string;paymentId:string}):Promise<boolean> {
  const [payment,order]=await Promise.all([
    fetchRazorpay<CapturedPayment>('payments',args.paymentId),fetchRazorpay<ProviderOrder>('orders',args.orderId),
  ]);
  return payment.id===args.paymentId && payment.status==='captured' && payment.order_id===args.orderId &&
    payment.amount===args.amount && payment.currency==='INR' && (payment.amount_refunded ?? 0)===0 &&
    order.id===args.orderId && order.amount===args.amount && order.currency==='INR' &&
    order.notes?.workspaceId===args.workspaceId && order.notes?.packId===args.packId && order.notes?.credits===String(args.credits);
}
