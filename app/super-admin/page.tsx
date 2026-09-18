import { getServiceSupabase } from "@/lib/supabase/admin";

function dayStart(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString();
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
  ]);

  const plans = (subs ?? []) as Array<{ plan_code: string; status: string; billing_interval: string | null }>;
  const paid = plans.filter((s) => (s.status === "active" || s.status === "authenticated"));
  // MRR estimate: monthly price, yearly spread over 12.
  let mrr = 0;
  for (const s of paid) {
    if (s.plan_code === "starter") mrr += s.billing_interval === "yearly" ? Math.round(199000 / 12) : 19900;
    if (s.plan_code === "pro") mrr += s.billing_interval === "yearly" ? Math.round(499000 / 12) : 49900;
  }
  const storageBytes = ((files ?? []) as Array<{ size_bytes: number }>).reduce((s, f) => s + f.size_bytes, 0);
  const dl = (deliveries ?? []) as Array<{ http_status: number | null }>;
  const failedDl = dl.filter((d) => d.http_status === null || d.http_status >= 400).length;

  const cards: Array<[string, string]> = [
    ["Users", (users ?? 0).toLocaleString("en-IN")],
    ["New users · 7d", (users7d ?? 0).toLocaleString("en-IN")],
    ["Active workspaces", (workspaces ?? 0).toLocaleString("en-IN")],
    ["Live forms", (publishedForms ?? 0).toLocaleString("en-IN")],
    ["Responses · today", (subsToday ?? 0).toLocaleString("en-IN")],
    ["Responses · 7d", (subs7d ?? 0).toLocaleString("en-IN")],
    ["Responses · 30d", (subs30d ?? 0).toLocaleString("en-IN")],
    ["Paying workspaces", paid.length.toLocaleString("en-IN")],
    ["MRR estimate", `₹${Math.round(mrr / 100).toLocaleString("en-IN")}`],
    ["Storage used", `${(storageBytes / 1024 / 1024).toFixed(1)} MB`],
    ["Webhook failures (sample)", `${failedDl}/${dl.length}`],
    ["Suspended: ws / forms", `${suspendedWs ?? 0} / ${closedForms ?? 0}`],
  ];

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight">Platform overview</h1>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-ink/10 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint">{label}</p>
            <p className="font-display text-2xl">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-ink-faint">
        Webhook sample covers recent delivery rows; storage sums the retained
        (non-deleted) objects sample. No impersonation exists in V1 — every
        moderation action below is audit-logged.
      </p>
    </div>
  );
}
