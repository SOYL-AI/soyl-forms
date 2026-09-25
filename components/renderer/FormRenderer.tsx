"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  OTHER_OPTION_ID,
  type Answers,
  type AnswerValue,
  type Block,
  type ChoiceOption,
  type FormSchemaV1,
  type FormSettings,
  type FormTheme,
} from "@/types/forms";
import { estimateProgress, getNextBlockId, isAnswerable } from "@/lib/forms/logic";
import { resolveTheme, themeCssVars, themeFontsHref } from "@/lib/forms/themes";
import {
  BlockShell,
  ChoiceButton,
  FileUploadInput,
  LegalCheck,
  MatrixGrid,
  OtherInput,
  RatingRow,
  ScaleButton,
  TextField,
  ThemeFontLink,
} from "./blocks";
import { cn } from "@/lib/utils";

type DraftValue = string | string[] | number | Record<string, string> | null;

interface PersistedState {
  versionKey: string;
  currentId: string;
  history: string[];
  drafts: Record<string, DraftValue>;
  others: Record<string, string>;
  answers: Answers;
}

function isEmpty(draft: DraftValue): boolean {
  if (draft === null || draft === "") return true;
  if (Array.isArray(draft)) return draft.length === 0;
  if (typeof draft === "object") return Object.keys(draft).length === 0;
  return false;
}

function toAnswer(block: Block, draft: DraftValue, other: string): AnswerValue | null {
  if (isEmpty(draft)) return null;
  switch (block.type) {
    case "short_text":
    case "long_text":
    case "email":
    case "phone":
    case "url":
    case "date":
    case "time":
      return typeof draft === "string" ? ({ type: block.type, value: draft } as AnswerValue) : null;
    case "number":
    case "rating":
    case "opinion_scale":
      return typeof draft === "number" ? ({ type: block.type, value: draft } as AnswerValue) : null;
    case "yes_no":
      return typeof draft === "string" ? { type: "yes_no", value: draft } : null;
    case "single_choice":
    case "dropdown":
      if (typeof draft !== "string") return null;
      return draft === OTHER_OPTION_ID
        ? { type: block.type, value: draft, otherText: other.trim() }
        : { type: block.type, value: draft };
    case "multiple_choice":
      if (!Array.isArray(draft)) return null;
      return draft.includes(OTHER_OPTION_ID)
        ? { type: "multiple_choice", value: draft, otherText: other.trim() }
        : { type: "multiple_choice", value: draft };
    case "matrix":
      return draft && typeof draft === "object" && !Array.isArray(draft)
        ? { type: "matrix", value: draft }
        : null;
    case "legal":
      return draft === "accepted" ? { type: "legal", value: "accepted" } : null;
    case "file_upload":
      return Array.isArray(draft) ? { type: "file_upload", value: draft } : null;
    default:
      return null;
  }
}

function validateBlock(block: Block, draft: DraftValue, other: string): string | null {
  if (block.type === "welcome" || block.type === "statement" || block.type === "thank_you") {
    return null;
  }
  const empty = isEmpty(draft);
  if (empty) {
    if (!block.required) return null;
    switch (block.type) {
      case "single_choice":
      case "multiple_choice":
      case "dropdown":
        return "Choose an option to continue.";
      case "yes_no":
        return "Pick Yes or No to continue.";
      case "rating":
      case "opinion_scale":
        return "Pick a value to continue.";
      case "matrix":
        return "Answer each row to continue.";
      case "legal":
        return "Please tick the box to continue.";
      case "file_upload":
        return "Attach a file to continue.";
      default:
        return "Your answer is needed to continue.";
    }
  }
  if (
    (block.type === "single_choice" || block.type === "dropdown") &&
    draft === OTHER_OPTION_ID &&
    !other.trim()
  ) {
    return "Tell us what “Other” is.";
  }
  if (block.type === "multiple_choice" && Array.isArray(draft)) {
    if (draft.includes(OTHER_OPTION_ID) && !other.trim()) return "Tell us what “Other” is.";
    if (block.minSelections && draft.length < block.minSelections) {
      return `Choose at least ${block.minSelections}.`;
    }
    if (block.maxSelections && draft.length > block.maxSelections) {
      return `Choose at most ${block.maxSelections}.`;
    }
  }
  if (block.type === "matrix" && draft && typeof draft === "object" && !Array.isArray(draft)) {
    if (block.required && Object.keys(draft).length < block.rows.length) {
      return "Answer every row to continue.";
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
    const min = block.validation?.minLength;
    if (min && draft.length < min) {
      return `Needs at least ${min} characters.`;
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

/** Deterministic per-session shuffle so Back/Next never re-orders options. */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const AUTO_ADVANCE_TYPES = new Set(["single_choice", "yes_no", "rating", "opinion_scale", "dropdown"]);

export function FormRenderer({
  schema,
  theme,
  settings,
  minimal,
  onComplete,
  onBeforeComplete,
  uploads,
  persistKey,
  preview,
  focusBlockId,
}: {
  schema: FormSchemaV1;
  /** Creator theme (background, text, accent, fonts, logo). */
  theme?: FormTheme;
  settings?: FormSettings;
  /** Trim hints/branding for `?embed=1`. Navigation always stays visible. */
  minimal?: boolean;
  onComplete?: (answers: Answers) => void;
  /**
   * Async gate run before the success screen: persist the answers, then
   * return ok. On failure the respondent stays on their answers with the
   * error shown — success is never displayed before persistence.
   */
  onBeforeComplete?: (answers: Answers) => Promise<{ ok: boolean; error?: string }>;
  /** Enables real uploads for file questions. Absent in previews/demos. */
  uploads?: { slug: string };
  /** sessionStorage key: answers survive a refresh on the public route. */
  persistKey?: string;
  /** Builder/marketing preview: no persistence, no redirects. */
  preview?: boolean;
  /** Builder: jump the preview to the block being edited. */
  focusBlockId?: string | null;
}) {
  const themed = useMemo(() => resolveTheme(theme), [theme]);
  const cssVars = useMemo(() => themeCssVars(themed), [themed]);
  const fontHref = useMemo(() => themeFontsHref(themed), [themed]);
  const order = useMemo(() => schema.blocks.map((b) => b.id), [schema]);
  const byId = useMemo(() => new Map(schema.blocks.map((b) => [b.id, b])), [schema]);

  const [currentId, setCurrentId] = useState<string>(order[0] ?? "");
  const [history, setHistory] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftValue>>({});
  const [others, setOthers] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Answers>({});
  const [error, setError] = useState<string | null>(null);
  const [stepKey, setStepKey] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [restored, setRestored] = useState(!persistKey);
  const submittedOnce = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shuffleSeed = useRef(Math.floor(Math.random() * 100000) + 1);
  /** Display names for uploaded files (ids live in drafts, survive remounts). */
  const fileNames = useRef<Record<string, Record<string, string>>>({});

  const current: Block | undefined = byId.get(currentId);
  const autoAdvance = settings?.autoAdvance ?? true;

  // Restore a half-finished session (same form version only).
  useEffect(() => {
    if (!persistKey) return;
    try {
      const raw = window.sessionStorage.getItem(persistKey);
      if (raw) {
        const saved = JSON.parse(raw) as PersistedState;
        if (saved.versionKey === persistKey && order.includes(saved.currentId)) {
          setCurrentId(saved.currentId);
          setHistory(saved.history.filter((id) => order.includes(id)));
          setDrafts(saved.drafts ?? {});
          setOthers(saved.others ?? {});
          setAnswers(saved.answers ?? {});
        }
      }
    } catch {
      /* storage unavailable — fine */
    }
    setRestored(true);
  }, [persistKey, order]);

  useEffect(() => {
    if (!persistKey || !restored || completed) return;
    try {
      const state: PersistedState = { versionKey: persistKey, currentId, history, drafts, others, answers };
      window.sessionStorage.setItem(persistKey, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [persistKey, restored, completed, currentId, history, drafts, others, answers]);

  // Live-preview safety: if the schema changes under us (builder edits),
  // fall back to the first block instead of stranding on a deleted step.
  useEffect(() => {
    if (!order.includes(currentId)) {
      setCurrentId(order[0] ?? "");
      setHistory([]);
      setError(null);
      setStepKey((k) => k + 1);
    }
  }, [order, currentId]);

  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  // Builder preview follows the selected block.
  useEffect(() => {
    if (!preview || !focusBlockId || !order.includes(focusBlockId)) return;
    setCurrentId(focusBlockId);
    setHistory([]);
    setCompleted(false);
    setError(null);
    setStepKey((k) => k + 1);
  }, [preview, focusBlockId, order]);

  const progress = useMemo(
    () => estimateProgress(schema, currentId, history),
    [schema, currentId, history],
  );

  const goTo = useCallback(
    (nextId: string | null, snapshot: Answers) => {
      if (nextId === null) {
        setCompleted(true);
        setAnswers(snapshot);
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
      const alreadySubmitted = current?.type === "thank_you" && submittedOnce.current;
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
          if (persistKey) {
            try {
              window.sessionStorage.removeItem(persistKey);
            } catch {
              /* ignore */
            }
          }
        } finally {
          setSubmitting(false);
        }
      }
      goTo(next, snapshot);
    },
    [byId, current, onBeforeComplete, goTo, persistKey],
  );

  const isLastAnswerable = useCallback(
    (snapshot: Answers): boolean => {
      if (!current || !isAnswerable(current.type)) return false;
      const next = getNextBlockId(schema, current.id, snapshot);
      return next === null || byId.get(next ?? "")?.type === "thank_you";
    },
    [current, schema, byId],
  );

  const advance = useCallback(
    (draftOverride?: DraftValue) => {
      if (!current || completed || submitting) return;
      if (advanceTimer.current) {
        clearTimeout(advanceTimer.current);
        advanceTimer.current = null;
      }
      if (current.type === "welcome" || current.type === "statement" || current.type === "thank_you") {
        if (current.type === "thank_you" && current.buttonUrl && !preview) {
          window.location.assign(current.buttonUrl);
          return;
        }
        const next = getNextBlockId(schema, current.id, answers);
        void finish(next, answers);
        return;
      }
      const draft: DraftValue = draftOverride !== undefined ? draftOverride : drafts[current.id] ?? null;
      const other = others[current.id] ?? "";
      const problem = validateBlock(current, draft, other);
      if (problem) {
        setError(problem);
        return;
      }
      const answer = toAnswer(current, draft, other);
      const snapshot: Answers = { ...answers };
      if (answer) snapshot[current.id] = answer;
      else delete snapshot[current.id];
      const next = getNextBlockId(schema, current.id, snapshot);
      void finish(next, snapshot);
    },
    [current, completed, submitting, schema, answers, drafts, others, finish, preview],
  );

  const handleBack = useCallback(() => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1] as string;
      setCurrentId(prev);
      setError(null);
      setStepKey((k) => k + 1);
      return h.slice(0, -1);
    });
  }, []);

  /** Set a draft and, for single-select types, advance after a short beat. */
  const pick = useCallback(
    (value: DraftValue, opts?: { noAdvance?: boolean }) => {
      if (!current) return;
      setDrafts((d) => ({ ...d, [current.id]: value }));
      setError(null);
      if (advanceTimer.current) {
        clearTimeout(advanceTimer.current);
        advanceTimer.current = null;
      }
      const wouldSubmit = isLastAnswerable({ ...answers });
      if (
        autoAdvance &&
        !opts?.noAdvance &&
        AUTO_ADVANCE_TYPES.has(current.type) &&
        value !== OTHER_OPTION_ID &&
        !wouldSubmit
      ) {
        advanceTimer.current = setTimeout(() => advance(value), 420);
      }
    },
    [current, autoAdvance, advance, isLastAnswerable, answers],
  );

  // Keyboard navigation: Enter advances (Shift+Enter = newline in long text),
  // number keys pick single-choice options, Y/N for yes-no, Escape never
  // destroys progress.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current || completed) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.tagName === "SELECT");
      if (e.key === "Escape") {
        e.preventDefault();
        return;
      }
      if (!typing && current.type === "single_choice" && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const opts = visibleOptions(current);
        const opt = opts[idx];
        if (opt) pick(opt.id);
        return;
      }
      if (!typing && current.type === "yes_no" && (e.key === "y" || e.key === "n")) {
        pick(e.key === "y" ? "yes" : "no");
        return;
      }
      if (e.key === "Enter" && !typing) {
        if (target && (target.tagName === "BUTTON" || target.tagName === "A")) return;
        e.preventDefault();
        advance();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, completed, advance, pick]);

  // Completion side-effects: callback, optional redirect.
  useEffect(() => {
    if (!completed) return;
    onComplete?.(answers);
    if (settings?.redirectUrl && !preview) {
      const t = setTimeout(() => window.location.assign(settings.redirectUrl as string), 1400);
      return () => clearTimeout(t);
    }
  }, [completed, answers, onComplete, settings?.redirectUrl, preview]);

  function visibleOptions(block: Block & { options: ChoiceOption[]; shuffle?: boolean }): ChoiceOption[] {
    return block.shuffle ? shuffled(block.options, shuffleSeed.current + block.id.length) : block.options;
  }

  if (!current) {
    return (
      <div className="renderer-themed rounded-2xl p-6" style={cssVars}>
        <p className="f-muted">This form has no questions yet.</p>
      </div>
    );
  }

  const showProgress =
    (settings?.showProgress ?? true) && current.type !== "welcome" && current.type !== "thank_you";
  const isFirst = history.length === 0;
  const draft: DraftValue = drafts[current.id] ?? null;
  const other = others[current.id] ?? "";
  const stepNumber = isAnswerable(current.type) ? progress.done + 1 : undefined;
  const lastStep = isLastAnswerable(answers);
  const nextLabel = settings?.buttonLabelNext || "Next";
  const submitLabel = settings?.buttonLabelSubmit || "Submit";

  return (
    <div className="renderer-themed w-full" style={cssVars} data-dark={themed.dark}>
      <ThemeFontLink href={fontHref} />
      {/* Screen-reader announcements for question changes. */}
      <div aria-live="polite" className="sr-only">
        {current.title}
      </div>

      {themed.logoUrl ? (
        <div className={cn("mb-8 flex", themed.logoPlacement === "top-center" ? "justify-center" : "justify-start")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={themed.logoUrl} alt="" className="f-logo" />
        </div>
      ) : null}

      {showProgress && (
        <div className="mb-10 flex items-center gap-3">
          <div
            className="f-progress-track h-1 flex-1 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={Math.round((progress.done / progress.total) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Form progress"
          >
            <div
              className="f-progress-fill progress-animated h-full rounded-full"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
          <span className="f-faint text-xs tabular-nums">
            {Math.min(progress.done + 1, progress.total)} / {progress.total}
          </span>
        </div>
      )}

      <div key={stepKey} className="step-animated">
        {completed && current.type !== "thank_you" ? (
          <BlockShell
            large
            title="Thanks — your response was saved."
            description={settings?.redirectUrl && !preview ? "Taking you onward…" : "You can close this page now."}
          >
            <SuccessMark />
          </BlockShell>
        ) : (
          renderStep()
        )}
      </div>

      {!completed && (
        <div
          className="sticky bottom-0 mt-10 flex items-center gap-3 pb-2 pt-6"
          style={{
            background: `linear-gradient(to top, var(--f-bg), var(--f-bg) 55%, transparent)`,
          }}
        >
          {!isFirst && current.type !== "thank_you" && (
            <button
              type="button"
              onClick={handleBack}
              disabled={submitting}
              className="f-btn-secondary px-5 py-3 text-sm disabled:opacity-50"
            >
              ← Back
            </button>
          )}
          <button
            type="button"
            onClick={() => advance()}
            disabled={submitting}
            className="f-btn-primary flex-1 px-5 py-3 text-sm sm:flex-none sm:px-8 disabled:opacity-70"
          >
            {submitting
              ? "Submitting…"
              : current.type === "welcome"
                ? current.buttonLabel || "Start"
                : current.type === "statement"
                  ? current.buttonLabel || "Continue"
                  : current.type === "thank_you"
                    ? current.buttonLabel || "Done"
                    : lastStep
                      ? `${submitLabel} →`
                      : `${nextLabel} →`}
          </button>
          {!minimal && current.type !== "thank_you" && (
            <span className="f-faint hidden text-xs sm:inline">
              press <kbd className="f-kbd">Enter ↵</kbd>
            </span>
          )}
        </div>
      )}
    </div>
  );

  function renderStep() {
    if (!current) return null;
    const common = {
      step: stepNumber,
      title: current.title,
      description: current.description,
      error,
      optional: isAnswerable(current.type) && !current.required,
      imageUrl: current.imageUrl,
      imageAlt: current.imageAlt,
    };
    switch (current.type) {
      case "welcome":
        return (
          <BlockShell large title={current.title} description={current.description} imageUrl={current.imageUrl} imageAlt={current.imageAlt}>
            {!minimal && (
              <p className="f-faint text-sm">
                Takes {Math.max(1, Math.round(progress.total * 0.3))} min · press{" "}
                <kbd className="f-kbd">Enter ↵</kbd> to begin
              </p>
            )}
          </BlockShell>
        );
      case "thank_you":
        return (
          <BlockShell large title={current.title} description={current.description} imageUrl={current.imageUrl} imageAlt={current.imageAlt}>
            <SuccessMark />
          </BlockShell>
        );
      case "statement":
        return <BlockShell title={current.title} description={current.description} imageUrl={current.imageUrl} imageAlt={current.imageAlt} />;
      case "short_text":
      case "email":
      case "phone":
      case "url":
        return (
          <BlockShell {...common} hint={minimal ? undefined : "Press Enter ↵ to continue"}>
            <TextField
              id={`field-${current.id}`}
              value={typeof draft === "string" ? draft : ""}
              placeholder={current.placeholder}
              type={current.type === "email" ? "email" : current.type === "phone" ? "tel" : current.type === "url" ? "url" : "text"}
              inputMode={current.type === "email" ? "email" : current.type === "phone" ? "tel" : current.type === "url" ? "url" : "text"}
              autoComplete={current.type === "email" ? "email" : current.type === "phone" ? "tel" : current.type === "url" ? "url" : undefined}
              onChange={(v) => pick(v, { noAdvance: true })}
              onEnter={() => advance()}
            />
          </BlockShell>
        );
      case "long_text":
        return (
          <BlockShell {...common} hint={minimal ? undefined : "Shift + Enter for a new line · Enter to continue"}>
            <TextField
              id={`field-${current.id}`}
              multiline
              value={typeof draft === "string" ? draft : ""}
              placeholder={current.placeholder}
              onChange={(v) => pick(v, { noAdvance: true })}
              onEnter={() => advance()}
            />
          </BlockShell>
        );
      case "number": {
        const raw = typeof draft === "number" ? String(draft) : "";
        return (
          <BlockShell {...common} hint={minimal ? undefined : "Press Enter ↵ to continue"}>
            <input
              id={`field-${current.id}`}
              data-autofocus
              autoFocus
              type="number"
              inputMode="decimal"
              value={raw}
              placeholder={current.placeholder}
              onChange={(e) => pick(e.target.value === "" ? null : Number(e.target.value), { noAdvance: true })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  advance();
                }
              }}
              className="f-input"
            />
          </BlockShell>
        );
      }
      case "single_choice": {
        const opts = visibleOptions(current);
        return (
          <BlockShell {...common} hint={minimal ? undefined : "Press 1–9 to pick"}>
            <div role="listbox" aria-label={current.title} className="flex flex-col gap-2.5">
              {opts.map((opt, i) => (
                <ChoiceButton
                  key={opt.id}
                  selected={draft === opt.id}
                  kbd={i < 9 ? String(i + 1) : undefined}
                  onSelect={() => pick(opt.id)}
                >
                  {opt.label}
                </ChoiceButton>
              ))}
              {current.allowOther && (
                <div>
                  <ChoiceButton selected={draft === OTHER_OPTION_ID} onSelect={() => pick(OTHER_OPTION_ID)}>
                    Other
                  </ChoiceButton>
                  {draft === OTHER_OPTION_ID && (
                    <OtherInput
                      value={other}
                      onChange={(v) => setOthers((o) => ({ ...o, [current.id]: v }))}
                      onEnter={() => advance()}
                    />
                  )}
                </div>
              )}
            </div>
          </BlockShell>
        );
      }
      case "dropdown": {
        const opts = visibleOptions(current);
        return (
          <BlockShell {...common}>
            <select
              id={`field-${current.id}`}
              data-autofocus
              autoFocus
              value={typeof draft === "string" ? draft : ""}
              onChange={(e) => pick(e.target.value || null)}
              className="f-input"
            >
              <option value="">Select an option…</option>
              {opts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
              {current.allowOther && <option value={OTHER_OPTION_ID}>Other</option>}
            </select>
            {draft === OTHER_OPTION_ID && (
              <OtherInput
                value={other}
                onChange={(v) => setOthers((o) => ({ ...o, [current.id]: v }))}
                onEnter={() => advance()}
              />
            )}
          </BlockShell>
        );
      }
      case "multiple_choice": {
        const selected: string[] = Array.isArray(draft) ? draft : [];
        const opts = visibleOptions(current);
        const toggle = (id: string) =>
          pick(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id], { noAdvance: true });
        return (
          <BlockShell
            {...common}
            hint={
              minimal
                ? undefined
                : current.maxSelections
                  ? `Choose up to ${current.maxSelections}`
                  : "Tap all that apply"
            }
          >
            <div className="flex flex-col gap-2.5" role="group" aria-label={current.title}>
              {opts.map((opt) => (
                <ChoiceButton key={opt.id} multi selected={selected.includes(opt.id)} onSelect={() => toggle(opt.id)}>
                  {opt.label}
                </ChoiceButton>
              ))}
              {current.allowOther && (
                <div>
                  <ChoiceButton multi selected={selected.includes(OTHER_OPTION_ID)} onSelect={() => toggle(OTHER_OPTION_ID)}>
                    Other
                  </ChoiceButton>
                  {selected.includes(OTHER_OPTION_ID) && (
                    <OtherInput
                      value={other}
                      onChange={(v) => setOthers((o) => ({ ...o, [current.id]: v }))}
                      onEnter={() => advance()}
                    />
                  )}
                </div>
              )}
            </div>
          </BlockShell>
        );
      }
      case "yes_no":
        return (
          <BlockShell {...common} hint={minimal ? undefined : "Press Y or N"}>
            <div className="grid grid-cols-2 gap-2.5" role="group" aria-label={current.title}>
              {(["yes", "no"] as const).map((v) => (
                <ChoiceButton key={v} selected={draft === v} kbd={v === "yes" ? "Y" : "N"} onSelect={() => pick(v)}>
                  {v === "yes" ? "Yes" : "No"}
                </ChoiceButton>
              ))}
            </div>
          </BlockShell>
        );
      case "rating":
        return (
          <BlockShell {...common}>
            <RatingRow
              max={current.max ?? 5}
              icon={current.icon ?? "number"}
              value={typeof draft === "number" ? draft : null}
              onChange={(n) => pick(n)}
            />
          </BlockShell>
        );
      case "opinion_scale": {
        const min = current.min ?? 0;
        const max = current.max ?? 10;
        const picked = typeof draft === "number" ? draft : null;
        return (
          <BlockShell {...common}>
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={current.title}>
              {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
                <ScaleButton key={n} value={n} size="sm" selected={picked === n} onSelect={() => pick(n)} label={`${n}`} />
              ))}
            </div>
            {(current.minLabel || current.maxLabel) && (
              <div className="f-faint mt-3 flex justify-between text-xs">
                <span>{current.minLabel}</span>
                <span>{current.maxLabel}</span>
              </div>
            )}
          </BlockShell>
        );
      }
      case "matrix": {
        const grid = draft && typeof draft === "object" && !Array.isArray(draft) ? draft : {};
        return (
          <BlockShell {...common}>
            <MatrixGrid rows={current.rows} columns={current.columns} value={grid} onChange={(v) => pick(v, { noAdvance: true })} />
          </BlockShell>
        );
      }
      case "legal":
        return (
          <BlockShell {...common}>
            <LegalCheck
              checked={draft === "accepted"}
              onChange={(on) => pick(on ? "accepted" : null, { noAdvance: true })}
              label={current.acceptLabel || "I agree"}
              linkUrl={current.linkUrl}
              linkLabel={current.linkLabel}
            />
          </BlockShell>
        );
      case "date":
      case "time":
        return (
          <BlockShell {...common} hint={minimal ? undefined : "Press Enter ↵ to continue"}>
            <input
              id={`field-${current.id}`}
              data-autofocus
              autoFocus
              type={current.type}
              value={typeof draft === "string" ? draft : ""}
              onChange={(e) => pick(e.target.value, { noAdvance: true })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  advance();
                }
              }}
              className="f-input"
            />
          </BlockShell>
        );
      case "file_upload": {
        const files: string[] = Array.isArray(draft) ? draft : [];
        return (
          <BlockShell {...common} hint={current.required || minimal ? undefined : "You can attach up to 10 files"}>
            <FileUploadInput
              slug={uploads?.slug ?? null}
              questionId={current.id}
              value={files}
              names={fileNames.current[current.id] ?? {}}
              maxMb={Math.min(current.maxSizeMb ?? 10, 100)}
              accept={current.allowedMimes?.join(",")}
              onChange={(ids, names) => {
                fileNames.current[current.id] = names;
                pick(ids, { noAdvance: true });
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

function SuccessMark() {
  return (
    <div
      aria-hidden
      className="flex h-14 w-14 items-center justify-center rounded-full text-2xl"
      style={{ background: "var(--f-accent)", color: "var(--f-accent-ink)" }}
    >
      ✓
    </div>
  );
}
