import { getServiceSupabase } from "@/lib/supabase/admin";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const admin = getServiceSupabase();
  if (!admin) return <p className="text-sm">Server misconfigured.</p>;
  const q = searchParams?.q?.trim() ?? "";

  let query = admin
    .from("audit_logs")
    .select("id, actor_user_id, action, target_type, target_id, workspace_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (q) query = query.ilike("action", `%${q}%`);
  const { data } = await query;
  const rows = ((data ?? []) as Array<Record<string, string | null | object>>);

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight">Audit log</h1>
      <form method="get" className="mt-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="filter by action, e.g. billing.…"
          className="w-72 rounded-xl border border-ink/15 px-4 py-2 text-sm"
        />
        <button type="submit" className="rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold">
          Filter
        </button>
      </form>
      <ul className="mt-4 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white">
        {rows.map((r) => (
          <li key={r.id as string} className="px-5 py-3">
            <p className="text-sm">
              <span className="font-mono font-semibold">{r.action as string}</span>
              <span className="text-ink-faint"> · {r.target_type as string}</span>
              {r.target_id ? (
                <span className="font-mono text-xs text-ink-faint"> · {String(r.target_id).slice(0, 12)}</span>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-ink-faint">
              {String(r.created_at).replace("T", " ").slice(0, 19)}Z
              {r.actor_user_id ? ` · actor ${String(r.actor_user_id).slice(0, 8)}` : ""}
              {r.workspace_id ? ` · ws ${String(r.workspace_id).slice(0, 8)}` : ""}
            </p>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="mt-4 text-sm text-ink-soft">No audit events.</p>}
    </div>
  );
}
