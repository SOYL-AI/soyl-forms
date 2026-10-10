import { withUserTransaction } from "@/lib/db/pool";
import type { FormSummary } from "@/app/dashboard/page";

interface FormMetrics extends FormSummary { total: string; monthly: string }
export async function readDashboard(userId: string, workspaceId: string) {
  return withUserTransaction(userId, async (db) => {
    // Aggregate in PostgreSQL instead of silently truncating response/file rows.
    const forms = (await db.query<FormMetrics>(`select f.id,f.title,f.slug,f.status,f.updated_at::text,f.published_at::text,f.brand_kit_id,
      count(s.id) filter(where s.deleted_at is null) as total,
      count(s.id) filter(where s.deleted_at is null and s.submitted_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC') as monthly
      from forms f left join submissions s on s.form_id=f.id where f.workspace_id=$1 group by f.id order by f.updated_at desc,f.id`, [workspaceId])).rows;
    const usage = (await db.query<{ used: string }>("select completed_submissions as used from usage_monthly where workspace_id=$1 and month=date_trunc('month',now() at time zone 'UTC')::date", [workspaceId])).rows[0];
    const storage = (await db.query<{ used: string }>("select coalesce(sum(size_bytes),0) as used from uploaded_files where workspace_id=$1 and status<>'deleted'", [workspaceId])).rows[0];
    const credit = (await db.query<{ balance: string }>("select balance from ai_credits where workspace_id=$1", [workspaceId])).rows[0];
    return {
      forms, total: new Map(forms.map(f => [f.id, Number(f.total)])),
      thisMonth: new Map(forms.map(f => [f.id, Number(f.monthly)])),
      monthlyUsed: Number(usage?.used ?? 0), storageUsed: Number(storage.used), credits: Number(credit?.balance ?? 0),
    };
  });
}
