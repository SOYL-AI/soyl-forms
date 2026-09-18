import { getServiceSupabase } from "@/lib/supabase/admin";
import { FormStatusButton } from "../Controls";

export default async function AdminFormsPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const admin = getServiceSupabase();
  if (!admin) return <p className="text-sm">Server misconfigured.</p>;
  const q = searchParams?.q?.trim() ?? "";

  let query = admin
    .from("forms")
    .select("id, workspace_id, title, slug, status, published_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (q) {
    query = /^[0-9a-f-]{36}$/i.test(q)
      ? query.or(`id.eq.${q},workspace_id.eq.${q}`)
      : query.or(`title.ilike.%${q}%,slug.eq.${q}`);
  }
  const { data } = await query;
  const forms = ((data ?? []) as Array<{
    id: string;
    workspace_id: string;
    title: string;
    slug: string;
    status: string;
    published_at: string | null;
    updated_at: string;
  }>);

  const wsIds = [...new Set(forms.map((f) => f.workspace_id))];
  const { data: spaces } = wsIds.length
    ? await admin.from("workspaces").select("id, name, status").in("id", wsIds)
    : { data: [] };
  const spaceById = new Map(
    ((spaces ?? []) as Array<{ id: string; name: string; status: string }>).map((w) => [w.id, w]),
  );

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight">Forms</h1>
      <form method="get" className="mt-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="title, slug, form or workspace id…"
          className="w-80 rounded-xl border border-ink/15 px-4 py-2 text-sm"
        />
        <button type="submit" className="rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold">
          Search
        </button>
      </form>
      <ul className="mt-4 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white">
        {forms.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                <span className="truncate">{f.title}</span>
                <span className="rounded-full bg-paper-deep px-2.5 py-0.5 text-[11px] font-semibold">
                  {f.status}
                </span>
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-ink-faint">
                {f.id} · /f/{f.slug} · {spaceById.get(f.workspace_id)?.name ?? f.workspace_id.slice(0, 8)}
                {spaceById.get(f.workspace_id)?.status !== "active"
                  ? ` · ws ${spaceById.get(f.workspace_id)?.status}`
                  : ""}
              </p>
            </div>
            <FormStatusButton formId={f.id} status={f.status} />
          </li>
        ))}
      </ul>
      {forms.length === 0 && <p className="mt-4 text-sm text-ink-soft">No forms match.</p>}
    </div>
  );
}
