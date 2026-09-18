"use client";

import { useState, type ReactNode } from "react";
import type { Block } from "@/types/forms";
import { BLOCK_TYPE_LABELS } from "@/lib/forms/builder";
import { isAnswerable } from "@/lib/forms/logic";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20";

export function SettingsPanel({
  block,
  blocks,
  jumpTarget,
  onPatch,
  onJumpChange,
  onDuplicate,
  onDelete,
}: {
  block: Block | undefined;
  blocks: Block[];
  /** Currently configured unconditional jump target, or null for default order. */
  jumpTarget: string | null;
  onPatch: (patch: Record<string, unknown>) => void;
  onJumpChange: (targetId: string | null) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!block) {
    return (
      <p className="text-sm text-ink-soft">
        Select a question on the left to edit its settings, or add a new block
        below the outline.
      </p>
    );
  }

  const answerable = isAnswerable(block.type);

  return (
    <div className="flex flex-col gap-4" key={block.id}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
          {BLOCK_TYPE_LABELS[block.type]}
        </p>
      </div>

      <Field label="Title">
        <input
          value={block.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          maxLength={500}
          className={inputCls}
        />
      </Field>

      {"description" in block && (
        <Field label="Description (optional)">
          <textarea
            value={block.description ?? ""}
            onChange={(e) => onPatch({ description: e.target.value })}
            rows={2}
            maxLength={2000}
            className={inputCls}
          />
        </Field>
      )}

      {answerable && (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={block.required ?? false}
            onChange={(e) => onPatch({ required: e.target.checked })}
            className="h-4 w-4 accent-emerald-700"
          />
          Required
        </label>
      )}

      {(block.type === "short_text" ||
        block.type === "long_text" ||
        block.type === "email" ||
        block.type === "phone" ||
        block.type === "url" ||
        block.type === "number") && (
        <Field label="Placeholder (optional)">
          <input
            value={block.placeholder ?? ""}
            onChange={(e) => onPatch({ placeholder: e.target.value })}
            maxLength={200}
            className={inputCls}
          />
        </Field>
      )}

      {(block.type === "short_text" || block.type === "long_text") && (
        <Field label="Maximum length">
          <input
            type="number"
            min={1}
            max={10000}
            value={block.validation?.maxLength ?? ""}
            placeholder="No limit"
            onChange={(e) =>
              onPatch({
                validation: {
                  ...block.validation,
                  maxLength: e.target.value === "" ? undefined : Number(e.target.value),
                },
              })
            }
            className={inputCls}
          />
        </Field>
      )}

      {block.type === "number" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min (optional)">
            <input
              type="number"
              value={block.validation?.min ?? ""}
              placeholder="—"
              onChange={(e) =>
                onPatch({
                  validation: {
                    ...block.validation,
                    min: e.target.value === "" ? undefined : Number(e.target.value),
                  },
                })
              }
              className={inputCls}
            />
          </Field>
          <Field label="Max (optional)">
            <input
              type="number"
              value={block.validation?.max ?? ""}
              placeholder="—"
              onChange={(e) =>
                onPatch({
                  validation: {
                    ...block.validation,
                    max: e.target.value === "" ? undefined : Number(e.target.value),
                  },
                })
              }
              className={inputCls}
            />
          </Field>
        </div>
      )}

      {(block.type === "single_choice" ||
        block.type === "multiple_choice" ||
        block.type === "dropdown") && (
        <div>
          <span className="mb-1 block text-xs font-semibold text-ink-soft">
            Options (min 2 to publish)
          </span>
          <ul className="flex flex-col gap-1.5">
            {block.options.map((opt, i) => (
              <li key={opt.id} className="flex items-center gap-1.5">
                <input
                  value={opt.label}
                  aria-label={`Option ${i + 1}`}
                  onChange={(e) =>
                    onPatch({
                      options: block.options.map((o) =>
                        o.id === opt.id ? { ...o, label: e.target.value } : o,
                      ),
                    })
                  }
                  maxLength={200}
                  className={inputCls}
                />
                <button
                  type="button"
                  aria-label={`Remove ${opt.label || `option ${i + 1}`}`}
                  disabled={block.options.length <= 1}
                  onClick={() =>
                    onPatch({ options: block.options.filter((o) => o.id !== opt.id) })
                  }
                  className="rounded-lg px-2 py-2 text-sm text-ink-faint hover:bg-ink/5 disabled:opacity-40"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() =>
              onPatch({
                options: [
                  ...block.options,
                  {
                    id: `${block.id}_o${Date.now().toString(36)}`,
                    label: `Option ${block.options.length + 1}`,
                  },
                ],
              })
            }
            className="mt-2 text-xs font-semibold text-brand-700 hover:text-brand-900"
          >
            + Add option
          </button>
          {(block.type === "single_choice" || block.type === "multiple_choice") && (
            <label className="mt-3 flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={block.allowOther ?? false}
                onChange={(e) => onPatch({ allowOther: e.target.checked })}
                className="h-4 w-4 accent-emerald-700"
              />
              Allow “Other”
            </label>
          )}
        </div>
      )}

      {block.type === "rating" && (
        <Field label="Scale">
          <select
            value={block.max ?? 5}
            onChange={(e) => onPatch({ max: Number(e.target.value) })}
            className={inputCls}
          >
            <option value={5}>1 – 5</option>
            <option value={10}>1 – 10</option>
          </select>
        </Field>
      )}

      {block.type === "opinion_scale" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min">
            <input
              type="number" min={0} max={10}
              value={block.min ?? 0}
              onChange={(e) => onPatch({ min: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field label="Max">
            <input
              type="number" min={1} max={11}
              value={block.max ?? 10}
              onChange={(e) => onPatch({ max: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field label="Min label (optional)">
            <input
              value={block.minLabel ?? ""}
              onChange={(e) => onPatch({ minLabel: e.target.value })}
              maxLength={100}
              className={inputCls}
            />
          </Field>
          <Field label="Max label (optional)">
            <input
              value={block.maxLabel ?? ""}
              onChange={(e) => onPatch({ maxLabel: e.target.value })}
              maxLength={100}
              className={inputCls}
            />
          </Field>
        </div>
      )}

      {block.type === "file_upload" && (
        <Field label="Max file size (MB)">
          <input
            type="number" min={1} max={100}
            value={block.maxSizeMb ?? 10}
            onChange={(e) => onPatch({ maxSizeMb: Number(e.target.value) })}
            className={inputCls}
          />
        </Field>
      )}

      {(block.type === "welcome" || block.type === "statement") && (
        <Field label="Button label">
          <input
            value={block.buttonLabel ?? ""}
            onChange={(e) => onPatch({ buttonLabel: e.target.value })}
            maxLength={50}
            className={inputCls}
          />
        </Field>
      )}

      {answerable && (
        <Field label="After answering, go to">
          <select
            value={jumpTarget ?? ""}
            onChange={(e) => onJumpChange(e.target.value === "" ? null : e.target.value)}
            className={inputCls}
            title="One jump per question for now; per-answer branches arrive in Phase 4."
          >
            <option value="">Next question (default)</option>
            {blocks
              .filter((b) => b.id !== block.id)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title || BLOCK_TYPE_LABELS[b.type]}
                </option>
              ))}
          </select>
        </Field>
      )}

      <div className="flex items-center gap-2 border-t border-ink/10 pt-4">
        <button
          type="button"
          onClick={onDuplicate}
          className="rounded-full border border-ink/15 px-4 py-1.5 text-xs font-semibold transition-colors hover:border-ink/30"
        >
          Duplicate
        </button>
        {confirmingDelete ? (
          <span className="flex items-center gap-2 text-xs">
            <span className="font-medium text-red-700">Delete this block?</span>
            <button type="button" onClick={onDelete} className="font-bold text-red-700 underline">
              Yes, delete
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="text-ink-soft">
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-full px-4 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
