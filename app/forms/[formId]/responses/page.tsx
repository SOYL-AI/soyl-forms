import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getFormForOwner } from "@/lib/forms/actions";
import { formSchemaV1 } from "@/lib/forms/schema";
import { choiceDistribution, numericDistribution } from "@/lib/forms/distributions";
import type { AnswerValue } from "@/types/forms";
import { StateActions } from "./StateActions";

interface SubmissionRow {
  id: string;
  submitted_at: string;
  source: string | null;
  answers: Record<string, AnswerValue>;
}

async function Analytics({ formId }: { formId: string }) {
  const admin = getServiceSupabase();
  if (!admin) return null;

  const [{ count: views }, { data: visits }, { data: subs }, { data: formRow }] =
    await Promise.all([
      admin.from("form_visits").select("id", { count: "exact", head: true }).eq("form_id", formId),
      admin
        .from("form_visits")
        .select("duration_ms")
        .eq("form_id", formId)
        .not("completed_at", "is", null)
        .limit(2000),
      admin
        .from("submissions")
        .select("answers, submitted_at")
        .eq("form_id", formId)
        .is("deleted_at", null)
        .order("submitted_at", { ascending: true })
        .limit(2000),
      admin.from("forms").select("published_version_id").eq("id", formId).single(),
    ]);

  const submissions = ((subs ?? []) as Array<{ answers: Record<string, AnswerValue>; submitted_at: string }>);
  const completions = submissions.length;
  const viewCount = views ?? 0;
  if (viewCount === 0 && completions === 0) return null;

  const durations = ((visits ?? []) as Array<{ duration_ms: number | null }>)
    .map((v) => v.duration_ms)
    .filter((d): d is number => typeof d === "number" && d > 0);
  const avgSecs =
    durations.length > 0
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length / 1000)
      : null;

  // Submissions per day, last 14 days.
  const days: Array<{ label: string; count: number }> = [];
  const byDay = new Map<string, number>();
  for (const s of submissions) {
    const day = s.submitted_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10) as string;
    days.push({ label: d.slice(5), count: byDay.get(d) ?? 0 });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  // Per-question breakdowns from the live version's schema.
  const publishedId = (formRow as { published_version_id: string | null } | null)
    ?.published_version_id;
  let distBlocks: React.ReactNode = null;
  if (publishedId) {
    const { data: version } = await admin
      .from("form_versions")
      .select("schema")
      .eq("id", publishedId)
      .single();
    const parsed = formSchemaV1.safeParse((version as { schema: unknown } | null)?.schema);
    if (parsed.success) {
      const answerMaps = submissions.map((s) => s.answers);
      const sections = [];
      for (const block of parsed.data.blocks) {
        const choice = choiceDistribution(block, answerMaps);
        if (choice) {
          const max = Math.max(1, ...choice.map((c) => c.count));
          sections.push(
            <div key={block.id} className="rounded-2xl border border-ink/10 bg-white p-5">
              <p className="text-sm font-bold">{block.title}</p>
              <ul className="mt-3 space-y-2">
                {choice.map((c) => (
                  <li key={c.optionId} className="flex items-center gap-2 text-sm">
                    <span className="w-32 shrink-0 truncate text-ink-soft">{c.label}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
                      <span
                        className="block h-full rounded-full bg-brand-600"
                        style={{ width: `${Math.round((c.count / max) * 100)}%` }}
                      />
                    </span>
                    <span className="w-8 text-right tabular-nums text-ink-soft">{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>,
          );
          continue;
        }
        const numeric = numericDistribution(block, answerMaps);
        if (numeric && numeric.total > 0) {
          sections.push(
            <div key={block.id} className="rounded-2xl border border-ink/10 bg-white p-5">
              <p className="text-sm font-bold">{block.title}</p>
              <p className="mt-2 font-display text-3xl">
                {numeric.average}
                <span className="ml-2 align-middle font-sans text-xs font-normal text-ink-faint">
                  average · {numeric.total} answers
                </span>
              </p>
            </div>,
          );
        }
      }
      if (sections.length > 0) {
        distBlocks = <div className="mt-4 grid gap-4 md:grid-cols-2">{sections}</div>;
      }
    }
  }

  const stats: Array<[string, string]> = [
    ["Views", viewCount.toLocaleString("en-IN")],
    ["Completions", completions.toLocaleString("en-IN")],
    [
      "Completion rate",
      viewCount > 0 ? `${Math.round((completions / viewCount) * 100)}%` : "—",
    ],
    ["Avg. time", avgSecs !== null ? `${avgSecs}s` : "—"],
  ];

  return (
    <section aria-label="Analytics" className="mt-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-ink/10 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
              {label}
            </p>
            <p className="font-display text-2xl">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-2xl border border-ink/10 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
          Responses · last 14 days
        </p>
        <div className="mt-3 flex h-20 items-end gap-1.5" role="img" aria-label="Daily response counts">
          {days.map((d) => (
            <div key={d.label} title={`${d.label}: ${d.count}`} className="flex-1 rounded-sm bg-brand-600/80" style={{ height: `${Math.max(4, Math.round((d.count / maxDay) * 100))}%`, opacity: d.count === 0 ? 0.2 : 1 }} />
          ))}
        </div>
      </div>
      {distBlocks}
    </section>
  );
}

function preview(row: SubmissionRow): string {
  const values = Object.values(row.answers)
    .map((a) => {
      if (typeof a.value === "string") return a.value;
      if (Array.isArray(a.value)) return a.value.join(", ");
      return String(a.value);
    })
    .filter(Boolean);
  const text = values.join(" · ");
  return text.length > 120 ? `${text.slice(0, 120)}…` : text || "—";
}

export default async function ResponsesPage({
  params,
  searchParams,
}: {
  params: { formId: string };
  searchParams?: { from?: string; to?: string; q?: string };
}) {
  const owned = await getFormForOwner(params.formId);
  if ("error" in owned) redirect("/login");
  const form = owned.form;

  const supabase = getServerSupabase();
  let query = supabase!
    .from("submissions")
    .select("id, submitted_at, source, answers")
    .eq("form_id", form.id)
    .is("deleted_at", null)
    .order("submitted_at", { ascending: false })
    .limit(100);
  if (searchParams?.from) query = query.gte("submitted_at", searchParams.from);
  if (searchParams?.to) query = query.lte("submitted_at", searchParams.to);
  const { data } = await query;
  let rows = ((data ?? []) as SubmissionRow[]);
  const q = searchParams?.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => JSON.stringify(r.answers).toLowerCase().includes(q));
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <p>
        <Link href="/dashboard" className="text-sm font-semibold text-ink-soft hover:text-ink">
          ← Dashboard
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">{form.title}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {rows.length} response{rows.length === 1 ? "" : "s"}
            {form.status === "published" && (
              <>
                {" · "}
                <Link href={`/f/${form.slug}`} className="font-semibold text-brand-700 hover:text-brand-900">
                  View live form
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StateActions
            formId={form.id}
            status={form.status}
            canReopen={form.status === "closed"}
          />
          <a
            href={`/api/forms/${form.id}/export`}
            className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white"
          >
            Export CSV
          </a>
        </div>
      </div>

      <Analytics formId={form.id} />

      <form method="get" className="mt-6 flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold">
          <span className="mb-1 block text-ink-soft">From</span>
          <input
            type="date"
            name="from"
            defaultValue={searchParams?.from ?? ""}
            className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold">
          <span className="mb-1 block text-ink-soft">To</span>
          <input
            type="date"
            name="to"
            defaultValue={searchParams?.to ?? ""}
            className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold">
          <span className="mb-1 block text-ink-soft">Search answers</span>
          <input
            type="search"
            name="q"
            defaultValue={searchParams?.q ?? ""}
            placeholder="name, choice…"
            className="w-44 rounded-lg border border-ink/15 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold hover:border-ink/30"
        >
          Filter
        </button>
        {(searchParams?.from || searchParams?.to || searchParams?.q) && (
          <Link
            href={`/forms/${form.id}/responses`}
            className="rounded-full px-3 py-2 text-xs font-medium text-ink-soft hover:bg-ink/5"
          >
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-ink/10 bg-paper p-8 text-center">
          <p className="text-lg font-semibold">No responses yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
            {form.status === "published"
              ? "Share your live link and answers will appear here."
              : "Publish this form from the builder, then share it to collect answers."}
          </p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/forms/${form.id}/responses/${r.id}`}
                className="block px-5 py-4 transition-colors hover:bg-paper"
              >
                <p className="text-sm font-medium">{preview(r)}</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {new Date(r.submitted_at).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {r.source ? ` · via ${r.source}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-faint">Showing up to the latest 100 responses.</p>
    </main>
  );
}
