import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { isApplicationConfigured } from "@/lib/backend";
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
import { hasWorkspaceRole } from "@/lib/security/workspace";
import { StateActions } from "./StateActions";
import { ExportCsvButton } from "@/components/app/ExportCsvButton";
import { isAzureBackend } from "@/lib/backend";
import { getSessionUserId } from "@/lib/supabase/server";
import { readForm, readOwnedVersion } from "@/lib/db/repositories/forms";
import { analytics, searchResponses } from "@/lib/db/repositories/responses";
import { databaseResult } from "@/lib/db/result";

export const metadata: Metadata = { title: "Responses", robots: { index: false } };

interface SubmissionRow {
  id: string;
  submitted_at: string;
  source: string | null;
  answers: Record<string, AnswerValue>;
  tags: string[] | null;
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
  if (!isAzureBackend() && !admin) return null;

  const analytical = (blocks ?? []).filter((b) => ["yes_no", "single_choice", "multiple_choice", "dropdown", "rating", "opinion_scale", "number", "slider", "nps", "matrix", "ranking"].includes(b.type) || Boolean(b.quiz));
  const { data: raw, error } = isAzureBackend() ? await databaseResult(analytics((await getSessionUserId())!, formId, analytical.map(b => b.id))) : await admin!.rpc("form_analytics", { p_form_id: formId, p_question_ids: analytical.map((b) => b.id) });
  if (error || !raw) return <p role="alert" className="mt-6 text-sm">Analytics are temporarily unavailable. Please try again.</p>;
  const stats = raw as { views: number; completions: number; completedVisits: number; avgSecs: number | null; fromQr: number;
    days: Record<string, number>; answers: Record<string, Array<{ answer: AnswerValue; count: number }>>;
    reached: Record<string, number>; abandoned: number; inProgress: number };
  const { completions, avgSecs, fromQr } = stats;
  const viewCount = stats.views;
  if (!viewCount && !completions) return null;
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(Date.now() - (13 - i) * 86400_000).toISOString().slice(0, 10);
    return { label: date.slice(5), count: stats.days[date] ?? 0 };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.count));
  const answerable = (blocks ?? []).filter((b) => isAnswerable(b.type));
  const funnel = answerable.length ? { started: viewCount, completed: stats.completedVisits,
    steps: answerable.map((b) => ({ label: recallLabels(b.title, blocks ?? []), reached: stats.reached[b.id] ?? 0 })) } : null;
  const inProgress = stats.inProgress;
  const sections: React.ReactNode[] = [];

  if (quiz && blocks && completions > 0) {
    const maximum = scoreAnswers({ blocks }, {}).max;
    let points = 0;
    const perQuestion = blocks.filter((b) => b.quiz).map((b) => {
      let count = 0;
      for (const group of stats.answers[b.id] ?? []) {
        const result = scoreAnswers({ blocks: [b] }, { [b.id]: group.answer });
        points += result.points * group.count;
        if (result.perQuestion[0]?.correct) count += group.count;
      }
      return { label: recallLabels(b.title, blocks), count };
    });
    if (maximum > 0) sections.push(<Card key="__quiz" className="md:col-span-2">
      <p className="text-sm font-semibold">Quiz results</p>
      <p className="mt-2 font-display text-3xl tracking-tight">{Math.round(points / completions * 10) / 10} / {maximum}
        <span className="ml-2 align-middle font-sans text-xs font-normal text-ink-faint">average score</span></p>
      <p className="mt-4 text-xs font-medium text-ink-faint">Answered correctly</p><Bars rows={perQuestion} max={completions} />
    </Card>);
  }

  for (const block of blocks ?? []) {
    const groups = stats.answers[block.id] ?? [];
    const answerMaps = groups.map((g) => ({ [block.id]: g.answer }));
    const weights = groups.map((g) => g.count);
    const nps = npsScore(block, answerMaps, weights);
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
    const ranking = rankingDistribution(block, answerMaps, weights);
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
    const choice = choiceDistribution(block, answerMaps, weights);
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
    const numeric = numericDistribution(block, answerMaps, weights);
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
    const matrix = matrixDistribution(block, answerMaps, weights);
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
        <Stat label="Completion rate" value={viewCount > 0 ? `${pct(stats.completedVisits, viewCount)}%` : "—"} />
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
      {funnel && (
        <Card className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Drop-off · where starters stop</p>
          <p className="mt-1 text-xs text-ink-faint">
            {funnel.started.toLocaleString("en-IN")} started · {funnel.completed.toLocaleString("en-IN")} finished ·{" "}
            {stats.abandoned.toLocaleString("en-IN")} abandoned
            {inProgress > 0 && ` · ${inProgress} answering now`}
          </p>
          <Bars rows={funnel.steps.map((st) => ({ label: st.label, count: st.reached }))} max={Math.max(1, funnel.started)} />
        </Card>
      )}
      {sections.length > 0 && <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">{sections}</div>}
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

export default async function ResponsesPage(
  props: {
    params: Promise<{ formId: string }>;
    searchParams?: Promise<{ from?: string; to?: string; q?: string; tag?: string; page?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  if (!isAzureBackend() && !isApplicationConfigured()) return <ConfigRequired area="responses" />;
  const res = await getAppContext();
  if (!res.ok) redirect(`/login?next=/forms/${params.formId}/responses`);
  const owned = await getFormForOwner(params.formId);
  if ("error" in owned) redirect("/dashboard");
  const form = owned.form;
  const canEdit = await hasWorkspaceRole(form.workspace_id, "editor");
  const admin = getServiceSupabase()!;

  const { data: formRow } = isAzureBackend() ? { data: await readForm(res.ctx.userId,form.id) } : await admin.from("forms").select("published_version_id").eq("id", form.id).single();
  const publishedId = (formRow as { published_version_id: string | null } | null)?.published_version_id;
  let blocks: Block[] | null = null;
  let versionSettings: FormSettings = {};
  if (publishedId) {
    const { data: version } = isAzureBackend() ? { data: await readOwnedVersion(res.ctx.userId,form.id,publishedId) } : await admin.from("form_versions").select("schema, settings").eq("id", publishedId).single();
    const v = version as { schema: unknown; settings: FormSettings | null } | null;
    const parsed = formSchemaV1.safeParse(v?.schema);
    if (parsed.success) blocks = parsed.data.blocks;
    versionSettings = v?.settings ?? {};
  }
  const quiz = Boolean(versionSettings.quizMode && blocks);

  const page = Math.max(1, Math.min(10001, Number.parseInt(searchParams?.page ?? "1", 10) || 1));
  const date = (value?: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
  const from = date(searchParams?.from);
  const to = date(searchParams?.to);
  const q = searchParams?.q?.trim().slice(0, 200) ?? "";
  const activeTag = searchParams?.tag?.trim().toLowerCase().slice(0, 30) ?? "";
  const { data, error: searchError } = isAzureBackend() ? await databaseResult(searchResponses(res.ctx.userId,form.id, {
    q,tag:activeTag,from:from ? `${from}T00:00:00Z` : null,to:to ? new Date(Date.parse(to)+86400_000).toISOString() : null,offset:(page-1)*100,
  })) : await admin.rpc("search_form_responses", {
    p_form_id: form.id, p_query: q, p_tag: activeTag,
    p_from: from ? `${from}T00:00:00Z` : null,
    p_to: to ? new Date(Date.parse(to) + 86400_000).toISOString() : null,
    p_offset: (page - 1) * 100, p_limit: 100,
  });
  if (searchError) throw new Error("Responses are temporarily unavailable. Please try again.");
  const rows = (data?.rows ?? []) as SubmissionRow[];
  const total = Number(data?.total ?? 0);
  const filtered = Boolean(from || to || q || activeTag);
  const allTags = (data?.tags ?? []) as string[];
  const pageUrl = (next: number) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (q) params.set("q", q);
    if (activeTag) params.set("tag", activeTag);
    params.set("page", String(next));
    return `/forms/${form.id}/responses?${params}`;
  };

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
            {canEdit && <StateActions formId={form.id} status={form.status} canReopen={form.status === "closed"} />}
            <ExportCsvButton href={`/api/forms/${form.id}/export`} />
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
        {allTags.length > 0 && (
          <label className="text-xs font-semibold text-ink-soft">
            <span className="mb-1 block">Tag</span>
            <select name="tag" defaultValue={activeTag ?? ""} className="h-[38px] rounded-xl border border-line-strong bg-paper px-3 text-sm">
              <option value="">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
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
                  {(r.tags ?? []).length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {(r.tags ?? []).map((t) => (
                        <span key={t} className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                          {t}
                        </span>
                      ))}
                    </p>
                  )}
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
            Showing {(page - 1) * 100 + 1}?{(page - 1) * 100 + rows.length} of {total.toLocaleString("en-IN")} responses.
          </p>
          <nav aria-label="Response pages" className="mt-3 flex items-center gap-4 text-sm">
            {page > 1 && <Link href={pageUrl(page - 1)}>Previous</Link>}
            <span>Page {page}</span>
            {page * 100 < total && <Link href={pageUrl(page + 1)}>Next</Link>}
          </nav>
        </>
      )}
    </AppShell>
  );
}
