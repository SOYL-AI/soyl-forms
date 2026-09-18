import { getServiceSupabase } from "@/lib/supabase/admin";
import { OverrideForm } from "../Controls";

export default async function AdminBillingPage() {
  const admin = getServiceSupabase();
  if (!admin) return <p className="text-sm">Server misconfigured.</p>;

  const { data } = await admin
    .from("subscriptions")
    .select(
      "workspace_id, plan_code, status, provider_subscription_id, provider_plan_id, billing_interval, current_period_end, override_reason, override_expires_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(100);
  const subs = ((data ?? []) as Array<Record<string, string | null>>);

  const wsIds = [...new Set(subs.map((s) => s.workspace_id as string))];
  const { data: spaces } = wsIds.length
    ? await admin.from("workspaces").select("id, name, status").in("id", wsIds)
    : { data: [] };
  const spaceById = new Map(
    ((spaces ?? []) as Array<{ id: string; name: string; status: string }>).map((w) => [w.id, w]),
  );

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight">Subscriptions & billing</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Provider ids and status per workspace. Overrides demand reason + expiry
        and are audit-logged.
      </p>
      <ul className="mt-4 space-y-3">
        {subs.map((s) => (
          <li key={s.workspace_id as string} className="rounded-2xl border border-ink/10 bg-white px-5 py-4">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {spaceById.get(s.workspace_id as string)?.name ?? (s.workspace_id as string).slice(0, 8)}
              <span className="rounded-full bg-paper-deep px-2.5 py-0.5 text-[11px] font-semibold">
                {s.plan_code as string} · {s.status as string}
                {s.billing_interval ? ` · ${s.billing_interval}` : ""}
              </span>
              {s.override_reason ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">
                  Override to {s.plan_code as string}
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-ink-faint">
              ws {(s.workspace_id as string).slice(0, 8)} · sub {String(s.provider_subscription_id ?? "—").slice(0, 18)} ·
              plan {String(s.provider_plan_id ?? "—").slice(0, 18)} ·
              period ends {String(s.current_period_end ?? "—").slice(0, 10)}
            </p>
            <OverrideForm
              workspaceId={s.workspace_id as string}
              currentPlan={(s.plan_code as string) ?? "free"}
            />
          </li>
        ))}
      </ul>
      {subs.length === 0 && <p className="mt-4 text-sm text-ink-soft">No subscriptions yet.</p>}
    </div>
  );
}
