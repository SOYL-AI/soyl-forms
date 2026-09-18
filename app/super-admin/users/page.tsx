import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/admin";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const admin = getServiceSupabase();
  if (!admin) return <p className="text-sm">Server misconfigured.</p>;
  const q = searchParams?.q?.trim().toLowerCase() ?? "";

  // Auth admin list (paginated scan; V1 scale) for email search.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const users = (list?.users ?? [])
    .filter(
      (u) =>
        !q ||
        u.email?.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q),
    )
    .slice(0, 50);

  const ids = users.map((u) => u.id);
  const { data: members } = ids.length
    ? await admin.from("workspace_members").select("user_id, workspace_id, role").in("user_id", ids)
    : { data: [] };
  const { data: spaces } = ids.length
    ? await admin.from("workspaces").select("id, name, status")
    : { data: [] };
  const spaceById = new Map(((spaces ?? []) as Array<{ id: string; name: string; status: string }>).map((w) => [w.id, w]));
  const membersByUser = new Map<string, Array<{ workspace_id: string; role: string }>>();
  for (const m of (members ?? []) as Array<{ user_id: string; workspace_id: string; role: string }>) {
    const arr = membersByUser.get(m.user_id) ?? [];
    arr.push(m);
    membersByUser.set(m.user_id, arr);
  }

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight">Users</h1>
      <form method="get" className="mt-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={searchParams?.q ?? ""}
          placeholder="email or user id…"
          className="w-72 rounded-xl border border-ink/15 px-4 py-2 text-sm"
        />
        <button type="submit" className="rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold">
          Search
        </button>
      </form>
      <ul className="mt-4 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white">
        {users.map((u) => (
          <li key={u.id} className="px-5 py-4">
            <p className="text-sm font-semibold">{u.email ?? "(no email)"}</p>
            <p className="font-mono text-[11px] text-ink-faint">{u.id}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(membersByUser.get(u.id) ?? []).map((m) => {
                const w = spaceById.get(m.workspace_id);
                return (
                  <Link
                    key={m.workspace_id}
                    href={`/super-admin/workspaces?q=${m.workspace_id}`}
                    className="rounded-full bg-paper-deep px-2.5 py-0.5 text-[11px] font-semibold hover:underline"
                  >
                    {w?.name ?? m.workspace_id.slice(0, 8)} · {m.role}
                    {w?.status !== "active" ? ` · ${w?.status}` : ""}
                  </Link>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      {users.length === 0 && <p className="mt-4 text-sm text-ink-soft">No users match.</p>}
    </div>
  );
}
