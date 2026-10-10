import { getServiceSupabase } from "@/lib/supabase/admin";
import { sendEmail } from "./resend";
import { isAzureBackend } from "@/lib/backend";
import { reserveEmail,completeEmail,type JobLease } from "@/lib/db/repositories/jobs";
import { databaseResult } from "@/lib/db/result";

export async function deliverEmail(key: string, workspaceId: string, monthlyLimit: number, mail: Parameters<typeof sendEmail>[0],lease?:Pick<JobLease,'id'|'lease_token'>) {
  const admin = getServiceSupabase()!;
  if(isAzureBackend() && !lease) return 'failed' as const;
  const { data, error } = isAzureBackend() ? await databaseResult(reserveEmail(lease!,key,monthlyLimit,mail.to.slice(0,5).length,{...mail,from:process.env.EMAIL_FROM})) : await admin.rpc("reserve_notification_email", {
    p_key: key, p_workspace_id: workspaceId, p_limit: monthlyLimit,
    p_quantity: mail.to.slice(0, 5).length, p_request: { ...mail, from: process.env.EMAIL_FROM },
  });
  if (error || !data) return "failed" as const;
  if (data.status === "sent") return "sent" as const;
  if (data.status === "limited") return "skipped" as const;
  // Resend deduplicates for 24h. Stop ambiguous retries before that guarantee expires.
  if (Date.now() - Date.parse(data.created_at) > 23 * 3600_000) return "uncertain" as const;
  const result = await sendEmail({ ...(data.request as Parameters<typeof sendEmail>[0]), idempotencyKey: key });
  if (!result.ok) return "failed" as const;
  const savedResult=isAzureBackend() ? await databaseResult(completeEmail(lease!,key)) : await admin.from("email_reservations").update({ status: "sent", request: {} }).eq("key", key);
  const saved=savedResult.error || (isAzureBackend() && !savedResult.data);
  return saved ? "failed" as const : "sent" as const;
}
