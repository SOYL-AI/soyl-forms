"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Heart, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChoiceOption } from "@/types/forms";

export function BlockShell({
  title,
  description,
  error,
  children,
  hint,
  optional,
  step,
  large,
  imageUrl,
  imageAlt,
  center,
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
  imageUrl?: string;
  imageAlt?: string;
  center?: boolean;
}) {
  const hintText =
    optional && !error
      ? hint
        ? `${hint} · Optional`
        : "Optional — you can skip this"
      : hint;
  return (
    <div className={cn("w-full", center && "text-center")}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={imageAlt ?? ""}
          className={cn("f-media mb-6", center && "mx-auto")}
          loading="lazy"
        />
      ) : null}
      <h1
        className={cn(
          "tracking-tight",
          large
            ? "text-[2.25rem] leading-[1.08] sm:text-[3rem]"
            : "text-[1.75rem] leading-[1.15] sm:text-[2.125rem]",
        )}
      >
        {step !== undefined && (
          <span
            aria-hidden
            className="f-faint mr-2.5 inline-flex items-baseline gap-1 align-baseline text-[0.55em] font-semibold"
            style={{ fontFamily: "var(--f-font-body)" }}
          >
            {step}
            <span style={{ color: "var(--f-accent)" }}>→</span>
          </span>
        )}
        {title}
      </h1>
      {description ? (
        <p className="f-muted mt-3 whitespace-pre-line text-base leading-relaxed sm:text-lg">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-7">{children}</div> : null}
      {error ? (
        <p role="alert" aria-live="assertive" className="f-error mt-3 text-sm font-medium">
          {error}
        </p>
      ) : null}
      {hintText && !error ? (
        <p className="f-faint mt-3 text-sm">{hintText}</p>
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
  type = "text",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  placeholder?: string;
  multiline?: boolean;
  inputMode?: "text" | "email" | "tel" | "url" | "numeric" | "decimal";
  autoComplete?: string;
  type?: string;
}) {
  if (multiline) {
    return (
      <textarea
        id={id}
        data-autofocus
        autoFocus
        rows={4}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onEnter();
          }
        }}
        className="f-input resize-y"
      />
    );
  }
  return (
    <input
      id={id}
      data-autofocus
      autoFocus
      type={type}
      value={value}
      placeholder={placeholder}
      inputMode={inputMode}
      autoComplete={autoComplete}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter();
        }
      }}
      className="f-input"
    />
  );
}

export function ChoiceButton({
  selected,
  onSelect,
  children,
  kbd,
  multi,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
  kbd?: string;
  /** Checkbox visual for multiple choice. */
  multi?: boolean;
}) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "option"}
      aria-checked={multi ? selected : undefined}
      aria-selected={multi ? undefined : selected}
      onClick={onSelect}
      className="f-choice"
    >
      <span aria-hidden className="f-key">
        {selected ? "✓" : kbd ?? ""}
      </span>
      <span className="flex-1">{children}</span>
    </button>
  );
}

/** Inline free-text for the "Other" option. */
export function OtherInput({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
}) {
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter();
        }
      }}
      maxLength={200}
      placeholder="Please specify…"
      aria-label="Other — please specify"
      className="f-input mt-2.5 !py-3 !text-base"
    />
  );
}

export function ScaleButton({
  value,
  selected,
  onSelect,
  label,
  size = "md",
  children,
}: {
  value: number;
  selected: boolean;
  onSelect: () => void;
  label: string;
  size?: "sm" | "md";
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onSelect}
      className={cn(
        "f-scale",
        size === "md" ? "h-14 w-14 text-lg sm:h-16 sm:w-16" : "h-12 w-12 text-base sm:h-14 sm:w-14",
      )}
    >
      {children ?? value}
    </button>
  );
}

export function RatingRow({
  max,
  icon,
  value,
  onChange,
}: {
  max: number;
  icon: "number" | "star" | "heart";
  value: number | null;
  onChange: (n: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (icon === "number") {
    return (
      <div className="flex flex-wrap gap-2.5" role="radiogroup">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <ScaleButton
            key={n}
            value={n}
            selected={value === n}
            onSelect={() => onChange(n)}
            label={`${n} out of ${max}`}
          />
        ))}
      </div>
    );
  }
  const Icon = icon === "star" ? Star : Heart;
  const active = hover ?? value ?? 0;
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" onMouseLeave={() => setHover(null)}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} out of ${max}`}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(null)}
          onClick={() => onChange(n)}
          className="rounded-lg p-1 transition-transform hover:scale-110 active:scale-95"
        >
          <Icon
            className={cn("h-9 w-9 sm:h-11 sm:w-11")}
            strokeWidth={1.5}
            style={{
              color: n <= active ? "var(--f-accent)" : "var(--f-border-strong)",
              fill: n <= active ? "var(--f-accent)" : "transparent",
              transition: "color 120ms ease, fill 120ms ease",
            }}
          />
        </button>
      ))}
    </div>
  );
}

/** Grid question: table on wide screens, stacked rows on phones. */
export function MatrixGrid({
  rows,
  columns,
  value,
  onChange,
  multiple,
}: {
  rows: ChoiceOption[];
  columns: ChoiceOption[];
  value: Record<string, string | string[]>;
  onChange: (next: Record<string, string | string[]>) => void;
  /** Checkbox grid: several columns per row. */
  multiple?: boolean;
}) {
  const isOn = (rowId: string, colId: string) => {
    const pick = value[rowId];
    return Array.isArray(pick) ? pick.includes(colId) : pick === colId;
  };
  const toggle = (rowId: string, colId: string) => {
    if (!multiple) {
      onChange({ ...value, [rowId]: colId });
      return;
    }
    const cur = Array.isArray(value[rowId]) ? (value[rowId] as string[]) : [];
    const next = cur.includes(colId) ? cur.filter((c) => c !== colId) : [...cur, colId];
    const out = { ...value };
    if (next.length) out[rowId] = next;
    else delete out[rowId];
    onChange(out);
  };
  const role = multiple ? "checkbox" : "radio";
  return (
    <>
      <div className="hidden sm:block">
        <table className="f-matrix w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className="pb-3 pr-3" />
              {columns.map((c) => (
                <th key={c.id} scope="col" className="f-muted pb-3 text-center text-xs font-semibold">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} role={multiple ? "group" : "radiogroup"} aria-label={r.label}>
                <th scope="row" className="py-3 pr-3 text-left text-[15px] font-medium">
                  {r.label}
                </th>
                {columns.map((c) => {
                  const on = isOn(r.id, c.id);
                  return (
                    <td key={c.id} className="py-3 text-center">
                      <button
                        type="button"
                        role={role}
                        aria-checked={on}
                        aria-label={`${r.label}: ${c.label}`}
                        onClick={() => toggle(r.id, c.id)}
                        data-checked={on}
                        className={multiple ? "f-check" : "f-radio"}
                      >
                        {multiple && on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-5 sm:hidden">
        {rows.map((r) => (
          <div key={r.id} role={multiple ? "group" : "radiogroup"} aria-label={r.label}>
            <p className="mb-2 text-[15px] font-medium">{r.label}</p>
            <div className="flex flex-wrap gap-2">
              {columns.map((c) => {
                const on = isOn(r.id, c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    role={role}
                    aria-checked={on}
                    onClick={() => toggle(r.id, c.id)}
                    className="f-choice !min-h-0 !w-auto !px-3.5 !py-2 !text-sm"
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function LegalCheck({
  checked,
  onChange,
  label,
  linkUrl,
  linkLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  linkUrl?: string;
  linkLabel?: string;
}) {
  return (
    <div>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="f-choice"
      >
        <span aria-hidden className="f-check" data-checked={checked}>
          {checked ? "✓" : ""}
        </span>
        <span className="flex-1">{label}</span>
      </button>
      {linkUrl ? (
        <p className="f-muted mt-3 text-sm">
          <a href={linkUrl} target="_blank" rel="noreferrer noopener" className="f-link">
            {linkLabel || "Read the full terms"} ↗
          </a>
        </p>
      ) : null}
    </div>
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
      <p className="f-muted rounded-[var(--f-radius)] border border-dashed px-5 py-4 text-sm" style={{ borderColor: "var(--f-border-strong)" }}>
        File uploads work on the published form — answers stay safe until then.
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
      <label
        className="f-choice cursor-pointer justify-center !border-dashed !py-6 text-center text-sm font-medium"
        style={{ borderColor: "var(--f-border-strong)" }}
      >
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
        <p role="alert" className="f-error mt-2 text-sm font-medium">{problem}</p>
      )}
      {value.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {value.map((id) => (
            <li
              key={id}
              className="flex items-center justify-between gap-2 rounded-[calc(var(--f-radius)*0.7)] px-3 py-2 text-sm"
              style={{ background: "var(--f-surface-strong)" }}
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
                className="f-muted shrink-0 rounded px-1.5"
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

/** Loads the theme's Google Fonts stylesheet once per href. */
export function ThemeFontLink({ href }: { href: string | null }) {
  useEffect(() => {
    if (!href) return;
    if (document.querySelector(`link[data-theme-font="${href}"]`)) return;
    const pre = document.createElement("link");
    pre.rel = "preconnect";
    pre.href = "https://fonts.gstatic.com";
    pre.crossOrigin = "anonymous";
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.themeFont = href;
    document.head.append(pre, link);
  }, [href]);
  return null;
}

/** Picture choice: image cards in a responsive grid. */
export function PictureChoice({
  options,
  selected,
  onToggle,
  multi,
}: {
  options: ChoiceOption[];
  selected: string[];
  onToggle: (id: string) => void;
  multi?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role={multi ? "group" : "listbox"}>
      {options.map((opt, i) => {
        const on = selected.includes(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            role={multi ? "checkbox" : "option"}
            aria-checked={multi ? on : undefined}
            aria-selected={multi ? undefined : on}
            onClick={() => onToggle(opt.id)}
            className="f-choice !flex-col !items-stretch !gap-0 !p-2 text-left"
          >
            <span className="relative block aspect-[4/3] overflow-hidden rounded-[calc(var(--f-radius)*0.7)]" style={{ background: "var(--f-surface-strong)" }}>
              {opt.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={opt.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : null}
              <span aria-hidden className="f-key absolute left-2 top-2" style={{ background: on ? undefined : "var(--f-bg)" }}>
                {on ? "✓" : i < 9 ? String(i + 1) : ""}
              </span>
            </span>
            <span className="px-1.5 pb-1 pt-2.5 text-[15px] leading-snug">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Ranking: move options up or down; the list order is the answer. */
export function RankingList({
  options,
  order,
  onChange,
}: {
  options: ChoiceOption[];
  order: string[];
  onChange: (next: string[]) => void;
}) {
  const byId = new Map(options.map((o) => [o.id, o]));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j] as string, next[i] as string];
    onChange(next);
  };
  return (
    <ol className="flex flex-col gap-2.5" aria-label="Your ranking, top first">
      {order.map((id, i) => (
        <li key={id} className="f-choice !cursor-default !py-2.5">
          <span aria-hidden className="f-key">{i + 1}</span>
          <span className="flex-1">{byId.get(id)?.label ?? id}</span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label={`Move ${byId.get(id)?.label ?? "option"} up`}
              className="f-btn-secondary flex h-9 w-9 items-center justify-center disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === order.length - 1}
              aria-label={`Move ${byId.get(id)?.label ?? "option"} down`}
              className="f-btn-secondary flex h-9 w-9 items-center justify-center disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </span>
        </li>
      ))}
    </ol>
  );
}
