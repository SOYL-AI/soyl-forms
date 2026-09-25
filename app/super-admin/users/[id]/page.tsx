import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Table, Td, Th, Mono } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function AdminUserDetail({ params }: { params: { id: string } }) {
  const admin = getServiceSupabase();
  if (!admin) return <p className="text-sm">Server misconfigured.</p>;
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const { data } = await admin.auth.admin.getUserById(params.id);
  const user = data?.user;
  if (!user) notFound();

  const [{ data: profile }, { data: members }, { data: adminRow }, { data: audit }] = await Promise.all([
    admin.from("profiles").select("display_name, created_at").eq("id", user.id).maybeSingle(),
    admin.from("workspace_members").select("workspace_id, role").eq("user_id", user.id),
    admin.from("admin_users").select("role").eq("user_id", user.id).maybeSingle(),
    admin.from("audit_logs").select("id, action, target_type, target_id, created_at").eq("actor_user_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);
  const wsIds = ((members ?? []) as Array<{ workspace_id: string }>).map((m) => m.workspace_id);
  const [{ data: spaces }, { data: subs }, { data: forms }] = wsIds.length
    ? await Promise.all([
        admin.from("workspaces").select("id, name, status, created_at").in("id", wsIds),
        admin.from("subscriptions").select("workspace_id, plan_code, status").in("workspace_id", wsIds),
        admin.from("forms").select("id, title, status, workspace_id, updated_at").in("workspace_id", wsIds).order("updated_at", { ascending: false }).limit(50),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const subByWs = new Map(((subs ?? []) as Array<{ workspace_id: string; plan_code: string; status: string }>).map((s) => [s.workspace_id, s]));
  const roleByWs = new Map(((members ?? []) as Array<{ workspace_id: string; role: string }>).map((m) => [m.workspace_id, m.role]));

  return (
    <div className="space-y-6">
      <Link href="/super-admin/users" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Users
      </Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-3 font-display text-3xl tracking-tight">
          {user.email ?? "(no email)"}
          {adminRow && <Badge tone="accent">{(adminRow as { role: string }).role}</Badge>}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {(profile as { display_name: string | null } | null)?.display_name ?? "No display name"} · joined {formatDate(user.created_at)} · last sign-in{" "}
          {user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : "never"} · {user.email_confirmed_at ? "email confirmed" : "email not confirmed"}
        </p>
        <Mono>{user.id}</Mono>
        <p className="mt-1 text-xs text-ink-faint">Providers: {(user.identities ?? []).map((i) => i.provider).join(", ") || "email"}</p>
      </div>

      <Card padded={false}>
        <p className="px-5 pt-5 text-sm font-semibold">Workspaces</p>
        <div className="mt-3 border-t border-line">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {((spaces ?? []) as Array<{ id: string; name: string; status: string; created_at: string }>).map((w) => (
                <tr key={w.id}>
                  <Td>
                    <Link href={`/super-admin/workspaces/${w.id}`} className="font-medium hover:underline">
                      {w.name}
                    </Link>
                  </Td>
                  <Td>{roleByWs.get(w.id)}</Td>
                  <Td>
                    {subByWs.get(w.id)?.plan_code ?? "free"} · {subByWs.get(w.id)?.status ?? "—"}
                  </Td>
                  <Td>
                    <StatusBadge status={w.status} />
                  </Td>
                  <Td className="text-xs text-ink-soft">{formatDate(w.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padded={false}>
        <p className="px-5 pt-5 text-sm font-semibold">Forms ({(forms ?? []).length})</p>
        <div className="mt-3 border-t border-line">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {((forms ?? []) as Array<{ id: string; title: string; status: string; updated_at: string }>).map((f) => (
                <tr key={f.id}>
                  <Td>
                    <Link href={`/super-admin/forms?q=${f.id}`} className="font-medium hover:underline">
                      {f.title}
                    </Link>
                  </Td>
                  <Td>
                    <StatusBadge status={f.status} />
                  </Td>
                  <Td className="text-xs text-ink-soft">{formatDate(f.updated_at)}</Td>
                </tr>
              ))}
              {(forms ?? []).length === 0 && (
                <tr>
                  <Td colSpan={3} className="text-center text-ink-soft">
                    No forms.
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padded={false}>
        <p className="px-5 pt-5 text-sm font-semibold">Recent admin/audit events by this user</p>
        <div className="mt-3 border-t border-line">
          <Table className="min-w-0 border-0">
            <tbody>
              {((audit ?? []) as Array<{ id: string; action: string; target_type: string; target_id: string | null; created_at: string }>).map((a) => (
                <tr key={a.id}>
                  <Td className="font-mono text-xs">{a.action}</Td>
                  <Td className="text-xs text-ink-soft">
                    {a.target_type} {a.target_id ? `· ${a.target_id.slice(0, 12)}` : ""}
                  </Td>
                  <Td className="text-right text-xs text-ink-faint">{formatDateTime(a.created_at)}</Td>
                </tr>
              ))}
              {(audit ?? []).length === 0 && (
                <tr>
                  <Td className="text-center text-ink-soft">No events.</Td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
