import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { Table, Td, Th, Mono } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { SearchForm, WorkspaceStatusButton } from "../Controls";

export default async function AdminWorkspacesPage({ searchParams }: { searchParams?: { q?: string } }) {
  const admin = getServiceSupabase();
  if (!admin) return <p className="text-sm">Server misconfigured.</p>;
  const q = searchParams?.q?.trim() ?? "";

  let query = admin.from("workspaces").select("id, name, slug, status, created_at").order("created_at", { ascending: false }).limit(100);
  if (q) query = /^[0-9a-f-]{36}$/i.test(q) ? query.eq("id", q) : query.ilike("name", `%${q}%`);
  const { data } = await query;
  const spaces = (data ?? []) as Array<{ id: string; name: string; slug: string; status: string; created_at: string }>;
  const ids = spaces.map((w) => w.id);
  const month = `${new Date().toISOString().slice(0, 7)}-01`;

  const [{ data: subs }, { data: forms }, { data: usage }] = ids.length
    ? await Promise.all([
        admin.from("subscriptions").select("workspace_id, plan_code, status, override_reason, override_expires_at").in("workspace_id", ids),
        admin.from("forms").select("workspace_id, status").in("workspace_id", ids).limit(5000),
        admin.from("usage_monthly").select("workspace_id, completed_submissions").in("workspace_id", ids).eq("month", month),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const subByWs = new Map(((subs ?? []) as Array<Record<string, string | null>>).map((s) => [s.workspace_id as string, s]));
  const formCount = new Map<string, { total: number; live: number }>();
  for (const f of (forms ?? []) as Array<{ workspace_id: string; status: string }>) {
    const cur = formCount.get(f.workspace_id) ?? { total: 0, live: 0 };
    cur.total += 1;
    if (f.status === "published") cur.live += 1;
    formCount.set(f.workspace_id, cur);
  }
  const usageByWs = new Map(((usage ?? []) as Array<{ workspace_id: string; completed_submissions: number }>).map((u) => [u.workspace_id, u.completed_submissions]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Workspaces</h1>
        <p className="mt-1 text-sm text-ink-soft">Every form, subscription and quota hangs off a workspace.</p>
      </div>
      <SearchForm placeholder="name or workspace id…" defaultValue={q} />
      <Table>
        <thead>
          <tr>
            <Th>Workspace</Th>
            <Th>Plan</Th>
            <Th>Forms</Th>
            <Th className="text-right">Responses (month)</Th>
            <Th>Since</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {spaces.map((w) => {
            const sub = subByWs.get(w.id);
            return (
              <tr key={w.id}>
                <Td>
                  <p className="flex items-center gap-2 font-medium">
                    <Link href={`/super-admin/workspaces/${w.id}`} className="hover:underline">
                      {w.name}
                    </Link>
                    <StatusBadge status={w.status} />
                  </p>
                  <Mono>{w.id}</Mono>
                </Td>
                <Td>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={(sub?.plan_code ?? "free") === "free" ? "neutral" : "accent"}>{(sub?.plan_code as string) ?? "free"}</Badge>
                    <span className="text-xs text-ink-faint">{(sub?.status as string) ?? "—"}</span>
                    {sub?.override_reason ? <Badge tone="warn">override → {String(sub.override_expires_at).slice(0, 10)}</Badge> : null}
                  </span>
                </Td>
                <Td className="text-xs text-ink-soft">
                  {formCount.get(w.id)?.live ?? 0} live / {formCount.get(w.id)?.total ?? 0}
                </Td>
                <Td className="text-right tabular-nums">{(usageByWs.get(w.id) ?? 0).toLocaleString("en-IN")}</Td>
                <Td className="text-xs text-ink-soft">{formatDate(w.created_at)}</Td>
                <Td className="text-right">
                  <WorkspaceStatusButton workspaceId={w.id} status={w.status} />
                </Td>
              </tr>
            );
          })}
          {spaces.length === 0 && (
            <tr>
              <Td colSpan={6} className="text-center text-sm text-ink-soft">
                No workspaces match.
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
