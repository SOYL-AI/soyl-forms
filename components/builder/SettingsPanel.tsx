"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Trash2, X } from "lucide-react";
import type { Block, ChoiceOption, LogicRule } from "@/types/forms";
import { BLOCK_TYPE_LABELS } from "@/lib/forms/builder";
import { isAnswerable } from "@/lib/forms/logic";
import { BLOCK_ICONS } from "@/lib/forms/blockIcons";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AssetUpload } from "./AssetUpload";
import { LogicEditor } from "./LogicEditor";

const FILE_TYPES: Array<{ mime: string; label: string }> = [
  { mime: "image/jpeg", label: "JPG" },
  { mime: "image/png", label: "PNG" },
  { mime: "image/webp", label: "WebP" },
  { mime: "application/pdf", label: "PDF" },
  { mime: "text/plain", label: "TXT" },
  { mime: "text/csv", label: "CSV" },
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "DOCX" },
  { mime: "application/zip", label: "ZIP" },
];

/** Editable list of labelled options (choices, grid rows/columns). */
function OptionList({
  label,
  options,
  min,
  onChange,
  idPrefix,
}: {
  label: string;
  options: ChoiceOption[];
  min: number;
  onChange: (next: ChoiceOption[]) => void;
  idPrefix: string;
}) {
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j] as ChoiceOption, next[i] as ChoiceOption];
    onChange(next);
  }
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-ink-soft">
        {label} <span className="font-normal text-ink-faint">(min {min})</span>
      </span>
      <ul className="flex flex-col gap-1.5">
        {options.map((opt, i) => (
          <li key={opt.id} className="flex items-center gap-1">
            <Input
              value={opt.label}
              aria-label={`${label} ${i + 1}`}
              onChange={(e) =>
                onChange(options.map((o) => (o.id === opt.id ? { ...o, label: e.target.value } : o)))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onChange([
                    ...options.slice(0, i + 1),
                    { id: `${idPrefix}_${Date.now().toString(36)}`, label: "" },
                    ...options.slice(i + 1),
                  ]);
                }
              }}
              maxLength={200}
              className="!py-1.5 text-xs"
            />
            <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-ink-faint hover:bg-ink/5 disabled:opacity-30">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === options.length - 1} className="rounded p-1 text-ink-faint hover:bg-ink/5 disabled:opacity-30">
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Remove ${opt.label || `option ${i + 1}`}`}
              disabled={options.length <= min}
              onClick={() => onChange(options.filter((o) => o.id !== opt.id))}
              className="rounded p-1 text-ink-faint hover:bg-ink/5 hover:text-danger disabled:opacity-30"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() =>
          onChange([...options, { id: `${idPrefix}_${Date.now().toString(36)}`, label: `Option ${options.length + 1}` }])
        }
        className="mt-2 text-xs font-semibold text-ink underline underline-offset-2"
      >
        + Add
      </button>
    </div>
  );
}

export function SettingsPanel({
  block,
  blocks,
  rules,
  formId,
  onPatch,
  onRulesChange,
  onDuplicate,
  onDelete,
}: {
  block: Block | undefined;
  blocks: Block[];
  /** Rules originating from this block. */
  rules: LogicRule[];
  formId: string;
  onPatch: (patch: Record<string, unknown>) => void;
  onRulesChange: (rules: LogicRule[]) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!block) {
    return (
      <p className="text-sm leading-relaxed text-ink-soft">
        Select a question in the outline to edit it, or press{" "}
        <kbd className="rounded border border-line-strong px-1 font-mono text-[11px]">/</kbd> to add one.
      </p>
    );
  }

  const answerable = isAnswerable(block.type);
  const Icon = BLOCK_ICONS[block.type];
  const isChoice =
    block.type === "single_choice" || block.type === "multiple_choice" || block.type === "dropdown";
  const isText =
    block.type === "short_text" ||
    block.type === "long_text" ||
    block.type === "email" ||
    block.type === "phone" ||
    block.type === "url";

  return (
    <div className="flex flex-col gap-4" key={block.id}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        <Icon className="h-3.5 w-3.5" />
        {BLOCK_TYPE_LABELS[block.type]}
      </div>

      <Field label={block.type === "welcome" || block.type === "thank_you" || block.type === "statement" ? "Heading" : "Question"}>
        <Textarea
          value={block.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          maxLength={500}
          rows={2}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />
      </Field>

      <Field label="Description" hint="Optional. Line breaks are kept.">
        <Textarea
          value={block.description ?? ""}
          onChange={(e) => onPatch({ description: e.target.value || undefined })}
          rows={2}
          maxLength={2000}
        />
      </Field>

      {answerable && (
        <Switch
          checked={block.required ?? false}
          onChange={(v) => onPatch({ required: v })}
          label="Required"
          description="Respondents can't skip this question."
        />
      )}

      {(isText || block.type === "number") && (
        <Field label="Placeholder">
          <Input
            value={block.placeholder ?? ""}
            onChange={(e) => onPatch({ placeholder: e.target.value || undefined })}
            maxLength={200}
          />
        </Field>
      )}

      {(block.type === "short_text" || block.type === "long_text") && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min length">
            <Input
              type="number"
              min={0}
              value={block.validation?.minLength ?? ""}
              placeholder="—"
              onChange={(e) =>
                onPatch({
                  validation: { ...block.validation, minLength: e.target.value === "" ? undefined : Number(e.target.value) },
                })
              }
            />
          </Field>
          <Field label="Max length">
            <Input
              type="number"
              min={1}
              max={10000}
              value={block.validation?.maxLength ?? ""}
              placeholder="No limit"
              onChange={(e) =>
                onPatch({
                  validation: { ...block.validation, maxLength: e.target.value === "" ? undefined : Number(e.target.value) },
                })
              }
            />
          </Field>
        </div>
      )}

      {block.type === "number" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min">
            <Input
              type="number"
              value={block.validation?.min ?? ""}
              placeholder="—"
              onChange={(e) =>
                onPatch({ validation: { ...block.validation, min: e.target.value === "" ? undefined : Number(e.target.value) } })
              }
            />
          </Field>
          <Field label="Max">
            <Input
              type="number"
              value={block.validation?.max ?? ""}
              placeholder="—"
              onChange={(e) =>
                onPatch({ validation: { ...block.validation, max: e.target.value === "" ? undefined : Number(e.target.value) } })
              }
            />
          </Field>
        </div>
      )}

      {isChoice && (
        <>
          <OptionList
            label="Options"
            options={block.options}
            min={2}
            idPrefix={`${block.id}_o`}
            onChange={(options) => onPatch({ options })}
          />
          <Switch
            checked={block.allowOther ?? false}
            onChange={(v) => onPatch({ allowOther: v })}
            label="Allow “Other”"
            description="Adds a free-text option."
          />
          <Switch
            checked={block.shuffle ?? false}
            onChange={(v) => onPatch({ shuffle: v })}
            label="Shuffle options"
            description="Random order per respondent, to reduce bias."
          />
          {block.type === "multiple_choice" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Min selections">
                <Input
                  type="number"
                  min={0}
                  value={block.minSelections ?? ""}
                  placeholder="—"
                  onChange={(e) => onPatch({ minSelections: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </Field>
              <Field label="Max selections">
                <Input
                  type="number"
                  min={1}
                  value={block.maxSelections ?? ""}
                  placeholder="—"
                  onChange={(e) => onPatch({ maxSelections: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </Field>
            </div>
          )}
        </>
      )}

      {block.type === "matrix" && (
        <>
          <OptionList label="Rows" options={block.rows} min={1} idPrefix={`${block.id}_r`} onChange={(rows) => onPatch({ rows })} />
          <OptionList label="Columns" options={block.columns} min={2} idPrefix={`${block.id}_c`} onChange={(columns) => onPatch({ columns })} />
        </>
      )}

      {block.type === "rating" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Scale">
            <Select value={block.max ?? 5} onChange={(e) => onPatch({ max: Number(e.target.value) })}>
              <option value={5}>1 – 5</option>
              <option value={10}>1 – 10</option>
            </Select>
          </Field>
          <Field label="Style">
            <Select value={block.icon ?? "number"} onChange={(e) => onPatch({ icon: e.target.value })}>
              <option value="star">Stars</option>
              <option value="heart">Hearts</option>
              <option value="number">Numbers</option>
            </Select>
          </Field>
        </div>
      )}

      {block.type === "opinion_scale" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="From">
            <Input type="number" min={0} max={10} value={block.min ?? 0} onChange={(e) => onPatch({ min: Number(e.target.value) })} />
          </Field>
          <Field label="To">
            <Input type="number" min={1} max={11} value={block.max ?? 10} onChange={(e) => onPatch({ max: Number(e.target.value) })} />
          </Field>
          <Field label="Low label">
            <Input value={block.minLabel ?? ""} onChange={(e) => onPatch({ minLabel: e.target.value || undefined })} maxLength={100} />
          </Field>
          <Field label="High label">
            <Input value={block.maxLabel ?? ""} onChange={(e) => onPatch({ maxLabel: e.target.value || undefined })} maxLength={100} />
          </Field>
        </div>
      )}

      {block.type === "legal" && (
        <>
          <Field label="Checkbox text">
            <Input value={block.acceptLabel ?? ""} onChange={(e) => onPatch({ acceptLabel: e.target.value || undefined })} maxLength={200} placeholder="I agree to the terms" />
          </Field>
          <Field label="Link to policy" hint="https URL, opens in a new tab.">
            <Input value={block.linkUrl ?? ""} onChange={(e) => onPatch({ linkUrl: e.target.value || undefined })} placeholder="https://example.com/privacy" />
          </Field>
          <Field label="Link label">
            <Input value={block.linkLabel ?? ""} onChange={(e) => onPatch({ linkLabel: e.target.value || undefined })} maxLength={100} placeholder="Read the privacy policy" />
          </Field>
        </>
      )}

      {block.type === "file_upload" && (
        <>
          <Field label="Max file size (MB)">
            <Input type="number" min={1} max={100} value={block.maxSizeMb ?? 10} onChange={(e) => onPatch({ maxSizeMb: Number(e.target.value) })} />
          </Field>
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Accepted types</span>
            <div className="flex flex-wrap gap-1.5">
              {FILE_TYPES.map((t) => {
                const on = (block.allowedMimes ?? []).includes(t.mime);
                return (
                  <button
                    key={t.mime}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const cur = block.allowedMimes ?? [];
                      onPatch({ allowedMimes: on ? cur.filter((m) => m !== t.mime) : [...cur, t.mime] });
                    }}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${on ? "border-ink bg-ink text-paper" : "border-line-strong text-ink-soft"}`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-ink-faint">Leave all off to accept common images, PDFs and text.</p>
          </div>
        </>
      )}

      {(block.type === "welcome" || block.type === "statement") && (
        <Field label="Button label">
          <Input value={block.buttonLabel ?? ""} onChange={(e) => onPatch({ buttonLabel: e.target.value || undefined })} maxLength={50} placeholder={block.type === "welcome" ? "Start" : "Continue"} />
        </Field>
      )}

      {block.type === "thank_you" && (
        <div className="grid gap-2">
          <Field label="Button label" hint="Shown on the final screen.">
            <Input value={block.buttonLabel ?? ""} onChange={(e) => onPatch({ buttonLabel: e.target.value || undefined })} maxLength={50} placeholder="Done" />
          </Field>
          <Field label="Button link" hint="Where the button takes respondents (https).">
            <Input value={block.buttonUrl ?? ""} onChange={(e) => onPatch({ buttonUrl: e.target.value || undefined })} placeholder="https://yoursite.com" />
          </Field>
        </div>
      )}

      <AssetUpload
        label="Image"
        hint="Shown above the question. PNG, JPG, WebP or SVG up to 5 MB."
        kind="question_media"
        formId={formId}
        value={block.imageUrl}
        onChange={(url) => onPatch({ imageUrl: url })}
        compact
      />

      {answerable && (
        <div className="border-t border-line pt-4">
          <LogicEditor block={block} blocks={blocks} rules={rules} onChange={onRulesChange} />
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-line pt-4">
        <Button variant="secondary" size="sm" onClick={onDuplicate}>
          <Copy className="h-3.5 w-3.5" /> Duplicate
        </Button>
        {confirmingDelete ? (
          <span className="flex items-center gap-2 text-xs">
            <span className="font-medium text-danger">Delete this block?</span>
            <button type="button" onClick={onDelete} className="font-bold text-danger underline">
              Yes, delete
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="text-ink-soft">
              Keep
            </button>
          </span>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)} className="text-danger hover:bg-danger-soft hover:text-danger">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}
