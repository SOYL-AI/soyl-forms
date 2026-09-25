import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { Table, Td, Th, Mono } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { formatDate, timeAgo } from "@/lib/utils";
import { SearchForm } from "../Controls";

export default async function AdminUsersPage({ searchParams }: { searchParams?: { q?: string } }) {
  const admin = getServiceSupabase();
  if (!admin) return <p className="text-sm">Server misconfigured.</p>;
  const q = searchParams?.q?.trim().toLowerCase() ?? "";

  // Auth admin list (paginated scan; V1 scale) for email search.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  const users = (list?.users ?? [])
    .filter((u) => !q || u.email?.toLowerCase().includes(q) || u.id.toLowerCase().includes(q))
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
    .slice(0, 100);

  const ids = users.map((u) => u.id);
  const [{ data: members }, { data: profiles }, { data: admins }] = ids.length
    ? await Promise.all([
        admin.from("workspace_members").select("user_id, workspace_id, role").in("user_id", ids),
        admin.from("profiles").select("id, display_name").in("id", ids),
        admin.from("admin_users").select("user_id, role").in("user_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const wsIds = [...new Set(((members ?? []) as Array<{ workspace_id: string }>).map((m) => m.workspace_id))];
  const { data: spaces } = wsIds.length ? await admin.from("workspaces").select("id, name, status").in("id", wsIds) : { data: [] };
  const spaceById = new Map(((spaces ?? []) as Array<{ id: string; name: string; status: string }>).map((w) => [w.id, w]));
  const membersByUser = new Map<string, Array<{ workspace_id: string; role: string }>>();
  for (const m of (members ?? []) as Array<{ user_id: string; workspace_id: string; role: string }>) {
    const arr = membersByUser.get(m.user_id) ?? [];
    arr.push(m);
    membersByUser.set(m.user_id, arr);
  }
  const nameById = new Map(((profiles ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [p.id, p.display_name]));
  const adminById = new Map(((admins ?? []) as Array<{ user_id: string; role: string }>).map((a) => [a.user_id, a.role]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-ink-soft">Search by email or user id. Passwords are never visible here.</p>
      </div>
      <SearchForm placeholder="email or user id…" defaultValue={searchParams?.q} />
      <Table>
        <thead>
          <tr>
            <Th>User</Th>
            <Th>Workspaces</Th>
            <Th>Signed up</Th>
            <Th>Last sign-in</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <Td>
                <p className="flex items-center gap-2 font-medium">
                  {u.email ?? "(no email)"}
                  {adminById.get(u.id) && <Badge tone="accent">{adminById.get(u.id)}</Badge>}
                  {!u.email_confirmed_at && <Badge tone="warn">unconfirmed</Badge>}
                </p>
                <p className="text-xs text-ink-faint">{nameById.get(u.id) ?? ""}</p>
                <Mono>{u.id}</Mono>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1.5">
                  {(membersByUser.get(u.id) ?? []).map((m) => {
                    const w = spaceById.get(m.workspace_id);
                    return (
                      <Link key={m.workspace_id} href={`/super-admin/workspaces/${m.workspace_id}`} className="inline-flex items-center gap-1.5 rounded-full bg-paper-deep px-2.5 py-0.5 text-[11px] font-semibold hover:underline">
                        {w?.name ?? m.workspace_id.slice(0, 8)} · {m.role}
                        {w && w.status !== "active" ? <StatusBadge status={w.status} /> : null}
                      </Link>
                    );
                  })}
                </div>
              </Td>
              <Td className="text-xs text-ink-soft">{formatDate(u.created_at)}</Td>
              <Td className="text-xs text-ink-soft">{u.last_sign_in_at ? timeAgo(u.last_sign_in_at) : "never"}</Td>
              <Td className="text-right">
                <Link href={`/super-admin/users/${u.id}`} className="text-xs font-semibold underline underline-offset-2">
                  Details
                </Link>
              </Td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <Td colSpan={5} className="text-center text-sm text-ink-soft">
                No users match.
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
