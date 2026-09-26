import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Inbox } from "lucide-react";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getAppContext } from "@/lib/app-context";
import { getFormForOwner } from "@/lib/forms/actions";
import { formSchemaV1 } from "@/lib/forms/schema";
import {
  choiceDistribution,
  matrixDistribution,
  npsScore,
  numericDistribution,
  rankingDistribution,
} from "@/lib/forms/distributions";
import { scoreAnswers } from "@/lib/forms/quiz";
import { recallLabels } from "@/lib/forms/recall";
import { displayAnswer } from "@/lib/forms/answers";
import { isAnswerable } from "@/lib/forms/logic";
import type { AnswerValue, Block, FormSettings } from "@/types/forms";
import { AppShell } from "@/components/app/AppShell";
import { ConfigRequired } from "@/components/app/ConfigRequired";
import { FormSubnav } from "@/components/app/FormSubnav";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { formatDateTime, pct } from "@/lib/utils";
import { StateActions } from "./StateActions";

export const metadata: Metadata = { title: "Responses", robots: { index: false } };

interface SubmissionRow {
  id: string;
  submitted_at: string;
  source: string | null;
  answers: Record<string, AnswerValue>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="!p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{label}</p>
      <p className="mt-1 font-display text-2xl tracking-tight">{value}</p>
    </Card>
  );
}

function Bars({ rows, max }: { rows: Array<{ label: string; count: number }>; max: number }) {
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3 text-sm">
          <span className="w-36 shrink-0 truncate text-ink-soft" title={r.label}>
            {r.label}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
            <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.round((r.count / max) * 100)}%` }} />
          </span>
          <span className="w-10 text-right tabular-nums text-ink-soft">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

async function Analytics({ formId, blocks, quiz }: { formId: string; blocks: Block[] | null; quiz: boolean }) {
  const admin = getServiceSupabase();
  if (!admin) return null;

  const [{ count: views }, { data: visits }, { data: subs }] = await Promise.all([
    admin.from("form_visits").select("id", { count: "exact", head: true }).eq("form_id", formId),
    admin.from("form_visits").select("duration_ms, source").eq("form_id", formId).not("completed_at", "is", null).limit(2000),
    admin.from("submissions").select("answers, submitted_at, source").eq("form_id", formId).is("deleted_at", null).order("submitted_at", { ascending: true }).limit(2000),
  ]);

  const submissions = (subs ?? []) as Array<{ answers: Record<string, AnswerValue>; submitted_at: string; source: string | null }>;
  const completions = submissions.length;
  const viewCount = views ?? 0;
  if (viewCount === 0 && completions === 0) return null;

  const durations = ((visits ?? []) as Array<{ duration_ms: number | null }>)
    .map((v) => v.duration_ms)
    .filter((d): d is number => typeof d === "number" && d > 0);
  const avgSecs = durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length / 1000) : null;
  const fromQr = submissions.filter((s) => s.source === "qr").length;

  const byDay = new Map<string, number>();
  for (const s of submissions) {
    const day = s.submitted_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const days: Array<{ label: string; count: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ label: d.slice(5), count: byDay.get(d) ?? 0 });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  const answerMaps = submissions.map((s) => s.answers);
  const sections: React.ReactNode[] = [];

  if (quiz && blocks && answerMaps.length > 0) {
    const results = answerMaps.map((a) => scoreAnswers({ blocks }, a));
    const max = results[0]?.max ?? 0;
    if (max > 0) {
      const avg = results.reduce((s, r) => s + r.points, 0) / results.length;
      const perQuestion = blocks
        .filter((b) => results[0]?.perQuestion.some((q) => q.id === b.id))
        .map((b) => ({
          label: recallLabels(b.title, blocks),
          count: results.filter((r) => r.perQuestion.find((q) => q.id === b.id)?.correct).length,
        }));
      sections.push(
        <Card key="__quiz" className="md:col-span-2">
          <p className="text-sm font-semibold">Quiz results</p>
          <p className="mt-2 font-display text-3xl tracking-tight">
            {Math.round(avg * 10) / 10} / {max}
            <span className="ml-2 align-middle font-sans text-xs font-normal text-ink-faint">average score</span>
          </p>
          <p className="mt-4 text-xs font-medium text-ink-faint">Answered correctly</p>
          <Bars rows={perQuestion} max={Math.max(1, results.length)} />
        </Card>,
      );
    }
  }

  for (const block of blocks ?? []) {
    const nps = npsScore(block, answerMaps);
    if (nps && nps.total > 0) {
      sections.push(
        <Card key={block.id}>
          <p className="text-sm font-semibold">{recallLabels(block.title, blocks ?? [])}</p>
          <p className="mt-2 font-display text-3xl tracking-tight">
            {nps.score}
            <span className="ml-2 align-middle font-sans text-xs font-normal text-ink-faint">NPS · {nps.total} answers</span>
          </p>
          <Bars
            rows={[
              { label: "Promoters (9–10)", count: nps.promoters },
              { label: "Passives (7–8)", count: nps.passives },
              { label: "Detractors (0–6)", count: nps.detractors },
            ]}
            max={Math.max(1, nps.total)}
          />
        </Card>,
      );
      continue;
    }
    const ranking = rankingDistribution(block, answerMaps);
    if (ranking && ranking.total > 0) {
      sections.push(
        <Card key={block.id}>
          <p className="text-sm font-semibold">{recallLabels(block.title, blocks ?? [])}</p>
          <ol className="mt-3 space-y-2 text-sm">
            {ranking.options.map((o, i) => (
              <li key={o.id} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper-deep text-xs font-semibold">{i + 1}</span>
                <span className="flex-1 truncate">{o.label}</span>
                <span className="text-xs tabular-nums text-ink-faint">avg. #{o.averagePosition}</span>
              </li>
            ))}
          </ol>
        </Card>,
      );
      continue;
    }
    const choice = choiceDistribution(block, answerMaps);
    if (choice) {
      const max = Math.max(1, ...choice.map((c) => c.count));
      sections.push(
        <Card key={block.id}>
          <p className="text-sm font-semibold">{recallLabels(block.title, blocks ?? [])}</p>
          <Bars rows={choice.map((c) => ({ label: c.label, count: c.count }))} max={max} />
        </Card>,
      );
      continue;
    }
    const numeric = numericDistribution(block, answerMaps);
    if (numeric && numeric.total > 0) {
      const max = Math.max(1, ...numeric.counts.map((c) => c.count));
      sections.push(
        <Card key={block.id}>
          <p className="text-sm font-semibold">{recallLabels(block.title, blocks ?? [])}</p>
          <p className="mt-2 font-display text-3xl tracking-tight">
            {numeric.average}
            <span className="ml-2 align-middle font-sans text-xs font-normal text-ink-faint">average · {numeric.total} answers</span>
          </p>
          <div className="mt-3 flex h-12 items-end gap-1">
            {numeric.counts.map((c) => (
              <div key={c.value} className="flex flex-1 flex-col items-center gap-1" title={`${c.value}: ${c.count}`}>
                <div className="w-full rounded-sm bg-ink" style={{ height: `${Math.max(6, Math.round((c.count / max) * 36))}px` }} />
                <span className="text-[10px] text-ink-faint">{c.value}</span>
              </div>
            ))}
          </div>
        </Card>,
      );
      continue;
    }
    const matrix = matrixDistribution(block, answerMaps);
    if (matrix && matrix.rows.some((r) => r.total > 0)) {
      sections.push(
        <Card key={block.id} className="md:col-span-2">
          <p className="text-sm font-semibold">{recallLabels(block.title, blocks ?? [])}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-faint" />
                  {matrix.columns.map((c) => (
                    <th key={c.id} className="pb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <th scope="row" className="py-2 pr-3 text-left font-medium text-ink-soft">
                      {r.label}
                    </th>
                    {r.counts.map((n, i) => (
                      <td key={i} className="py-2 text-center tabular-nums">
                        <span className="inline-block rounded-md px-2 py-0.5" style={{ background: `rgba(16,16,18,${r.total ? 0.06 + (n / r.total) * 0.5 : 0.06})`, color: r.total && n / r.total > 0.5 ? "#fff" : undefined }}>
                          {n}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>,
      );
    }
  }

  return (
    <section aria-label="Analytics" className="mt-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Views" value={viewCount.toLocaleString("en-IN")} />
        <Stat label="Completions" value={completions.toLocaleString("en-IN")} />
        <Stat label="Completion rate" value={viewCount > 0 ? `${pct(completions, viewCount)}%` : "—"} />
        <Stat label="Avg. time" value={avgSecs !== null ? `${avgSecs}s` : "—"} />
        <Stat label="From QR" value={fromQr.toLocaleString("en-IN")} />
      </div>
      <Card className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Responses · last 14 days</p>
        <div className="mt-3 flex h-20 items-end gap-1.5" role="img" aria-label="Daily response counts">
          {days.map((d) => (
            <div key={d.label} title={`${d.label}: ${d.count}`} className="flex-1 rounded-sm bg-ink" style={{ height: `${Math.max(4, Math.round((d.count / maxDay) * 100))}%`, opacity: d.count === 0 ? 0.12 : 1 }} />
          ))}
        </div>
      </Card>
      {sections.length > 0 && <div className="mt-3 grid gap-3 md:grid-cols-2">{sections}</div>}
    </section>
  );
}

function preview(blocks: Block[] | null, row: SubmissionRow): string {
  const parts: string[] = [];
  const list = blocks ? blocks.filter((b) => isAnswerable(b.type)) : [];
  if (list.length) {
    for (const b of list) {
      const v = displayAnswer(b, row.answers[b.id]);
      if (v) parts.push(v);
      if (parts.join(" · ").length > 140) break;
    }
  } else {
    for (const a of Object.values(row.answers)) {
      parts.push(typeof a.value === "string" ? a.value : JSON.stringify(a.value));
    }
  }
  const text = parts.join(" · ");
  return text.length > 140 ? `${text.slice(0, 140)}…` : text || "—";
}

export default async function ResponsesPage({
  params,
  searchParams,
}: {
  params: { formId: string };
  searchParams?: { from?: string; to?: string; q?: string };
}) {
  if (!isSupabaseConfigured()) return <ConfigRequired area="responses" />;
  const res = await getAppContext();
  if (!res.ok) redirect(`/login?next=/forms/${params.formId}/responses`);
  const owned = await getFormForOwner(params.formId);
  if ("error" in owned) redirect("/dashboard");
  const form = owned.form;
  const admin = getServiceSupabase()!;

  const { data: formRow } = await admin.from("forms").select("published_version_id").eq("id", form.id).single();
  const publishedId = (formRow as { published_version_id: string | null } | null)?.published_version_id;
  let blocks: Block[] | null = null;
  let versionSettings: FormSettings = {};
  if (publishedId) {
    const { data: version } = await admin.from("form_versions").select("schema, settings").eq("id", publishedId).single();
    const v = version as { schema: unknown; settings: FormSettings | null } | null;
    const parsed = formSchemaV1.safeParse(v?.schema);
    if (parsed.success) blocks = parsed.data.blocks;
    versionSettings = v?.settings ?? {};
  }
  const quiz = Boolean(versionSettings.quizMode && blocks);

  let query = admin
    .from("submissions")
    .select("id, submitted_at, source, answers")
    .eq("form_id", form.id)
    .is("deleted_at", null)
    .order("submitted_at", { ascending: false })
    .limit(100);
  if (searchParams?.from) query = query.gte("submitted_at", searchParams.from);
  if (searchParams?.to) query = query.lte("submitted_at", `${searchParams.to}T23:59:59.999Z`);
  const { data } = await query;
  let rows = (data ?? []) as SubmissionRow[];
  const q = searchParams?.q?.trim().toLowerCase();
  if (q) rows = rows.filter((r) => JSON.stringify(r.answers).toLowerCase().includes(q));
  const filtered = Boolean(searchParams?.from || searchParams?.to || q);

  return (
    <AppShell ctx={res.ctx} active="forms">
      <FormSubnav
        formId={form.id}
        title={form.title}
        status={form.status}
        slug={form.slug}
        active="responses"
        actions={
          <>
            <StateActions formId={form.id} status={form.status} canReopen={form.status === "closed"} />
            <ButtonLink href={`/api/forms/${form.id}/export`} variant="secondary">
              <Download className="h-4 w-4" /> Export CSV
            </ButtonLink>
          </>
        }
      />

      <Analytics formId={form.id} blocks={blocks} quiz={quiz} />

      <form method="get" className="mt-8 flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-ink-soft">
          <span className="mb-1 block">From</span>
          <Input type="date" name="from" defaultValue={searchParams?.from ?? ""} className="w-40 !py-2" />
        </label>
        <label className="text-xs font-semibold text-ink-soft">
          <span className="mb-1 block">To</span>
          <Input type="date" name="to" defaultValue={searchParams?.to ?? ""} className="w-40 !py-2" />
        </label>
        <label className="text-xs font-semibold text-ink-soft">
          <span className="mb-1 block">Search answers</span>
          <Input type="search" name="q" defaultValue={searchParams?.q ?? ""} placeholder="name, choice…" className="w-52 !py-2" />
        </label>
        <button type="submit" className="h-[38px] rounded-full border border-line-strong px-4 text-xs font-semibold hover:border-ink/40">
          Filter
        </button>
        {filtered && (
          <Link href={`/forms/${form.id}/responses`} className="h-[38px] rounded-full px-3 text-xs font-medium leading-[38px] text-ink-soft hover:bg-ink/5">
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Inbox className="h-5 w-5" />}
          title={filtered ? "No responses match" : "No responses yet"}
          description={
            filtered
              ? "Try a wider date range or a different search."
              : form.status === "published"
                ? "Share your live link or QR code and answers appear here as they arrive."
                : "Publish this form from the builder, then share it to collect answers."
          }
          action={
            !filtered && form.status !== "published" ? (
              <ButtonLink href={`/builder/${form.id}`} variant="primary">
                Open builder
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-paper">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/forms/${form.id}/responses/${r.id}`} className="block px-5 py-4 transition-colors hover:bg-paper-deep/40">
                  <p className="text-sm font-medium">{preview(blocks, r)}</p>
                  <p className="mt-1 text-xs text-ink-faint">
                    {formatDateTime(r.submitted_at)}
                    {r.source ? ` · via ${r.source}` : ""}
                    {quiz && blocks
                      ? (() => {
                          const s = scoreAnswers({ blocks }, r.answers);
                          return s.max > 0 ? ` · score ${s.points}/${s.max}` : "";
                        })()
                      : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-faint">
            Showing {rows.length === 100 ? "the latest 100" : rows.length} response{rows.length === 1 ? "" : "s"}. Export CSV for everything.
          </p>
        </>
      )}
    </AppShell>
  );
}
