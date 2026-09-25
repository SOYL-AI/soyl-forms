import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Mono } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/utils";
import { paise, revenueSnapshot } from "../stats";

export default async function AdminBillingPage() {
  const admin = getServiceSupabase();
  if (!admin) return <p className="text-sm">Server misconfigured.</p>;

  const [{ data }, { data: events }] = await Promise.all([
    admin
      .from("subscriptions")
      .select("workspace_id, plan_code, status, provider_subscription_id, provider_plan_id, billing_interval, current_period_end, cancel_at_period_end, override_reason, override_expires_at, updated_at")
      .neq("status", "free")
      .order("updated_at", { ascending: false })
      .limit(200),
    admin.from("razorpay_webhook_events").select("event_id, event_type, status, received_at, processed_at").order("received_at", { ascending: false }).limit(30),
  ]);
  const subs = (data ?? []) as Array<Record<string, string | boolean | null>>;
  const revenue = revenueSnapshot(subs as Array<{ plan_code: string; status: string; billing_interval: string | null }>);
  const wsIds = [...new Set(subs.map((s) => s.workspace_id as string))];
  const { data: spaces } = wsIds.length ? await admin.from("workspaces").select("id, name").in("id", wsIds) : { data: [] };
  const nameById = new Map(((spaces ?? []) as Array<{ id: string; name: string }>).map((w) => [w.id, w.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Subscriptions & billing</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Razorpay webhooks are the source of truth. Overrides live on the workspace page. Estimated MRR {paise(revenue.mrrPaise)} from {revenue.paying} entitled subscriptions.
        </p>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Workspace</Th>
            <Th>Plan</Th>
            <Th>Status</Th>
            <Th>Razorpay</Th>
            <Th>Period end</Th>
            <Th>Updated</Th>
          </tr>
        </thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.workspace_id as string}>
              <Td>
                <Link href={`/super-admin/workspaces/${s.workspace_id}`} className="font-medium hover:underline">
                  {nameById.get(s.workspace_id as string) ?? String(s.workspace_id).slice(0, 8)}
                </Link>
              </Td>
              <Td>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="accent">{String(s.plan_code)}</Badge>
                  <span className="text-xs text-ink-faint">{s.billing_interval ? String(s.billing_interval) : ""}</span>
                  {s.override_reason ? <Badge tone="warn">override</Badge> : null}
                  {s.cancel_at_period_end ? <Badge tone="neutral">cancelling</Badge> : null}
                </span>
              </Td>
              <Td>
                <StatusBadge status={String(s.status)} />
              </Td>
              <Td>
                <Mono>{String(s.provider_subscription_id ?? "—")}</Mono>
                <br />
                <Mono>{String(s.provider_plan_id ?? "—")}</Mono>
              </Td>
              <Td className="text-xs text-ink-soft">{s.current_period_end ? formatDate(String(s.current_period_end)) : "—"}</Td>
              <Td className="text-xs text-ink-soft">{formatDateTime(String(s.updated_at))}</Td>
            </tr>
          ))}
          {subs.length === 0 && (
            <tr>
              <Td colSpan={6} className="text-center text-sm text-ink-soft">
                No paid subscriptions yet.
              </Td>
            </tr>
          )}
        </tbody>
      </Table>

      <Card padded={false}>
        <p className="px-5 pt-5 text-sm font-semibold">Recent Razorpay webhook events</p>
        <p className="px-5 pt-1 text-xs text-ink-faint">Deduplicated by event id. “orphan” means the subscription wasn&apos;t created by our checkout.</p>
        <div className="mt-3 border-t border-line">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Event</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>Received</Th>
              </tr>
            </thead>
            <tbody>
              {((events ?? []) as Array<{ event_id: string; event_type: string; status: string; received_at: string }>).map((e) => (
                <tr key={e.event_id}>
                  <Td>
                    <Mono>{e.event_id}</Mono>
                  </Td>
                  <Td className="font-mono text-xs">{e.event_type}</Td>
                  <Td>
                    <Badge tone={e.status === "processed" ? "positive" : e.status === "orphan" || e.status === "invalid" ? "warn" : "neutral"}>{e.status}</Badge>
                  </Td>
                  <Td className="text-xs text-ink-soft">{formatDateTime(e.received_at)}</Td>
                </tr>
              ))}
              {(events ?? []).length === 0 && (
                <tr>
                  <Td colSpan={4} className="text-center text-ink-soft">
                    No webhook events received yet.
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
