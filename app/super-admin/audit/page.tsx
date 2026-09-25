import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { Table, Td, Th, Mono } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { SearchForm } from "../Controls";

export default async function AdminAuditPage({ searchParams }: { searchParams?: { q?: string } }) {
  const admin = getServiceSupabase();
  if (!admin) return <p className="text-sm">Server misconfigured.</p>;
  const q = searchParams?.q?.trim() ?? "";

  let query = admin
    .from("audit_logs")
    .select("id, actor_user_id, actor_type, action, target_type, target_id, workspace_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (q) {
    query = /^[0-9a-f-]{36}$/i.test(q) ? query.or(`workspace_id.eq.${q},actor_user_id.eq.${q},target_id.eq.${q}`) : query.ilike("action", `%${q}%`);
  }
  const { data } = await query;
  const rows = (data ?? []) as Array<{
    id: string;
    actor_user_id: string | null;
    actor_type: string;
    action: string;
    target_type: string;
    target_id: string | null;
    workspace_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Audit log</h1>
        <p className="mt-1 text-sm text-ink-soft">Every moderation action, override, billing event and settings change. Filter by action prefix (e.g. <code>billing.</code>) or paste an id.</p>
      </div>
      <SearchForm placeholder="action prefix, workspace / user / target id…" defaultValue={q} />
      <Table>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Action</Th>
            <Th>Target</Th>
            <Th>Actor</Th>
            <Th>Details</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap text-xs text-ink-soft">{formatDateTime(r.created_at)}</Td>
              <Td className="font-mono text-xs">{r.action}</Td>
              <Td className="text-xs">
                {r.target_type}
                {r.target_id ? (
                  <>
                    {" · "}
                    <Mono>{r.target_id.slice(0, 16)}</Mono>
                  </>
                ) : null}
                {r.workspace_id ? (
                  <>
                    {" · "}
                    <Link href={`/super-admin/workspaces/${r.workspace_id}`} className="underline underline-offset-2">
                      workspace
                    </Link>
                  </>
                ) : null}
              </Td>
              <Td className="text-xs">
                {r.actor_user_id ? (
                  <Link href={`/super-admin/users/${r.actor_user_id}`} className="font-mono underline underline-offset-2">
                    {r.actor_user_id.slice(0, 8)}
                  </Link>
                ) : (
                  <span className="text-ink-faint">{r.actor_type}</span>
                )}
              </Td>
              <Td className="max-w-md truncate text-xs text-ink-soft" title={JSON.stringify(r.metadata)}>
                {r.metadata && Object.keys(r.metadata).length ? JSON.stringify(r.metadata) : ""}
              </Td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <Td colSpan={5} className="text-center text-sm text-ink-soft">
                No audit events.
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
