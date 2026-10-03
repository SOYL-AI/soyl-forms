"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Pencil, X } from "lucide-react";
import { OTHER_OPTION_ID, type AnswerValue, type Block } from "@/types/forms";
import { displayAnswer } from "@/lib/forms/answers";
import { recallLabels } from "@/lib/forms/recall";
import { BLOCK_ICONS } from "@/lib/forms/blockIcons";
import { setSubmissionTags, updateSubmissionAnswer } from "@/lib/forms/actions";

const EDITABLE = new Set([
  "short_text",
  "long_text",
  "email",
  "phone",
  "url",
  "number",
  "date",
  "time",
  "yes_no",
  "single_choice",
  "dropdown",
  "multiple_choice",
]);

function currentText(answer: AnswerValue | undefined): string {
  if (!answer) return "";
  return typeof answer.value === "string" ? answer.value : "";
}

/** Type-appropriate input for the editable question kinds. */
function EditControl({
  block,
  answer,
  onCommit,
}: {
  block: Block;
  answer: AnswerValue | undefined;
  onCommit: (value: unknown) => void;
}) {
  const [text, setText] = useState(currentText(answer));
  const [pick, setPick] = useState<string>(
    answer && (answer.type === "single_choice" || answer.type === "dropdown" || answer.type === "yes_no")
      ? String(answer.value)
      : "",
  );
  const [picks, setPicks] = useState<string[]>(
    answer && answer.type === "multiple_choice" && Array.isArray(answer.value) ? [...answer.value] : [],
  );
  const [otherText, setOtherText] = useState(
    answer && "otherText" in answer && typeof answer.otherText === "string" ? answer.otherText : "",
  );

  const commit = () => {
    switch (block.type) {
      case "short_text":
      case "long_text":
      case "email":
      case "phone":
      case "url":
      case "date":
      case "time":
        onCommit({ type: block.type, value: text });
        break;
      case "number": {
        const n = Number(text);
        onCommit(Number.isFinite(n) ? { type: "number", value: n } : { type: "number", value: text });
        break;
      }
      case "yes_no":
        onCommit({ type: "yes_no", value: pick });
        break;
      case "single_choice":
      case "dropdown":
        onCommit(
          pick === OTHER_OPTION_ID
            ? { type: block.type, value: pick, otherText }
            : { type: block.type, value: pick },
        );
        break;
      case "multiple_choice": {
        const value = picks.filter((id, i) => picks.indexOf(id) === i);
        onCommit(
          value.includes(OTHER_OPTION_ID)
            ? { type: "multiple_choice", value, otherText }
            : { type: "multiple_choice", value },
        );
        break;
      }
      default:
        break;
    }
  };

  if (
    block.type === "short_text" ||
    block.type === "email" ||
    block.type === "phone" ||
    block.type === "url" ||
    block.type === "date" ||
    block.type === "time"
  ) {
    return (
      <EditRow
        onCommit={commit}
        control={
          <input
            type={block.type === "date" ? "date" : block.type === "time" ? "time" : "text"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-xl border border-line-strong bg-paper px-3 py-2 text-sm"
          />
        }
      />
    );
  }
  if (block.type === "long_text") {
    return (
      <EditRow
        onCommit={commit}
        control={
          <textarea
            value={text}
            rows={3}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-xl border border-line-strong bg-paper px-3 py-2 text-sm"
          />
        }
      />
    );
  }
  if (block.type === "number") {
    return (
      <EditRow
        onCommit={commit}
        control={
          <input
            type="number"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-40 rounded-xl border border-line-strong bg-paper px-3 py-2 text-sm"
          />
        }
      />
    );
  }
  if (block.type === "yes_no") {
    return (
      <EditRow
        onCommit={commit}
        control={
          <div className="flex gap-2">
            {(["yes", "no"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setPick(v)}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${pick === v ? "border-ink bg-ink text-paper" : "border-line-strong"}`}
              >
                {v === "yes" ? "Yes" : "No"}
              </button>
            ))}
          </div>
        }
      />
    );
  }
  if (block.type === "single_choice" || block.type === "dropdown") {
    return (
      <EditRow
        onCommit={commit}
        control={
          <div className="flex flex-col gap-2">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="w-full rounded-xl border border-line-strong bg-paper px-3 py-2 text-sm"
            >
              <option value="">Choose…</option>
              {block.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
              {block.allowOther && <option value={OTHER_OPTION_ID}>Other…</option>}
            </select>
            {pick === OTHER_OPTION_ID && (
              <input
                value={otherText}
                placeholder="What is “Other”?"
                onChange={(e) => setOtherText(e.target.value)}
                className="w-full rounded-xl border border-line-strong bg-paper px-3 py-2 text-sm"
              />
            )}
          </div>
        }
      />
    );
  }
  if (block.type === "multiple_choice") {
    return (
      <EditRow
        onCommit={commit}
        control={
          <div className="flex flex-col gap-1.5">
            {block.options.map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picks.includes(o.id)}
                  onChange={(e) =>
                    setPicks((p) => (e.target.checked ? [...p, o.id] : p.filter((id) => id !== o.id)))
                  }
                />
                {o.label}
              </label>
            ))}
            {block.allowOther && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picks.includes(OTHER_OPTION_ID)}
                  onChange={(e) =>
                    setPicks((p) =>
                      e.target.checked ? [...p, OTHER_OPTION_ID] : p.filter((id) => id !== OTHER_OPTION_ID),
                    )
                  }
                />
                Other…
              </label>
            )}
            {picks.includes(OTHER_OPTION_ID) && (
              <input
                value={otherText}
                placeholder="What is “Other”?"
                onChange={(e) => setOtherText(e.target.value)}
                className="w-full rounded-xl border border-line-strong bg-paper px-3 py-2 text-sm"
              />
            )}
          </div>
        }
      />
    );
  }
  return null;
}

function EditRow({ control, onCommit }: { control: React.ReactNode; onCommit: () => void }) {
  return (
    <span className="mt-2 block">
      {control}
      <span className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onCommit}
          className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-paper"
        >
          <Check className="h-3 w-3" /> Save
        </button>
      </span>
    </span>
  );
}

function AnswerRow({
  block,
  blocks,
  answer,
  formId,
  submissionId,
  canEdit,
  grade,
}: {
  block: Block;
  blocks: Block[];
  answer: AnswerValue | undefined;
  formId: string;
  submissionId: string;
  canEdit: boolean;
  grade?: { correct: boolean; points: number };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const Icon = BLOCK_ICONS[block.type];
  const editable = canEdit && EDITABLE.has(block.type);

  async function commit(value: unknown) {
    setSaving(true);
    setError(null);
    try {
      const res = await updateSubmissionAnswer({ formId, submissionId, blockId: block.id, value });
      if (!res.ok) setError(res.error);
      else {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-1 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-6">
      <dt className="flex items-start gap-2 text-sm text-ink-soft">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
        <span className="flex-1">{recallLabels(block.title, blocks)}</span>
        {grade && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${grade.correct ? "bg-positive-soft text-positive" : "bg-danger-soft text-danger"}`}
          >
            {grade.correct ? `+${grade.points}` : "0"}
          </span>
        )}
      </dt>
      <dd className="whitespace-pre-wrap text-[15px] leading-relaxed">
        {!editing && block.type === "file_upload" && answer?.type === "file_upload" && answer.value.length > 0 ? (
          <ul className="space-y-1">
            {answer.value.map((id) => (
              <li key={id}>
                <a href={`/api/files/${id}`} className="inline-flex items-center gap-1.5 font-medium text-ink underline underline-offset-2">
                  <Download className="h-3.5 w-3.5" /> Download file
                </a>
              </li>
            ))}
          </ul>
        ) : !editing ? (
          displayAnswer(block, answer) || <span className="text-ink-faint">—</span>
        ) : null}
        {editable && !editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setError(null);
            }}
            className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 align-middle text-xs font-semibold text-ink-faint hover:bg-ink/5 hover:text-ink"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
        {editing && (
          <span className="block">
            <EditControl block={block} answer={answer} onCommit={commit} />
            <span className="mt-1 flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditing(false)}
                className="text-xs font-semibold text-ink-soft hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
              {saving && <span className="text-xs text-ink-faint">Saving…</span>}
            </span>
            {error && (
              <span role="alert" className="mt-1 block text-xs text-danger">
                {error}
              </span>
            )}
          </span>
        )}
      </dd>
    </div>
  );
}

export function ResponseEditor({
  blocks,
  answers,
  formId,
  submissionId,
  canEdit,
  grades,
}: {
  blocks: Block[];
  answers: Record<string, AnswerValue>;
  formId: string;
  submissionId: string;
  canEdit: boolean;
  /** Quiz grades by question id (plain object: Maps can't cross to client). */
  grades?: Record<string, { correct: boolean; points: number }>;
}) {
  if (blocks.length === 0) {
    return <p className="px-5 py-4 text-sm text-ink-soft">This response&apos;s form version is no longer readable; raw answers are preserved in the export.</p>;
  }
  return (
    <div className="divide-y divide-line">
      {blocks.map((b) => (
        <AnswerRow
          key={b.id}
          block={b}
          blocks={blocks}
          answer={answers[b.id]}
          formId={formId}
          submissionId={submissionId}
          canEdit={canEdit}
          grade={grades?.[b.id]}
        />
      ))}
    </div>
  );
}

export function TagEditor({
  formId,
  submissionId,
  initialTags,
  canEdit,
}: {
  formId: string;
  submissionId: string;
  initialTags: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [tags, setTags] = useState<string[]>(initialTags);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function persist(next: string[]) {
    setError(null);
    const res = await setSubmissionTags({ formId, submissionId, tags: next });
    if (!res.ok) setError(res.error);
    else {
      setTags(next);
      router.refresh();
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && !canEdit && <span className="text-sm text-ink-faint">No tags.</span>}
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-xs font-semibold text-ink-soft">
            {t}
            {canEdit && (
              <button
                type="button"
                aria-label={`Remove tag ${t}`}
                onClick={() => persist(tags.filter((x) => x !== t))}
                className="rounded-full p-0.5 hover:bg-ink/10"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      {canEdit && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const clean = draft.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 30);
            if (!clean || tags.includes(clean) || tags.length >= 10) return;
            if (!/^[a-z0-9][a-z0-9_-]*$/.test(clean)) {
              setError("Tags use letters, numbers, dashes.");
              return;
            }
            setDraft("");
            persist([...tags, clean]);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a tag, e.g. hot-lead"
            maxLength={30}
            className="w-52 rounded-xl border border-line-strong bg-paper px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:border-ink/40">
            Add
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
