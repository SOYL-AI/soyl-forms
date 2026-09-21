import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { PLANS } from "@/lib/plans";
import { resolveEffectivePlan, type StoredSubscription } from "@/lib/billing/subscriptions";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/meter";
import { Th, Td, Mono } from "@/components/ui/table";
import { formatBytes, formatDate, formatDateTime } from "@/lib/utils";
import { FormStatusButton, OverrideForm, WorkspaceStatusButton } from "../../Controls";

export default async function AdminWorkspaceDetail({ params }: { params: { id: string } }) {
  const admin = getServiceSupabase();
  if (!admin) return <p className="text-sm">Server misconfigured.</p>;
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const { data: wsRow } = await admin.from("workspaces").select("id, name, slug, status, owner_user_id, created_at").eq("id", params.id).maybeSingle();
  const ws = wsRow as { id: string; name: string; slug: string; status: string; owner_user_id: string; created_at: string } | null;
  if (!ws) notFound();
  const month = `${new Date().toISOString().slice(0, 7)}-01`;

  const [{ data: sub }, { data: members }, { data: forms }, { data: usage }, { data: history }, { data: files }, { data: credits }, { data: kits }, { data: audit }] =
    await Promise.all([
      admin.from("subscriptions").select("*").eq("workspace_id", ws.id).maybeSingle(),
      admin.from("workspace_members").select("user_id, role, created_at").eq("workspace_id", ws.id),
      admin.from("forms").select("id, title, slug, status, updated_at, published_at").eq("workspace_id", ws.id).order("updated_at", { ascending: false }).limit(100),
      admin.from("usage_monthly").select("*").eq("workspace_id", ws.id).eq("month", month).maybeSingle(),
      admin.from("usage_monthly").select("month, completed_submissions, notification_emails, webhook_attempts").eq("workspace_id", ws.id).order("month", { ascending: false }).limit(6),
      admin.from("uploaded_files").select("size_bytes, kind").eq("workspace_id", ws.id).neq("status", "deleted").limit(10000),
      admin.from("ai_credits").select("balance").eq("workspace_id", ws.id).maybeSingle(),
      admin.from("brand_kits").select("id, name, is_default").eq("workspace_id", ws.id),
      admin.from("audit_logs").select("id, action, actor_user_id, metadata, created_at").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(20),
    ]);

  const stored = (sub ?? null) as (StoredSubscription & Record<string, string | null | boolean>) | null;
  const effective = resolveEffectivePlan(stored);
  const ent = PLANS[effective.plan].entitlements;
  const u = (usage ?? {}) as { completed_submissions?: number; notification_emails?: number; webhook_attempts?: number };
  const storage = ((files ?? []) as Array<{ size_bytes: number }>).reduce((s, f) => s + f.size_bytes, 0);
  const memberIds = ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
  const emails = new Map<string, string>();
  for (const id of memberIds) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data?.user?.email) emails.set(id, data.user.email);
  }
  const live = ((forms ?? []) as Array<{ status: string }>).filter((f) => f.status === "published").length;

  return (
    <div className="space-y-6">
      <Link href="/super-admin/workspaces" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Workspaces
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 font-display text-3xl tracking-tight">
            {ws.name}
            <StatusBadge status={ws.status} />
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Created {formatDate(ws.created_at)} · slug <Mono className="text-sm">{ws.slug}</Mono>
          </p>
          <Mono>{ws.id}</Mono>
        </div>
        <WorkspaceStatusButton workspaceId={ws.id} status={ws.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Effective plan: {PLANS[effective.plan].name}</p>
            <Badge tone={effective.source === "override" ? "warn" : effective.source === "subscription" ? "positive" : "neutral"}>{effective.source}</Badge>
            {stored?.status ? <StatusBadge status={String(stored.status)} /> : null}
          </div>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-ink-faint">Stored plan / status</dt>
              <dd>
                {stored?.plan_code ?? "free"} / {stored?.status ?? "free"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">Interval · period end</dt>
              <dd>
                {String(stored?.billing_interval ?? "—")} · {stored?.current_period_end ? formatDate(String(stored.current_period_end)) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">Razorpay subscription</dt>
              <dd className="font-mono">{String(stored?.provider_subscription_id ?? "—")}</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Razorpay plan</dt>
              <dd className="font-mono">{String(stored?.provider_plan_id ?? "—")}</dd>
            </div>
            {stored?.override_reason ? (
              <div className="sm:col-span-2">
                <dt className="text-ink-faint">Override</dt>
                <dd>
                  {String(stored.override_reason)} · until {stored.override_expires_at ? formatDate(String(stored.override_expires_at)) : "—"}
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4">
            <OverrideForm workspaceId={ws.id} currentPlan={String(stored?.plan_code ?? "free")} hasOverride={Boolean(stored?.override_reason)} />
          </div>
        </Card>
        <Card>
          <p className="text-sm font-semibold">Usage this month</p>
          <div className="mt-3 grid gap-3">
            <Meter label="Live forms" used={live} limit={ent.maxActiveForms} />
            <Meter label="Responses" used={u.completed_submissions ?? 0} limit={ent.monthlySubmissions} />
            <Meter label="Storage" used={storage} limit={ent.storageBytes} format={formatBytes} />
            <Meter label="Notification emails" used={u.notification_emails ?? 0} limit={Math.max(1, ent.monthlyNotificationEmails)} />
          </div>
          <p className="mt-3 text-xs text-ink-faint">
            AI credits: {(credits as { balance: number } | null)?.balance ?? 0} · Brand kits: {(kits ?? []).length}/{ent.maxBrandKits} · Webhook attempts (month): {u.webhook_attempts ?? 0}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padded={false}>
          <p className="px-5 pt-5 text-sm font-semibold">Members</p>
          <div className="mt-3 border-t border-line">
            <table className="w-full text-sm">
              <tbody>
                {((members ?? []) as Array<{ user_id: string; role: string; created_at: string }>).map((m) => (
                  <tr key={m.user_id}>
                    <Td>
                      <Link href={`/super-admin/users/${m.user_id}`} className="font-medium hover:underline">
                        {emails.get(m.user_id) ?? m.user_id.slice(0, 8)}
                      </Link>
                      {m.user_id === ws.owner_user_id && <Badge tone="accent" className="ml-2">owner</Badge>}
                    </Td>
                    <Td className="text-xs text-ink-soft">{m.role}</Td>
                    <Td className="text-right text-xs text-ink-faint">{formatDate(m.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card padded={false}>
          <p className="px-5 pt-5 text-sm font-semibold">Usage history</p>
          <div className="mt-3 border-t border-line">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Month</Th>
                  <Th className="text-right">Responses</Th>
                  <Th className="text-right">Emails</Th>
                  <Th className="text-right">Webhooks</Th>
                </tr>
              </thead>
              <tbody>
                {((history ?? []) as Array<{ month: string; completed_submissions: number; notification_emails: number; webhook_attempts: number }>).map((h) => (
                  <tr key={h.month}>
                    <Td className="text-xs">{h.month.slice(0, 7)}</Td>
                    <Td className="text-right tabular-nums">{h.completed_submissions.toLocaleString("en-IN")}</Td>
                    <Td className="text-right tabular-nums">{h.notification_emails}</Td>
                    <Td className="text-right tabular-nums">{h.webhook_attempts}</Td>
                  </tr>
                ))}
                {(history ?? []).length === 0 && (
                  <tr>
                    <Td colSpan={4} className="text-center text-ink-soft">
                      No usage yet.
                    </Td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card padded={false}>
        <p className="px-5 pt-5 text-sm font-semibold">Forms ({(forms ?? []).length})</p>
        <div className="mt-3 border-t border-line">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Status</Th>
                <Th>Public URL</Th>
                <Th>Updated</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {((forms ?? []) as Array<{ id: string; title: string; slug: string; status: string; updated_at: string }>).map((f) => (
                <tr key={f.id}>
                  <Td>
                    <p className="font-medium">{f.title}</p>
                    <Mono>{f.id}</Mono>
                  </Td>
                  <Td>
                    <StatusBadge status={f.status} />
                  </Td>
                  <Td>
                    <a href={`/f/${f.slug}`} target="_blank" rel="noreferrer" className="font-mono text-xs hover:underline">
                      /f/{f.slug}
                    </a>
                  </Td>
                  <Td className="text-xs text-ink-soft">{formatDate(f.updated_at)}</Td>
                  <Td className="text-right">
                    <FormStatusButton formId={f.id} status={f.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padded={false}>
        <p className="px-5 pt-5 text-sm font-semibold">Audit trail</p>
        <div className="mt-3 border-t border-line">
          <table className="w-full text-sm">
            <tbody>
              {((audit ?? []) as Array<{ id: string; action: string; actor_user_id: string | null; metadata: Record<string, unknown>; created_at: string }>).map((a) => (
                <tr key={a.id}>
                  <Td className="font-mono text-xs">{a.action}</Td>
                  <Td className="text-xs text-ink-soft">{a.metadata && Object.keys(a.metadata).length ? JSON.stringify(a.metadata).slice(0, 120) : ""}</Td>
                  <Td className="text-right text-xs text-ink-faint">{formatDateTime(a.created_at)}</Td>
                </tr>
              ))}
              {(audit ?? []).length === 0 && (
                <tr>
                  <Td className="text-center text-ink-soft">No events.</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
