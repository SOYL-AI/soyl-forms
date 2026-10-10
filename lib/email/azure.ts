import { createHash, randomUUID } from 'node:crypto';
import { ManagedIdentityCredential } from '@azure/identity';

export interface AzureEmailRequest {
  to: string[]; subject: string; html: string; text: string;
  replyTo?: string; from?: string; idempotencyKey?: string;
  firstSentAt?: string; providerEndpoint?: string; providerOperationId?: string;
}
export interface EmailSendResult { ok: boolean; error?: string; uncertain?: boolean; deferred?: boolean; rejected?: boolean; retryAfterSeconds?: number }

export function validAzureEmailEndpoint(raw: string | undefined): string | null {
  try {
    const url = new URL(raw ?? '');
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.communication\.azure\.com$/i.test(url.hostname)
      || url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return url.origin;
  } catch { return null; }
}

function operationId(key?: string): string {
  if (!key) return randomUUID();
  const bytes = createHash('sha256').update(`soyl-forms:email:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

let credential: ManagedIdentityCredential | undefined;
export async function sendAzureEmail(mail: AzureEmailRequest): Promise<EmailSendResult> {
  const endpoint = validAzureEmailEndpoint(mail.providerEndpoint ?? process.env.AZURE_EMAIL_ENDPOINT);
  const from = mail.from ?? process.env.EMAIL_FROM;
  if (!endpoint || !from || !process.env.AZURE_CLIENT_ID) return {ok:false,error:'Azure email is not configured.'};
  const firstSent = mail.firstSentAt ? new Date(mail.firstSentAt) : new Date();
  if (!Number.isFinite(firstSent.getTime())) return {ok:false,uncertain:true,error:'Email reservation time is invalid.'};
  const id = mail.providerOperationId ?? operationId(mail.idempotencyKey);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return {ok:false,uncertain:true,error:'Email operation ID is invalid.'};
  const signal = AbortSignal.timeout(12_000);
  try {
    credential ??= new ManagedIdentityCredential({clientId:process.env.AZURE_CLIENT_ID,retryOptions:{maxRetries:0}});
    const token = await credential.getToken('https://communication.azure.com/.default', {abortSignal:signal});
    const headers = {authorization:`Bearer ${token.token}`};
    const statusUrl = `${endpoint}/emails/operations/${id}?api-version=2023-03-31`;
    const check = async (): Promise<EmailSendResult | null> => {
      const res = await fetch(statusUrl,{headers,signal,redirect:'error'});
      if (res.status === 404) return null;
      if (res.status === 429) return {ok:false,deferred:true,error:'Azure email status is throttled.'};
      if (!res.ok) return {ok:false,error:`Azure email status HTTP ${res.status}`};
      const result = await res.json() as {id?:string;status?:string};
      if (result.id?.toLowerCase() !== id.toLowerCase()) return {ok:false,uncertain:true,error:'Azure email operation mismatch.'};
      if (result.status === 'Succeeded') return {ok:true};
      if (result.status === 'Failed' || result.status === 'Canceled') return {ok:false,uncertain:true,error:'Azure email operation failed.'};
      return {ok:false,deferred:true,error:'Azure email is processing.'};
    };
    // Recover a successful send even if the worker died before saving its SQL checkpoint.
    // Never use an operation-location supplied by the provider as a fetch destination.
    if (mail.idempotencyKey) {
      const existing = await check();
      if (existing) return existing;
    }
    // ACS repeatability lasts five minutes, unlike Resend's 24 hours. Both
    // repeatability headers and Operation-Id remain identical across retries.
    // After the window, only poll; a missing operation needs operator review.
    const age = Date.now() - firstSent.getTime();
    if (age < -30_000 || age >= 270_000) return {ok:false,uncertain:true,error:'Azure email retry window expired.'};
    const res = await fetch(`${endpoint}/emails:send?api-version=2023-03-31`,{
      method:'POST',redirect:'error',signal,
      headers:{...headers,'content-type':'application/json','Operation-Id':id,
        'Repeatability-Request-Id':id,'Repeatability-First-Sent':firstSent.toUTCString()},
      body:JSON.stringify({senderAddress:from,recipients:{to:mail.to.slice(0,5).map(address=>({address}))},
        content:{subject:mail.subject.slice(0,200),html:mail.html,plainText:mail.text},
        ...(mail.replyTo ? {replyTo:[{address:mail.replyTo}]} : {}),userEngagementTrackingDisabled:true}),
    });
    if (res.status === 429) {
      const raw = res.headers.get('retry-after');
      const delay = raw && /^\d+$/.test(raw) ? Number(raw) : raw ? Math.ceil((Date.parse(raw)-Date.now())/1000) : 60;
      return {ok:false,deferred:true,rejected:true,retryAfterSeconds:Number.isFinite(delay) ? Math.max(60,Math.min(3600,delay)) : 60,error:'Azure email sending is throttled.'};
    }
    if (res.status === 412) return {ok:false,uncertain:true,error:'Azure email retry window expired.'};
    if (res.status !== 202 && res.status !== 409) return {ok:false,error:`Azure email send HTTP ${res.status}`};
    // Direct invitations can report provider acceptance. Durable notifications
    // require a successful operation and will poll the same ID on the next job.
    if (!mail.idempotencyKey) return {ok:true};
    return (await check()) ?? {ok:false,deferred:true,error:'Azure email operation is not visible yet.'};
  } catch {
    return {ok:false,error:'Azure email is temporarily unavailable.'};
  }
}
