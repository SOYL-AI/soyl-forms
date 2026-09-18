"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BlockShell({
  title,
  description,
  error,
  children,
  hint,
  optional,
  step,
  large,
}: {
  title: string;
  description?: string;
  error?: string | null;
  hint?: string | null;
  /** Answerable but not required: show a visible "optional, can skip" note. */
  optional?: boolean;
  children?: ReactNode;
  /** 1-based answerable-question number: renders the "1 →" prefix. */
  step?: number;
  /** Larger display title for welcome / thank-you screens. */
  large?: boolean;
}) {
  const hintText =
    optional && !error
      ? hint
        ? `${hint} · Optional — you can skip this`
        : "Optional — you can skip this"
      : hint;
  return (
    <div className="w-full">
      <h1
        className={
          large
            ? "font-display text-4xl leading-[1.1] tracking-tight text-ink sm:text-5xl"
            : "font-display text-3xl leading-tight text-ink sm:text-4xl"
        }
      >
        {step !== undefined && (
          <span
            aria-hidden
            className="mr-2 font-sans text-xl font-semibold text-ink-faint sm:text-2xl"
          >
            {step} <span className="text-brand-600">→</span>
          </span>
        )}
        {title}
      </h1>
      {description ? (
        <p className="mt-3 text-base leading-relaxed text-ink-soft sm:text-lg">
          {description}
        </p>
      ) : null}
      <div className="mt-7">{children}</div>
      {error ? (
        <p role="alert" aria-live="assertive" className="mt-3 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
      {hintText && !error ? (
        <p className="mt-3 text-sm text-ink-faint">{hintText}</p>
      ) : null}
    </div>
  );
}

export function TextField({
  id,
  value,
  onChange,
  onEnter,
  placeholder,
  multiline,
  inputMode,
  autoComplete,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  placeholder?: string;
  multiline?: boolean;
  inputMode?: "text" | "email" | "tel" | "url" | "numeric" | "decimal";
  autoComplete?: string;
  describedBy?: string;
}) {
  const cls =
    "w-full rounded-xl border border-ink/15 bg-white px-5 py-4 text-lg text-ink shadow-sm placeholder:text-ink-faint focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20";
  if (multiline) {
    return (
      <textarea
        id={id}
        data-autofocus
        autoFocus
        rows={4}
        value={value}
        placeholder={placeholder}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onEnter();
          }
        }}
        className={cn(cls, "resize-y leading-relaxed")}
      />
    );
  }
  return (
    <input
      id={id}
      data-autofocus
      autoFocus
      type="text"
      value={value}
      placeholder={placeholder}
      inputMode={inputMode}
      autoComplete={autoComplete}
      aria-describedby={describedBy}
      onChange={(e) => onChange(e.target.value)}
      className={cls}
    />
  );
}

export function FileUploadInput({
  slug,
  questionId,
  value,
  names,
  maxMb,
  accept,
  onChange,
}: {
  slug: string | null;
  questionId: string;
  value: string[];
  names: Record<string, string>;
  maxMb: number;
  accept?: string;
  onChange: (ids: string[], names: Record<string, string>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!slug) {
    return (
      <p className="rounded-xl border border-dashed border-ink/20 bg-white/60 px-5 py-4 text-sm text-ink-soft">
        File uploads work on published forms — answers stay safe until then.
      </p>
    );
  }

  async function pick(files: FileList | null) {
    if (!files || files.length === 0 || busy) return;
    setBusy(true);
    setProblem(null);
    const next = [...value];
    const nextNames = { ...names };
    for (const f of Array.from(files).slice(0, Math.max(0, 10 - value.length))) {
      try {
        const authRes = await fetch(`/api/public/forms/${slug}/uploads`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            questionId,
            fileName: f.name,
            mimeType: f.type || "application/octet-stream",
            sizeBytes: f.size,
          }),
        });
        const auth = (await authRes.json().catch(() => null)) as {
          fileId?: string;
          uploadUrl?: string;
          error?: string;
        } | null;
        if (!authRes.ok || !auth?.fileId || !auth?.uploadUrl) {
          throw new Error(auth?.error ?? "Upload refused.");
        }
        const put = await fetch(auth.uploadUrl, {
          method: "PUT",
          headers: { "content-type": f.type || "application/octet-stream" },
          body: f,
        });
        if (!put.ok) throw new Error("Upload failed — try again.");
        next.push(auth.fileId);
        nextNames[auth.fileId] = f.name;
      } catch (e) {
        setProblem(e instanceof Error ? e.message : "Upload failed.");
        break;
      }
    }
    onChange(next, nextNames);
    setBusy(false);
  }

  return (
    <div>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-ink/25 bg-white px-5 py-6 text-center text-sm font-medium transition-colors hover:border-brand-600/60">
        <input
          type="file"
          className="sr-only"
          accept={accept}
          multiple
          disabled={busy}
          onChange={(e) => {
            void pick(e.target.files);
            e.target.value = "";
          }}
        />
        {busy ? "Uploading…" : `Choose file(s) — up to ${maxMb} MB each`}
      </label>
      {problem && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">{problem}</p>
      )}
      {value.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {value.map((id) => (
            <li
              key={id}
              className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm shadow-sm"
            >
              <span className="truncate">{names[id] ?? "Attached file"}</span>
              <button
                type="button"
                aria-label={`Remove ${names[id] ?? "file"}`}
                onClick={() => {
                  const nextNames = { ...names };
                  delete nextNames[id];
                  onChange(
                    value.filter((v) => v !== id),
                    nextNames,
                  );
                }}
                className="shrink-0 rounded px-1.5 text-ink-faint hover:bg-ink/5"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ChoiceButton({
  selected,
  onSelect,
  children,
  kbd,
  accent,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
  kbd?: string;
  /** Creator theme accent; applied to the selected state when set. */
  accent?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      style={
        selected && accent
          ? { borderColor: accent, backgroundColor: `${accent}14` }
          : undefined
      }
      className={cn(
        "flex min-h-[3.25rem] w-full items-center gap-3 rounded-xl border px-5 py-3 text-left text-base transition-colors sm:text-lg",
        selected
          ? "border-brand-700 bg-brand-50 font-medium"
          : "border-ink/15 bg-white hover:border-brand-600/60 hover:bg-brand-50/50",
      )}
    >
      <span
        aria-hidden
        style={
          selected && accent
            ? { borderColor: accent, backgroundColor: accent, color: "#fff" }
            : undefined
        }
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-semibold",
          selected
            ? "border-brand-700 bg-brand-600 text-white"
            : "border-ink/25 text-ink-faint",
        )}
      >
        {selected ? "✓" : kbd ?? ""}
      </span>
      <span className="flex-1">{children}</span>
    </button>
  );
}
