import { getServiceSupabase } from "@/lib/supabase/admin";
import { WorkspaceStatusButton, OverrideForm } from "../Controls";

export default async function AdminWorkspacesPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const admin = getServiceSupabase();
  if (!admin) return <p className="text-sm">Server misconfigured.</p>;
  const q = searchParams?.q?.trim() ?? "";

  let query = admin
    .from("workspaces")
    .select("id, name, slug, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (q) {
    query = /^[0-9a-f-]{36}$/i.test(q)
      ? query.eq("id", q)
      : query.ilike("name", `%${q}%`);
  }
  const { data } = await query;
  const spaces = ((data ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    created_at: string;
  }>);

  const ids = spaces.map((w) => w.id);
  const { data: subs } = ids.length
    ? await admin.from("subscriptions").select("workspace_id, plan_code, status, provider_subscription_id, override_reason, override_expires_at").in("workspace_id", ids)
    : { data: [] };
  const subByWs = new Map(
    ((subs ?? []) as Array<Record<string, string | null>>).map((s) => [s.workspace_id as string, s]),
  );
  const { data: forms } = ids.length
    ? await admin.from("forms").select("workspace_id").in("workspace_id", ids).limit(2000)
    : { data: [] };
  const formCount = new Map<string, number>();
  for (const f of (forms ?? []) as Array<{ workspace_id: string }>) {
    formCount.set(f.workspace_id, (formCount.get(f.workspace_id) ?? 0) + 1);
  }

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight">Workspaces</h1>
      <form method="get" className="mt-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="name or workspace id…"
          className="w-72 rounded-xl border border-ink/15 px-4 py-2 text-sm"
        />
        <button type="submit" className="rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold">
          Search
        </button>
      </form>
      <ul className="mt-4 space-y-3">
        {spaces.map((w) => {
          const sub = subByWs.get(w.id);
          return (
            <li key={w.id} className="rounded-2xl border border-ink/10 bg-white px-5 py-4">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {w.name}
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${w.status === "active" ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-700"}`}>
                  {w.status}
                </span>
                <span className="rounded-full bg-paper-deep px-2.5 py-0.5 text-[11px] font-semibold">
                  {(sub?.plan_code as string) ?? "free"} · {(sub?.status as string) ?? "—"}
                </span>
                {sub?.override_reason ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">
                    Override → {sub.plan_code as string} (to {String(sub.override_expires_at).slice(0, 10)})
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-ink-faint">
                {w.id} · {formCount.get(w.id) ?? 0} forms · since {w.created_at.slice(0, 10)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <WorkspaceStatusButton workspaceId={w.id} status={w.status} />
              </div>
              <OverrideForm workspaceId={w.id} currentPlan={(sub?.plan_code as string) ?? "free"} />
            </li>
          );
        })}
      </ul>
      {spaces.length === 0 && <p className="mt-4 text-sm text-ink-soft">No workspaces match.</p>}
    </div>
  );
}
