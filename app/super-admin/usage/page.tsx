import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { PLANS, isPlanCode } from "@/lib/plans";
import { isSubscriptionEntitled } from "@/lib/billing/subscriptions";
import { Card } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatBytes, pct } from "@/lib/utils";

/**
 * Usage & cost: where the variable costs go this month — responses, storage,
 * emails, webhook attempts, AI credits — by workspace, with quota pressure.
 */
export default async function AdminUsagePage() {
  const admin = getServiceSupabase();
  if (!admin) return <p className="text-sm">Server misconfigured.</p>;
  const month = `${new Date().toISOString().slice(0, 7)}-01`;

  const [{ data: usage }, { data: files }, { data: subs }, { data: ledger }, { data: outbox }] = await Promise.all([
    admin.from("usage_monthly").select("workspace_id, completed_submissions, notification_emails, webhook_attempts").eq("month", month).order("completed_submissions", { ascending: false }).limit(200),
    admin.from("uploaded_files").select("workspace_id, size_bytes, kind").neq("status", "deleted").limit(20000),
    admin.from("subscriptions").select("workspace_id, plan_code, status"),
    admin.from("ai_credit_ledger").select("workspace_id, delta").lt("delta", 0).gte("created_at", month).limit(20000),
    admin.from("outbox_events").select("status").gte("created_at", month).limit(20000),
  ]);

  const storageByWs = new Map<string, number>();
  let brandBytes = 0;
  for (const f of (files ?? []) as Array<{ workspace_id: string; size_bytes: number; kind: string }>) {
    storageByWs.set(f.workspace_id, (storageByWs.get(f.workspace_id) ?? 0) + f.size_bytes);
    if (f.kind !== "submission") brandBytes += f.size_bytes;
  }
  const creditsByWs = new Map<string, number>();
  for (const l of (ledger ?? []) as Array<{ workspace_id: string; delta: number }>) {
    creditsByWs.set(l.workspace_id, (creditsByWs.get(l.workspace_id) ?? 0) + Math.abs(l.delta));
  }
  const planByWs = new Map<string, "free" | "starter" | "pro">();
  for (const s of (subs ?? []) as Array<{ workspace_id: string; plan_code: string; status: string }>) {
    planByWs.set(s.workspace_id, isPlanCode(s.plan_code) && isSubscriptionEntitled(s.status) ? s.plan_code : "free");
  }
  const rows = (usage ?? []) as Array<{ workspace_id: string; completed_submissions: number; notification_emails: number; webhook_attempts: number }>;
  const wsIds = [...new Set([...rows.map((r) => r.workspace_id), ...[...storageByWs.keys()].slice(0, 50), ...[...creditsByWs.keys()]])];
  const { data: spaces } = wsIds.length ? await admin.from("workspaces").select("id, name").in("id", wsIds) : { data: [] };
  const nameById = new Map(((spaces ?? []) as Array<{ id: string; name: string }>).map((w) => [w.id, w.name]));

  const totals = {
    responses: rows.reduce((s, r) => s + r.completed_submissions, 0),
    emails: rows.reduce((s, r) => s + r.notification_emails, 0),
    webhooks: rows.reduce((s, r) => s + r.webhook_attempts, 0),
    storage: [...storageByWs.values()].reduce((s, n) => s + n, 0),
    credits: [...creditsByWs.values()].reduce((s, n) => s + n, 0),
  };
  const ob = (outbox ?? []) as Array<{ status: string }>;
  const obFailed = ob.filter((o) => o.status === "failed").length;

  const merged = wsIds
    .map((id) => {
      const u = rows.find((r) => r.workspace_id === id);
      const plan = planByWs.get(id) ?? "free";
      return {
        id,
        name: nameById.get(id) ?? id.slice(0, 8),
        plan,
        responses: u?.completed_submissions ?? 0,
        emails: u?.notification_emails ?? 0,
        webhooks: u?.webhook_attempts ?? 0,
        storage: storageByWs.get(id) ?? 0,
        credits: creditsByWs.get(id) ?? 0,
        quota: pct(u?.completed_submissions ?? 0, PLANS[plan].entitlements.monthlySubmissions),
        storageQuota: pct(storageByWs.get(id) ?? 0, PLANS[plan].entitlements.storageBytes),
      };
    })
    .sort((a, b) => b.responses - a.responses || b.storage - a.storage)
    .slice(0, 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Usage & cost</h1>
        <p className="mt-1 text-sm text-ink-soft">This calendar month. Text responses are cheap; storage, email, webhooks and AI are the variable costs to watch.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card className="!p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Responses</p><p className="mt-1 font-display text-2xl">{totals.responses.toLocaleString("en-IN")}</p></Card>
        <Card className="!p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Storage</p><p className="mt-1 font-display text-2xl">{formatBytes(totals.storage)}</p><p className="text-xs text-ink-faint">{formatBytes(brandBytes)} creator assets</p></Card>
        <Card className="!p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Emails sent</p><p className="mt-1 font-display text-2xl">{totals.emails.toLocaleString("en-IN")}</p></Card>
        <Card className="!p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Webhook attempts</p><p className="mt-1 font-display text-2xl">{totals.webhooks.toLocaleString("en-IN")}</p><p className="text-xs text-ink-faint">{obFailed} outbox events failed</p></Card>
        <Card className="!p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">AI credits spent</p><p className="mt-1 font-display text-2xl">{totals.credits.toLocaleString("en-IN")}</p></Card>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Workspace</Th>
            <Th>Plan</Th>
            <Th className="text-right">Responses</Th>
            <Th className="text-right">Quota</Th>
            <Th className="text-right">Storage</Th>
            <Th className="text-right">Emails</Th>
            <Th className="text-right">Webhooks</Th>
            <Th className="text-right">AI credits</Th>
          </tr>
        </thead>
        <tbody>
          {merged.map((r) => (
            <tr key={r.id}>
              <Td>
                <Link href={`/super-admin/workspaces/${r.id}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
              </Td>
              <Td>
                <Badge tone={r.plan === "free" ? "neutral" : "accent"}>{PLANS[r.plan].name}</Badge>
              </Td>
              <Td className="text-right tabular-nums">{r.responses.toLocaleString("en-IN")}</Td>
              <Td className="text-right tabular-nums">
                <span className={r.quota >= 95 ? "font-semibold text-danger" : r.quota >= 80 ? "font-semibold text-warn" : ""}>{r.quota}%</span>
              </Td>
              <Td className="text-right tabular-nums">
                {formatBytes(r.storage)} <span className={`text-xs ${r.storageQuota >= 90 ? "text-danger" : "text-ink-faint"}`}>({r.storageQuota}%)</span>
              </Td>
              <Td className="text-right tabular-nums">{r.emails}</Td>
              <Td className="text-right tabular-nums">{r.webhooks}</Td>
              <Td className="text-right tabular-nums">{r.credits}</Td>
            </tr>
          ))}
          {merged.length === 0 && (
            <tr>
              <Td colSpan={8} className="text-center text-sm text-ink-soft">
                No usage recorded this month.
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
