import Link from "next/link";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { PLANS } from "@/lib/plans";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { formatBytes, pct } from "@/lib/utils";
import { ActivityChart, BarsChart } from "./DashboardCharts";
import { dailySeries, dayStart, paise, revenueSnapshot } from "./stats";

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "danger" }) {
  return (
    <Card className="!p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{label}</p>
      <p className={`mt-1 font-display text-2xl tracking-tight ${tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : ""}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-ink-faint">{sub}</p> : null}
    </Card>
  );
}

export default async function SuperAdminOverview() {
  const admin = getServiceSupabase();
  if (!admin) return <p className="text-sm text-ink-soft">Server misconfigured.</p>;
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;

  const [
    { count: users },
    { count: users7d },
    { count: users30d },
    { data: signups },
    { count: workspaces },
    { count: suspendedWs },
    { count: publishedForms },
    { count: closedForms },
    { count: subsToday },
    { count: subs7d },
    { count: subs30d },
    { data: recentSubmissions },
    { data: subs },
    { data: files },
    { data: deliveries },
    { data: usage },
    { data: ledger },
    { data: lastHour },
  ] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", dayStart(7)),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", dayStart(30)),
    admin.from("profiles").select("created_at").gte("created_at", dayStart(30)).limit(5000),
    admin.from("workspaces").select("id", { count: "exact", head: true }).eq("status", "active"),
    admin.from("workspaces").select("id", { count: "exact", head: true }).eq("status", "suspended"),
    admin.from("forms").select("id", { count: "exact", head: true }).eq("status", "published"),
    admin.from("forms").select("id", { count: "exact", head: true }).eq("status", "closed"),
    admin.from("submissions").select("id", { count: "exact", head: true }).gte("submitted_at", dayStart(0)),
    admin.from("submissions").select("id", { count: "exact", head: true }).gte("submitted_at", dayStart(7)),
    admin.from("submissions").select("id", { count: "exact", head: true }).gte("submitted_at", dayStart(30)),
    admin.from("submissions").select("submitted_at").gte("submitted_at", dayStart(30)).limit(20000),
    admin.from("subscriptions").select("plan_code, status, billing_interval"),
    admin.from("uploaded_files").select("size_bytes").neq("status", "deleted").limit(10000),
    admin.from("webhook_deliveries").select("http_status").order("delivered_at", { ascending: false, nullsFirst: true }).limit(500),
    admin.from("usage_monthly").select("workspace_id, completed_submissions, file_storage_bytes, notification_emails").eq("month", monthStart).order("completed_submissions", { ascending: false }).limit(10),
    admin.from("ai_credit_ledger").select("delta").lt("delta", 0).gte("created_at", dayStart(30)).limit(10000),
    admin.from("submissions").select("form_id").gte("submitted_at", new Date(Date.now() - 3600_000).toISOString()).limit(10000),
  ]);

  const revenue = revenueSnapshot((subs ?? []) as Array<{ plan_code: string; status: string; billing_interval: string | null }>);
  const storageBytes = ((files ?? []) as Array<{ size_bytes: number }>).reduce((s, f) => s + f.size_bytes, 0);
  const dl = (deliveries ?? []) as Array<{ http_status: number | null }>;
  const failedDl = dl.filter((d) => d.http_status === null || d.http_status >= 400).length;
  const creditsSpent = ((ledger ?? []) as Array<{ delta: number }>).reduce((s, l) => s + Math.abs(l.delta), 0);

  const responseSeries = dailySeries(((recentSubmissions ?? []) as Array<{ submitted_at: string }>).map((s) => ({ at: s.submitted_at })), 30, "responses");
  const signupSeries = dailySeries(((signups ?? []) as Array<{ created_at: string }>).map((s) => ({ at: s.created_at })), 30, "signups");
  const planMix = [
    { label: "Free", count: revenue.byPlan.free },
    { label: "Starter", count: revenue.byPlan.starter },
    { label: "Pro", count: revenue.byPlan.pro },
  ];

  // Abuse signals: bursty forms in the last hour.
  const burst = new Map<string, number>();
  for (const r of (lastHour ?? []) as Array<{ form_id: string }>) burst.set(r.form_id, (burst.get(r.form_id) ?? 0) + 1);
  const bursty = [...burst.entries()].filter(([, n]) => n >= 100).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Top workspaces this month with names + plan.
  const top = (usage ?? []) as Array<{ workspace_id: string; completed_submissions: number; file_storage_bytes: number; notification_emails: number }>;
  const wsIds = top.map((u) => u.workspace_id);
  const [{ data: spaces }, { data: topSubs }] = wsIds.length
    ? await Promise.all([
        admin.from("workspaces").select("id, name").in("id", wsIds),
        admin.from("subscriptions").select("workspace_id, plan_code, status, override_reason, override_expires_at").in("workspace_id", wsIds),
      ])
    : [{ data: [] }, { data: [] }];
  const nameById = new Map(((spaces ?? []) as Array<{ id: string; name: string }>).map((w) => [w.id, w.name]));
  const planById = new Map(
    ((topSubs ?? []) as Array<{ workspace_id: string; plan_code: string; status: string }>).map((s) => [s.workspace_id, s]),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Platform overview</h1>
        <p className="mt-1 text-sm text-ink-soft">Live counts from the database. Revenue is estimated from entitled subscriptions at list price.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Users" value={(users ?? 0).toLocaleString("en-IN")} sub={`+${users7d ?? 0} in 7d · +${users30d ?? 0} in 30d`} />
        <Kpi label="Active workspaces" value={(workspaces ?? 0).toLocaleString("en-IN")} sub={suspendedWs ? `${suspendedWs} suspended` : "none suspended"} tone={suspendedWs ? "warn" : undefined} />
        <Kpi label="MRR (estimate)" value={paise(revenue.mrrPaise)} sub={`${revenue.paying} paying · ARR ${paise(revenue.mrrPaise * 12)}`} />
        <Kpi label="Live forms" value={(publishedForms ?? 0).toLocaleString("en-IN")} sub={`${closedForms ?? 0} closed`} />
        <Kpi label="Responses today" value={(subsToday ?? 0).toLocaleString("en-IN")} sub={`${(subs7d ?? 0).toLocaleString("en-IN")} in 7d · ${(subs30d ?? 0).toLocaleString("en-IN")} in 30d`} />
        <Kpi label="Storage used" value={formatBytes(storageBytes)} sub="retained objects" />
        <Kpi
          label="Webhook failures"
          value={dl.length ? `${pct(failedDl, dl.length)}%` : "—"}
          sub={`${failedDl}/${dl.length} recent deliveries`}
          tone={dl.length && pct(failedDl, dl.length) > 20 ? "danger" : undefined}
        />
        <Kpi label="AI credits spent" value={creditsSpent.toLocaleString("en-IN")} sub="last 30 days" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="text-sm font-semibold">Responses · 30 days</p>
          <div className="mt-3">
            <ActivityChart data={responseSeries} dataKey="responses" label="Responses" />
          </div>
        </Card>
        <Card>
          <p className="text-sm font-semibold">Sign-ups · 30 days</p>
          <div className="mt-3">
            <ActivityChart data={signupSeries} dataKey="signups" label="Sign-ups" />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card>
          <p className="text-sm font-semibold">Plan mix</p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {revenue.monthly} monthly · {revenue.yearly} yearly · {PLANS.starter.name} {paise(PLANS.starter.monthlyPaise)}/mo, {PLANS.pro.name} {paise(PLANS.pro.monthlyPaise)}/mo
          </p>
          <div className="mt-3">
            <BarsChart data={planMix} dataKey="count" label="Workspaces" />
          </div>
        </Card>
        <Card padded={false}>
          <div className="flex items-center justify-between px-5 pt-5">
            <p className="text-sm font-semibold">Top workspaces this month</p>
            <Link href="/super-admin/usage" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink">
              Usage & cost <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-3 border-t border-line">
            {top.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-soft">No usage recorded this month yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <Th>Workspace</Th>
                    <Th>Plan</Th>
                    <Th className="text-right">Responses</Th>
                    <Th className="text-right">Quota</Th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((u) => {
                    const s = planById.get(u.workspace_id);
                    const code = s && (s.plan_code === "starter" || s.plan_code === "pro") && (s.status === "active" || s.status === "authenticated") ? s.plan_code : "free";
                    const quota = PLANS[code].entitlements.monthlySubmissions;
                    const p = pct(u.completed_submissions, quota);
                    return (
                      <tr key={u.workspace_id}>
                        <Td>
                          <Link href={`/super-admin/workspaces/${u.workspace_id}`} className="font-medium hover:underline">
                            {nameById.get(u.workspace_id) ?? u.workspace_id.slice(0, 8)}
                          </Link>
                        </Td>
                        <Td>
                          <Badge tone={code === "free" ? "neutral" : "accent"}>{PLANS[code].name}</Badge>
                        </Td>
                        <Td className="text-right tabular-nums">{u.completed_submissions.toLocaleString("en-IN")}</Td>
                        <Td className="text-right tabular-nums">
                          <span className={p >= 95 ? "font-semibold text-danger" : p >= 80 ? "font-semibold text-warn" : ""}>{p}%</span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-warn" /> Abuse signals
        </p>
        {bursty.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No form received 100+ responses in the last hour.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {bursty.map(([formId, n]) => (
              <li key={formId} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/super-admin/forms?q=${formId}`} className="font-mono text-xs hover:underline">
                  {formId}
                </Link>
                <Badge tone="danger">{n} in the last hour</Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-faint">Velocity is checked against raw submissions. Suspend from the Forms page — data is preserved as evidence.</p>
      </Card>
    </div>
  );
}
