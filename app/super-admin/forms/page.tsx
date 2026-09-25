import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { Table, Td, Th, Mono } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { FormStatusButton, SearchForm } from "../Controls";

export default async function AdminFormsPage({ searchParams }: { searchParams?: { q?: string } }) {
  const admin = getServiceSupabase();
  if (!admin) return <p className="text-sm">Server misconfigured.</p>;
  const q = searchParams?.q?.trim() ?? "";

  let query = admin.from("forms").select("id, workspace_id, title, slug, status, published_at, updated_at").order("updated_at", { ascending: false }).limit(100);
  if (q) {
    query = /^[0-9a-f-]{36}$/i.test(q) ? query.or(`id.eq.${q},workspace_id.eq.${q}`) : query.or(`title.ilike.%${q}%,slug.eq.${q.replace(/^\/?f\//, "")}`);
  }
  const { data } = await query;
  const forms = (data ?? []) as Array<{ id: string; workspace_id: string; title: string; slug: string; status: string; published_at: string | null; updated_at: string }>;
  const ids = forms.map((f) => f.id);
  const wsIds = [...new Set(forms.map((f) => f.workspace_id))];
  const [{ data: spaces }, { data: subs }] = ids.length
    ? await Promise.all([
        admin.from("workspaces").select("id, name, status").in("id", wsIds),
        admin.from("submissions").select("form_id").in("form_id", ids).is("deleted_at", null).limit(20000),
      ])
    : [{ data: [] }, { data: [] }];
  const spaceById = new Map(((spaces ?? []) as Array<{ id: string; name: string; status: string }>).map((w) => [w.id, w]));
  const counts = new Map<string, number>();
  for (const s of (subs ?? []) as Array<{ form_id: string }>) counts.set(s.form_id, (counts.get(s.form_id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Forms</h1>
        <p className="mt-1 text-sm text-ink-soft">Suspend a form to stop its public link without touching its data. Never edit a customer&apos;s questions from here.</p>
      </div>
      <SearchForm placeholder="title, slug, form id or workspace id…" defaultValue={q} />
      <Table>
        <thead>
          <tr>
            <Th>Form</Th>
            <Th>Workspace</Th>
            <Th>Status</Th>
            <Th className="text-right">Responses</Th>
            <Th>Updated</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {forms.map((f) => {
            const w = spaceById.get(f.workspace_id);
            return (
              <tr key={f.id}>
                <Td>
                  <p className="font-medium">{f.title}</p>
                  <p className="flex items-center gap-2">
                    <Mono>{f.id}</Mono>
                    <a href={`/f/${f.slug}`} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-ink-soft hover:underline">
                      /f/{f.slug}
                    </a>
                  </p>
                </Td>
                <Td>
                  <Link href={`/super-admin/workspaces/${f.workspace_id}`} className="text-sm hover:underline">
                    {w?.name ?? f.workspace_id.slice(0, 8)}
                  </Link>
                  {w && w.status !== "active" ? (
                    <span className="ml-1.5">
                      <StatusBadge status={w.status} />
                    </span>
                  ) : null}
                </Td>
                <Td>
                  <StatusBadge status={f.status} />
                </Td>
                <Td className="text-right tabular-nums">{(counts.get(f.id) ?? 0).toLocaleString("en-IN")}</Td>
                <Td className="text-xs text-ink-soft">{formatDate(f.updated_at)}</Td>
                <Td className="text-right">
                  <FormStatusButton formId={f.id} status={f.status} />
                </Td>
              </tr>
            );
          })}
          {forms.length === 0 && (
            <tr>
              <Td colSpan={6} className="text-center text-sm text-ink-soft">
                No forms match.
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
