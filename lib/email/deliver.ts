import { getServiceSupabase } from "@/lib/supabase/admin";
import { sendEmail } from "./resend";
import { isAzureBackend } from "@/lib/backend";
import { reserveEmail,completeEmail,emailOperation,deferEmail,type JobLease } from "@/lib/db/repositories/jobs";
import { databaseResult } from "@/lib/db/result";

export async function deliverEmail(key: string, workspaceId: string, monthlyLimit: number, mail: Parameters<typeof sendEmail>[0],lease?:Pick<JobLease,'id'|'lease_token'>) {
  const admin = getServiceSupabase()!;
  if(isAzureBackend() && !lease) return 'failed' as const;
  const frozen = {...mail,from:process.env.EMAIL_FROM,...(process.env.EMAIL_PROVIDER === 'azure' ? {provider:'azure',providerEndpoint:process.env.AZURE_EMAIL_ENDPOINT} : {provider:'resend'})};
  const { data, error } = isAzureBackend() ? await databaseResult(reserveEmail(lease!,key,monthlyLimit,mail.to.slice(0,5).length,frozen)) : await admin.rpc("reserve_notification_email", {
    p_key: key, p_workspace_id: workspaceId, p_limit: monthlyLimit,
    p_quantity: mail.to.slice(0, 5).length, p_request: frozen,
  });
  if (error || !data) return "failed" as const;
  if (data.status === "sent") return "sent" as const;
  if (data.status === "limited") return "skipped" as const;
  const request = data.request as Parameters<typeof sendEmail>[0];
  // Existing reservations predate the provider field and belong to Resend.
  const provider = request.provider ?? 'resend';
  if (provider === 'resend' && Date.now() - Date.parse(data.created_at) > 23 * 3600_000) return "uncertain" as const;
  const operation = provider === 'azure' && isAzureBackend() ? await emailOperation(lease!,key) : null;
  if (provider === 'azure' && isAzureBackend() && !operation) return 'failed' as const;
  if (operation?.provider_retry_at && Date.parse(operation.provider_retry_at)>Date.now()) return 'deferred' as const;
  const result = await sendEmail({ ...request,provider, ...(provider === 'azure' ? {firstSentAt:operation?.provider_first_sent_at ?? data.created_at,providerOperationId:operation?.provider_operation_id ?? undefined,providerOperationFresh:operation?.provider_operation_fresh === true} : {}), idempotencyKey: key });
  if (result.uncertain) return 'uncertain' as const;
  if (result.deferred && isAzureBackend()) {
    if (result.rejected && (!operation?.provider_operation_id || !await deferEmail(lease!,key,operation.provider_operation_id,result.retryAfterSeconds ?? 60))) return 'failed' as const;
    return 'deferred' as const;
  }
  if (!result.ok) return "failed" as const;
  const savedResult=isAzureBackend() ? await databaseResult(completeEmail(lease!,key)) : await admin.from("email_reservations").update({ status: "sent", request: {} }).eq("key", key);
  const saved=savedResult.error || (isAzureBackend() && !savedResult.data);
  return saved ? "failed" as const : "sent" as const;
}
