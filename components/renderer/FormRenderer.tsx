"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Answers,
  AnswerValue,
  Block,
  FormSchemaV1,
  FormTheme,
} from "@/types/forms";
import { getNextBlockId, isAnswerable } from "@/lib/forms/logic";
import { resolveTheme } from "@/lib/forms/themes";
import { BlockShell, ChoiceButton, FileUploadInput, TextField } from "./blocks";
import { cn } from "@/lib/utils";

type DraftValue = string | string[] | number | null;

function toAnswer(block: Block, draft: DraftValue): AnswerValue | null {
  if (draft === null || draft === "" || (Array.isArray(draft) && draft.length === 0)) {
    return null;
  }
  switch (block.type) {
    case "short_text":
    case "long_text":
    case "email":
    case "phone":
    case "url":
    case "date":
      return typeof draft === "string"
        ? ({ type: block.type, value: draft } as AnswerValue)
        : null;
    case "number":
    case "rating":
    case "opinion_scale":
      return typeof draft === "number"
        ? ({ type: block.type, value: draft } as AnswerValue)
        : null;
    case "single_choice":
    case "dropdown":
    case "yes_no":
      return typeof draft === "string"
        ? ({ type: block.type, value: draft } as AnswerValue)
        : null;
    case "multiple_choice":
      return Array.isArray(draft)
        ? { type: "multiple_choice", value: draft }
        : null;
    case "file_upload":
      return Array.isArray(draft)
        ? { type: "file_upload", value: draft }
        : null;
    default:
      return null;
  }
}

function validateBlock(block: Block, draft: DraftValue): string | null {
  const empty =
    draft === null || draft === "" || (Array.isArray(draft) && draft.length === 0);
  if (
    block.type === "welcome" ||
    block.type === "statement" ||
    block.type === "thank_you"
  ) {
    return null;
  }
  if (empty) {
    if (!block.required) return null;
    switch (block.type) {
      case "single_choice":
      case "multiple_choice":
      case "dropdown":
        return "Choose at least one option to continue.";
      case "yes_no":
        return "Pick Yes or No to continue.";
      case "rating":
      case "opinion_scale":
        return "Pick a value to continue.";
      default:
        return "Your answer is needed to continue.";
    }
  }
  if (
    (block.type === "short_text" ||
      block.type === "long_text" ||
      block.type === "email" ||
      block.type === "phone" ||
      block.type === "url") &&
    typeof draft === "string"
  ) {
    const max = block.validation?.maxLength;
    if (max && draft.length > max) {
      return `Keep it under ${max} characters (currently ${draft.length}).`;
    }
    if (block.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft)) {
      return "Enter a valid email address.";
    }
    if (block.type === "url") {
      try {
        const u = new URL(draft.includes("://") ? draft : `https://${draft}`);
        if (!u.hostname.includes(".")) throw new Error("bad host");
      } catch {
        return "Enter a valid URL.";
      }
    }
  }
  if (block.type === "number" && typeof draft === "number") {
    if (Number.isNaN(draft)) return "Enter a valid number.";
    if (block.validation?.min !== undefined && draft < block.validation.min) {
      return `Enter ${block.validation.min} or more.`;
    }
    if (block.validation?.max !== undefined && draft > block.validation.max) {
      return `Enter ${block.validation.max} or less.`;
    }
  }
  return null;
}

export function FormRenderer({
  schema,
  accent,
  minimal,
  onComplete,
  onBeforeComplete,
  theme,
  uploads,
}: {
  schema: FormSchemaV1;
  accent?: string;
  /** Hide outer chrome (for `?embed=1`). */
  minimal?: boolean;
  onComplete?: (answers: Answers) => void;
  /**
   * Async gate run before the success screen: persist the answers, then
   * return ok. On failure the respondent stays on their answers with the
   * error shown — success is never displayed before persistence.
   */
  onBeforeComplete?: (answers: Answers) => Promise<{ ok: boolean; error?: string }>;
  /** Creator theme (background, text, accent, font, buttons). */
  theme?: FormTheme;
  /** Enables real uploads for file questions. Absent in previews/demos. */
  uploads?: { slug: string };
}) {
  const themed = useMemo(() => resolveTheme(theme), [theme]);
  const order = useMemo(() => schema.blocks.map((b) => b.id), [schema]);
  const byId = useMemo(
    () => new Map(schema.blocks.map((b) => [b.id, b])),
    [schema],
  );
  const [currentId, setCurrentId] = useState<string>(order[0] ?? "");
  const [history, setHistory] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftValue>>({});
  const [answers, setAnswers] = useState<Answers>({});
  const [error, setError] = useState<string | null>(null);
  const [stepKey, setStepKey] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittedOnce = useRef(false);
  /** Display names for uploaded files (ids live in drafts, survive remounts). */
  const fileNames = useRef<Record<string, Record<string, string>>>({});
  const announced = useMemo(() => byId.get(currentId)?.title ?? "", [byId, currentId]);

  const current: Block | undefined = byId.get(currentId);
  const currentIndex = order.indexOf(currentId);

  // Live-preview safety: if the schema changes under us (builder edits),
  // fall back to the first block instead of stranding on a deleted step.
  useEffect(() => {
    if (!order.includes(currentId)) {
      setCurrentId(order[0] ?? "");
      setHistory([]);
      setDrafts({});
      setError(null);
      setStepKey((k) => k + 1);
    }
  }, [order, currentId]);
  const answerableSoFar = useMemo(
    () =>
      schema.blocks
        .slice(0, currentIndex + 1)
        .filter((b) => isAnswerable(b.type)).length,
    [schema, currentIndex],
  );
  const progress =
    order.length > 1 ? Math.min(1, currentIndex / (order.length - 1)) : 1;

  const goTo = useCallback(
    (nextId: string | null, snapshot: Answers) => {
      if (nextId === null) {
        setCompleted(true);
        return;
      }
      setHistory((h) => [...h, currentId]);
      setCurrentId(nextId);
      setAnswers(snapshot);
      setError(null);
      setStepKey((k) => k + 1);
    },
    [currentId],
  );

  /** Advance, running the persistence gate before any success screen. */
  const finish = useCallback(
    async (next: string | null, snapshot: Answers) => {
      const nextBlock = next ? byId.get(next) : undefined;
      const completing = next === null || nextBlock?.type === "thank_you";
      const alreadySubmitted =
        current?.type === "thank_you" && submittedOnce.current;
      if (onBeforeComplete && completing && !alreadySubmitted) {
        setSubmitting(true);
        setError(null);
        try {
          const res = await onBeforeComplete(snapshot);
          if (!res.ok) {
            setError(
              res.error ??
                "Couldn't save your response. Check your connection and try again — your answers are kept.",
            );
            return;
          }
          submittedOnce.current = true;
        } finally {
          setSubmitting(false);
        }
      }
      goTo(next, snapshot);
    },
    [byId, current, onBeforeComplete, goTo],
  );

  const handleNext = useCallback(() => {
    if (!current || completed || submitting) return;
    if (
      current.type === "welcome" ||
      current.type === "statement" ||
      current.type === "thank_you"
    ) {
      const next = getNextBlockId(schema, current.id, answers);
      void finish(next, answers);
      return;
    }
    const draft: DraftValue = drafts[current.id] ?? null;
    const problem = validateBlock(current, draft);
    if (problem) {
      setError(problem);
      return;
    }
    const answer = toAnswer(current, draft);
    const snapshot: Answers = { ...answers };
    if (answer) snapshot[current.id] = answer;
    const next = getNextBlockId(schema, current.id, snapshot);
    void finish(next, snapshot);
  }, [current, completed, submitting, schema, answers, drafts, finish]);

  const handleBack = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1] as string;
      setCurrentId(prev);
      setError(null);
      setStepKey((k) => k + 1);
      return h.slice(0, -1);
    });
  }, []);

  // Keyboard navigation: Enter advances (Shift+Enter = newline in long text),
  // number keys pick single-choice options, Escape never destroys progress.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current || completed) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.tagName === "SELECT");
      if (e.key === "Escape") {
        e.preventDefault();
        return;
      }
      if (
        current.type === "single_choice" &&
        !typing &&
        /^[1-9]$/.test(e.key)
      ) {
        const idx = Number(e.key) - 1;
        const opt = current.options[idx];
        if (opt) {
          setDrafts((d) => ({ ...d, [current.id]: opt.id }));
          setError(null);
        }
        return;
      }
      if (e.key === "Enter" && current.type !== "long_text") {
        // Let buttons/links handle their own Enter; advance otherwise.
        if (
          target &&
          (target.tagName === "BUTTON" || target.tagName === "A")
        ) {
          return;
        }
        e.preventDefault();
        handleNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, completed, handleNext]);

  // Notify on completion (demo: local only; Phase 3 posts to the server).
  useEffect(() => {
    if (completed) onComplete?.(answers);
  }, [completed, answers, onComplete]);

  if (!current) {
    return (
      <p className="text-ink-soft">
        This form has no questions yet.
      </p>
    );
  }

  const showProgress =
    current.type !== "welcome" && current.type !== "thank_you";
  const isFirst = history.length === 0;
  const draft: DraftValue = drafts[current.id] ?? null;
  /** 1-based number for answerable questions ("1 →"); screens have none. */
  const stepNumber =
    current && isAnswerable(current.type) ? answerableSoFar : undefined;

  return (
    <div
      className="renderer-themed w-full"
      data-font={themed.font}
      data-buttons={themed.buttonStyle}
      style={{ backgroundColor: themed.background, color: themed.text }}
    >
      {/* Screen-reader announcements for question changes. */}
      <div aria-live="polite" className="sr-only">
        {announced}
      </div>

      {!minimal && showProgress && (
        <div className="mb-10">
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-ink/10"
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Form progress"
          >
            <div
              className="progress-animated h-full rounded-full"
              style={{
                width: `${Math.round(progress * 100)}%`,
                backgroundColor: accent ?? themed.accent,
              }}
            />
          </div>
        </div>
      )}

      <div key={stepKey} className="step-animated">
        {completed && current.type !== "thank_you" ? (
          <BlockShell
            large
            title="Thanks — your response was saved."
            description="You can close this page now."
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-2xl" aria-hidden>
              ✓
            </div>
          </BlockShell>
        ) : (
          renderStep()
        )}
      </div>

      {!minimal && !completed && (
        <div
          className="sticky bottom-0 mt-10 flex items-center gap-3 pb-2 pt-6"
          style={{
            background: `linear-gradient(to top, ${themed.background}, ${themed.background} 55%, transparent)`,
          }}
        >
          {!isFirst && (
            <button
              type="button"
              onClick={handleBack}
              disabled={submitting}
              className="rounded-full border border-ink/15 bg-white px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-ink/30 disabled:opacity-50"
            >
              ← Back
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={submitting}
            style={{ backgroundColor: themed.accent }}
            className={cn(
              "flex-1 px-5 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-70 sm:flex-none sm:px-8",
              themed.buttonStyle === "pill" ? "rounded-full" : "rounded-xl",
            )}
          >
            {submitting
              ? "Submitting…"
              : current.type === "welcome"
                ? (current.buttonLabel ?? "Start")
                : current.type === "thank_you"
                  ? "Done"
                  : isLastAnswerable()
                    ? "Submit →"
                    : "Next →"}
          </button>
        </div>
      )}
    </div>
  );

  function isLastAnswerable(): boolean {
    if (!current || !isAnswerable(current.type)) return false;
    return getNextBlockId(schema, current.id, answers) === null ||
      byId.get(getNextBlockId(schema, current.id, answers) ?? "")?.type ===
        "thank_you";
  }

  function renderStep() {
    if (!current) return null;
    switch (current.type) {
      case "welcome":
        return (
          <BlockShell large title={current.title} description={current.description}>
            <p className="text-sm text-ink-faint">
              Press <kbd className="rounded border border-ink/20 bg-white px-1.5 py-0.5 font-sans text-xs">Enter ↵</kbd> to begin
            </p>
          </BlockShell>
        );
      case "thank_you":
        return (
          <BlockShell large title={current.title} description={current.description}>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-2xl" aria-hidden>
              ✓
            </div>
          </BlockShell>
        );
      case "statement":
        return (
          <BlockShell title={current.title} description={current.description} />
        );
      case "short_text":
      case "email":
      case "phone":
      case "url":
        return (
          <BlockShell
            step={stepNumber}
            title={current.title}
            description={current.description}
            error={error}
            hint="Press Enter ↵ to continue"
            optional={!current.required}
          >
            <TextField
              id={`field-${current.id}`}
              value={typeof draft === "string" ? draft : ""}
              placeholder={current.placeholder}
              inputMode={
                current.type === "email"
                  ? "email"
                  : current.type === "phone"
                    ? "tel"
                    : current.type === "url"
                      ? "url"
                      : "text"
              }
              autoComplete={
                current.type === "email"
                  ? "email"
                  : current.type === "phone"
                    ? "tel"
                    : current.type === "url"
                      ? "url"
                      : undefined
              }
              onChange={(v) => {
                setDrafts((d) => ({ ...d, [current.id]: v }));
                if (error) setError(null);
              }}
              onEnter={handleNext}
            />
          </BlockShell>
        );
      case "long_text":
        return (
          <BlockShell
            step={stepNumber}
            title={current.title}
            description={current.description}
            error={error}
            hint="Shift + Enter for a new line · Enter to continue"
            optional={!current.required}
          >
            <TextField
              id={`field-${current.id}`}
              multiline
              value={typeof draft === "string" ? draft : ""}
              placeholder={current.placeholder}
              onChange={(v) => {
                setDrafts((d) => ({ ...d, [current.id]: v }));
                if (error) setError(null);
              }}
              onEnter={handleNext}
            />
          </BlockShell>
        );
      case "number": {
        const raw = typeof draft === "number" ? String(draft) : "";
        return (
          <BlockShell
            step={stepNumber}
            title={current.title}
            description={current.description}
            error={error}
            hint="Press Enter ↵ to continue"
            optional={!current.required}
          >
            <input
              id={`field-${current.id}`}
              data-autofocus
              autoFocus
              type="number"
              inputMode="decimal"
              value={raw}
              placeholder={current.placeholder}
              onChange={(e) => {
                const v = e.target.value;
                setDrafts((d) => ({
                  ...d,
                  [current.id]: v === "" ? null : Number(v),
                }));
                if (error) setError(null);
              }}
              className="w-full rounded-xl border border-ink/15 bg-white px-5 py-4 text-lg text-ink shadow-sm placeholder:text-ink-faint focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
          </BlockShell>
        );
      }
      case "single_choice":
      case "dropdown":
        return (
          <BlockShell
            step={stepNumber}
            title={current.title}
            description={current.description}
            error={error}
            hint="Press 1–9 to pick · Enter ↵ to continue"
            optional={!current.required}
          >
            <div role="listbox" aria-label={current.title} className="flex flex-col gap-2.5">
              {current.options.map((opt, i) => (
                <ChoiceButton
                  key={opt.id}
                  selected={draft === opt.id}
                  kbd={i < 9 ? String(i + 1) : undefined}
                  accent={themed.accent}
                  onSelect={() => {
                    setDrafts((d) => ({ ...d, [current.id]: opt.id }));
                    if (error) setError(null);
                  }}
                >
                  {opt.label}
                </ChoiceButton>
              ))}
            </div>
          </BlockShell>
        );
      case "multiple_choice": {
        const selected: string[] = Array.isArray(draft) ? draft : [];
        return (
          <BlockShell
            step={stepNumber}
            title={current.title}
            description={current.description}
            error={error}
            hint="Tap all that apply · Enter ↵ to continue"
            optional={!current.required}
          >
            <div className="flex flex-col gap-2.5" role="group" aria-label={current.title}>
              {current.options.map((opt) => {
                const on = selected.includes(opt.id);
                return (
                  <ChoiceButton
                    key={opt.id}
                    selected={on}
                    accent={themed.accent}
                    onSelect={() => {
                      setDrafts((d) => ({
                        ...d,
                        [current.id]: on
                          ? selected.filter((s) => s !== opt.id)
                          : [...selected, opt.id],
                      }));
                      if (error) setError(null);
                    }}
                  >
                    {opt.label}
                  </ChoiceButton>
                );
              })}
            </div>
          </BlockShell>
        );
      }
      case "yes_no": {
        return (
          <BlockShell step={stepNumber} title={current.title} description={current.description} error={error} optional={!current.required}>
            <div className="grid grid-cols-2 gap-2.5" role="group" aria-label={current.title}>
              {(["yes", "no"] as const).map((v) => (
                <ChoiceButton
                  key={v}
                  selected={draft === v}
                  accent={themed.accent}
                  onSelect={() => {
                    setDrafts((d) => ({ ...d, [current.id]: v }));
                    if (error) setError(null);
                  }}
                >
                  {v === "yes" ? "Yes" : "No"}
                </ChoiceButton>
              ))}
            </div>
          </BlockShell>
        );
      }
      case "rating": {
        const max = current.max ?? 5;
        const picked = typeof draft === "number" ? draft : null;
        return (
          <BlockShell step={stepNumber} title={current.title} description={current.description} error={error} optional={!current.required}>
            <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label={current.title}>
              {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={picked === n}
                  aria-label={`${n} out of ${max}`}
                  style={
                    picked === n
                      ? { backgroundColor: themed.accent, borderColor: themed.accent }
                      : undefined
                  }
                  onClick={() => {
                    setDrafts((d) => ({ ...d, [current.id]: n }));
                    if (error) setError(null);
                  }}
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-2xl border text-lg font-semibold transition-all sm:h-16 sm:w-16",
                    picked === n
                      ? "scale-105 border-brand-700 bg-brand-600 text-white shadow-lift"
                      : "border-ink/15 bg-white text-ink hover:border-brand-600/60 hover:bg-brand-50/50",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </BlockShell>
        );
      }
      case "opinion_scale": {
        const min = current.min ?? 0;
        const max = current.max ?? 10;
        const picked = typeof draft === "number" ? draft : null;
        return (
          <BlockShell
            step={stepNumber}
            title={current.title}
            description={current.description}
            error={error}
            optional={!current.required}
          >
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={current.title}>
              {current.minLabel && (
                <span className="mr-1 text-xs text-ink-faint">{current.minLabel}</span>
              )}
              {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={picked === n}
                  aria-label={`${n}`}
                  style={
                    picked === n
                      ? { backgroundColor: themed.accent, borderColor: themed.accent }
                      : undefined
                  }
                  onClick={() => {
                    setDrafts((d) => ({ ...d, [current.id]: n }));
                    if (error) setError(null);
                  }}
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-xl border text-base font-semibold transition-all sm:h-14 sm:w-14",
                    picked === n
                      ? "scale-105 border-brand-700 bg-brand-600 text-white shadow-lift"
                      : "border-ink/15 bg-white text-ink hover:border-brand-600/60 hover:bg-brand-50/50",
                  )}
                >
                  {n}
                </button>
              ))}
              {current.maxLabel && (
                <span className="ml-1 text-xs text-ink-faint">{current.maxLabel}</span>
              )}
            </div>
          </BlockShell>
        );
      }
      case "date": {
        return (
          <BlockShell
            step={stepNumber}
            title={current.title}
            description={current.description}
            error={error}
            hint="Press Enter ↵ to continue"
            optional={!current.required}
          >
            <input
              id={`field-${current.id}`}
              data-autofocus
              autoFocus
              type="date"
              value={typeof draft === "string" ? draft : ""}
              onChange={(e) => {
                setDrafts((d) => ({ ...d, [current.id]: e.target.value }));
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleNext();
                }
              }}
              className="w-full rounded-xl border border-ink/15 bg-white px-5 py-4 text-lg text-ink shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
          </BlockShell>
        );
      }
      case "file_upload": {
        const files: string[] = Array.isArray(draft) ? draft : [];
        return (
          <BlockShell
            step={stepNumber}
            title={current.title}
            description={current.description}
            error={error}
            hint={current.required ? undefined : "You can attach up to 10 files"}
            optional={!current.required}
          >
            <FileUploadInput
              slug={uploads?.slug ?? null}
              questionId={current.id}
              value={files}
              names={fileNames.current[current.id] ?? {}}
              maxMb={Math.min(current.maxSizeMb ?? 10, 100)}
              accept={current.allowedMimes?.join(",")}
              onChange={(ids, names) => {
                fileNames.current[current.id] = names;
                setDrafts((d) => ({ ...d, [current.id]: ids }));
                if (error) setError(null);
              }}
            />
          </BlockShell>
        );
      }
      default:
        return null;
    }
  }
}
