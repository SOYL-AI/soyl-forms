import { getServiceSupabase } from "@/lib/supabase/admin";
import { ActivityChart } from "./DashboardCharts";
import { 
  Users, 
  Building2, 
  FileText, 
  MessageSquare, 
  CreditCard, 
  HardDrive, 
  AlertCircle, 
  Ban 
} from "lucide-react";

function dayStart(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString();
}

function formatDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default async function SuperAdminOverview() {
  const admin = getServiceSupabase();
  if (!admin) {
    return <p className="text-sm text-ink-soft">Server misconfigured.</p>;
  }

  const [
    { count: users },
    { count: users7d },
    { count: workspaces },
    { count: publishedForms },
    { count: subsToday },
    { count: subs7d },
    { count: subs30d },
    { data: subs },
    { data: files },
    { data: deliveries },
    { count: suspendedWs },
    { count: closedForms },
    { data: recentSubmissions }
  ] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", dayStart(7)),
    admin.from("workspaces").select("id", { count: "exact", head: true }).eq("status", "active"),
    admin.from("forms").select("id", { count: "exact", head: true }).eq("status", "published"),
    admin.from("submissions").select("id", { count: "exact", head: true }).gte("submitted_at", dayStart(1)),
    admin.from("submissions").select("id", { count: "exact", head: true }).gte("submitted_at", dayStart(7)),
    admin.from("submissions").select("id", { count: "exact", head: true }).gte("submitted_at", dayStart(30)),
    admin.from("subscriptions").select("plan_code, status, billing_interval"),
    admin.from("uploaded_files").select("size_bytes").neq("status", "deleted").limit(5000),
    admin.from("webhook_deliveries").select("http_status").gte("id", "00000000-0000-0000-0000-000000000000").limit(500),
    admin.from("workspaces").select("id", { count: "exact", head: true }).eq("status", "suspended"),
    admin.from("forms").select("id", { count: "exact", head: true }).eq("status", "closed"),
    admin.from("submissions").select("submitted_at").gte("submitted_at", dayStart(30))
  ]);

  const plans = (subs ?? []) as Array<{ plan_code: string; status: string; billing_interval: string | null }>;
  const paid = plans.filter((s) => (s.status === "active" || s.status === "authenticated"));
  let mrr = 0;
  for (const s of paid) {
    if (s.plan_code === "starter") mrr += s.billing_interval === "yearly" ? Math.round(199000 / 12) : 19900;
    if (s.plan_code === "pro") mrr += s.billing_interval === "yearly" ? Math.round(499000 / 12) : 49900;
  }
  const storageBytes = ((files ?? []) as Array<{ size_bytes: number }>).reduce((s, f) => s + f.size_bytes, 0);
  const dl = (deliveries ?? []) as Array<{ http_status: number | null }>;
  const failedDl = dl.filter((d) => d.http_status === null || d.http_status >= 400).length;

  // Process chart data
  const chartMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    chartMap.set(formatDateKey(dayStart(i)), 0);
  }
  
  const rawSubmissions = (recentSubmissions ?? []) as { submitted_at: string }[];
  rawSubmissions.forEach(sub => {
    const key = formatDateKey(sub.submitted_at);
    if (chartMap.has(key)) {
      chartMap.set(key, (chartMap.get(key) || 0) + 1);
    }
  });

  const chartData = Array.from(chartMap.entries()).map(([date, responses]) => ({
    date,
    responses
  }));

  const cards = [
    { label: "Total Users", value: (users ?? 0).toLocaleString("en-IN"), icon: Users, subtext: `+${users7d ?? 0} this week` },
    { label: "Active Workspaces", value: (workspaces ?? 0).toLocaleString("en-IN"), icon: Building2, subtext: "Platform wide" },
    { label: "Live Forms", value: (publishedForms ?? 0).toLocaleString("en-IN"), icon: FileText, subtext: "Currently published" },
    { label: "MRR Estimate", value: `₹${Math.round(mrr / 100).toLocaleString("en-IN")}`, icon: CreditCard, subtext: `${paid.length} paying` },
  ];

  const secondaryCards = [
    { label: "Responses Today", value: (subsToday ?? 0).toLocaleString("en-IN"), icon: MessageSquare },
    { label: "Responses 7d", value: (subs7d ?? 0).toLocaleString("en-IN"), icon: MessageSquare },
    { label: "Storage Used", value: `${(storageBytes / 1024 / 1024).toFixed(1)} MB`, icon: HardDrive },
    { label: "Webhook Failures", value: `${failedDl}/${dl.length}`, icon: AlertCircle },
    { label: "Suspended / Closed", value: `${suspendedWs ?? 0} / ${closedForms ?? 0}`, icon: Ban },
  ];

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-foreground font-bold">Platform overview</h1>
        <p className="mt-1 text-sm text-ink-soft">Real-time metrics and health status of the SOYL Forms platform.</p>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="relative overflow-hidden rounded-2xl border border-ink/10 bg-paper p-5 shadow-sm transition-all hover:bg-paper-deep">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold tracking-wide text-ink-soft">{card.label}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
                  <Icon className="h-5 w-5 text-brand-500" />
                </div>
              </div>
              <p className="mt-4 font-display text-3xl text-foreground font-bold">{card.value}</p>
              <p className="mt-1 text-xs text-brand-600 dark:text-brand-400">{card.subtext}</p>
            </div>
          );
        })}
      </div>

      {/* Chart Section */}
      <div className="rounded-3xl border border-ink/10 bg-paper p-6 shadow-sm">
        <h2 className="text-lg font-bold text-foreground mb-6">Response Volume (30 Days)</h2>
        <ActivityChart data={chartData} />
      </div>

      {/* Secondary Metrics */}
      <div>
        <h3 className="text-base font-bold text-foreground mb-4">System Health</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {secondaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-xl border border-ink/10 bg-paper p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-4 w-4 text-ink-faint" />
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint">{card.label}</p>
                </div>
                <p className="font-display text-2xl text-foreground font-semibold">{card.value}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-ink-faint">
          Webhook sample covers recent delivery rows; storage sums the retained
          (non-deleted) objects sample. No impersonation exists in V1 — every
          moderation action is audit-logged.
        </p>
      </div>
    </div>
  );
}
