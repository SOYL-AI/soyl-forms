"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Block, BlockTranslation, FormTranslation } from "@/types/forms";
import { BLOCK_TYPE_LABELS } from "@/lib/forms/builder";
import { Field, Input, Textarea } from "@/components/ui/input";

const LOCALE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

function TextRow({
  label,
  value,
  max,
  multiline,
  onChange,
}: {
  label: string;
  value: string;
  max: number;
  multiline?: boolean;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <Field label={label}>
      {multiline ? (
        <Textarea value={value} rows={2} maxLength={max} onChange={(e) => onChange(e.target.value || undefined)} />
      ) : (
        <Input value={value} maxLength={max} onChange={(e) => onChange(e.target.value || undefined)} />
      )}
    </Field>
  );
}

/** Fields worth translating for one question (ids and logic never change). */
function BlockFields({
  block,
  value,
  onChange,
}: {
  block: Block;
  value: BlockTranslation;
  onChange: (patch: BlockTranslation) => void;
}) {
  const set = (k: keyof BlockTranslation, v: string | undefined) => onChange({ ...value, [k]: v });
  const setMap = (k: "options" | "rows" | "columns", id: string, v: string | undefined) => {
    const next = { ...(value[k] ?? {}) };
    if (v) next[id] = v;
    else delete next[id];
    onChange({ ...value, [k]: Object.keys(next).length > 0 ? next : undefined });
  };
  const options =
    "options" in block && Array.isArray((block as { options?: unknown }).options)
      ? (block as { options: Array<{ id: string; label: string }> }).options
      : null;
  return (
    <div className="grid gap-2 rounded-xl border border-line bg-paper-deep/40 p-2.5">
      <p className="truncate text-xs font-semibold text-ink-soft">
        {block.title.slice(0, 60) || BLOCK_TYPE_LABELS[block.type]}{" "}
        <span className="font-normal text-ink-faint">· {BLOCK_TYPE_LABELS[block.type]}</span>
      </p>
      <TextRow label="Question" value={value.title ?? ""} max={500} multiline onChange={(v) => set("title", v)} />
      <TextRow label="Description" value={value.description ?? ""} max={2000} multiline onChange={(v) => set("description", v)} />
      {"placeholder" in block && (
        <TextRow label="Placeholder" value={value.placeholder ?? ""} max={200} onChange={(v) => set("placeholder", v)} />
      )}
      {"buttonLabel" in block && (
        <TextRow label="Button" value={value.buttonLabel ?? ""} max={50} onChange={(v) => set("buttonLabel", v)} />
      )}
      {(block.type === "opinion_scale" || block.type === "slider") && (
        <div className="grid grid-cols-2 gap-2">
          <TextRow label="Low label" value={value.minLabel ?? ""} max={100} onChange={(v) => set("minLabel", v)} />
          <TextRow label="High label" value={value.maxLabel ?? ""} max={100} onChange={(v) => set("maxLabel", v)} />
        </div>
      )}
      {block.type === "legal" && (
        <TextRow label="Checkbox text" value={value.acceptLabel ?? ""} max={200} onChange={(v) => set("acceptLabel", v)} />
      )}
      {block.type === "media" && (
        <TextRow label="Caption" value={value.caption ?? ""} max={500} onChange={(v) => set("caption", v)} />
      )}
      {options && (
        <div className="grid gap-1.5">
          <span className="text-xs font-semibold text-ink-soft">Options</span>
          {options.map((o) => (
            <label key={o.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
              <span className="truncate text-xs text-ink-faint">{o.label}</span>
              <Input value={value.options?.[o.id] ?? ""} maxLength={200} onChange={(e) => setMap("options", o.id, e.target.value || undefined)} />
            </label>
          ))}
        </div>
      )}
      {block.type === "matrix" && (
        <div className="grid gap-1.5">
          <span className="text-xs font-semibold text-ink-soft">Rows / columns</span>
          {block.rows.map((r) => (
            <label key={r.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
              <span className="truncate text-xs text-ink-faint">{r.label}</span>
              <Input value={value.rows?.[r.id] ?? ""} maxLength={200} onChange={(e) => setMap("rows", r.id, e.target.value || undefined)} />
            </label>
          ))}
          {block.columns.map((c) => (
            <label key={c.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
              <span className="truncate text-xs text-ink-faint">{c.label}</span>
              <Input value={value.columns?.[c.id] ?? ""} maxLength={200} onChange={(e) => setMap("columns", c.id, e.target.value || undefined)} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Per-form translations: locales plus every translatable string. */
export function TranslationsPanel({
  blocks,
  locales,
  translations,
  onChange,
}: {
  blocks: Block[];
  locales: string[];
  translations: Record<string, FormTranslation>;
  onChange: (locales: string[], translations: Record<string, FormTranslation>) => void;
}) {
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  function setBlockT(locale: string, blockId: string, patch: BlockTranslation) {
    const current = translations[locale] ?? {};
    const currentBlocks = { ...(current.blocks ?? {}) };
    const merged = { ...(currentBlocks[blockId] ?? {}), ...patch };
    // Prune empties so untranslated keys fall back to the base language.
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || (typeof v === "object" && Object.keys(v).length === 0)) {
        delete (merged as Record<string, unknown>)[k];
      }
    }
    if (Object.keys(merged).length === 0) delete currentBlocks[blockId];
    else currentBlocks[blockId] = merged;
    onChange(locales, { ...translations, [locale]: { ...current, blocks: currentBlocks } });
  }

  function setTitle(locale: string, v: string | undefined) {
    const current = translations[locale] ?? {};
    onChange(locales, { ...translations, [locale]: { ...current, title: v } });
  }

  function addLocale() {
    const next = code.trim();
    if (!LOCALE_PATTERN.test(next)) {
      setCodeError("Use a code like hi, es, or pt-BR.");
      return;
    }
    if (locales.includes(next)) {
      setCodeError("That language is already added.");
      return;
    }
    setCodeError(null);
    setCode("");
    onChange([...locales, next], translations);
  }

  function removeLocale(locale: string) {
    const next = { ...translations };
    delete next[locale];
    onChange(locales.filter((l) => l !== locale), next);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          value={code}
          placeholder="Add language: hi, es, pt-BR…"
          maxLength={5}
          onChange={(e) => setCode(e.target.value)}
          className="flex-1"
        />
        <button
          type="button"
          onClick={addLocale}
          disabled={code.trim() === ""}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line-strong px-3 text-xs font-semibold hover:border-ink/40 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      {codeError && <p className="text-xs text-danger">{codeError}</p>}
      {locales.length === 0 && (
        <p className="text-xs leading-relaxed text-ink-faint">
          Respondents answer in your base language. Add languages and translate each question — answers and logic stay identical.
        </p>
      )}
      {locales.map((locale) => (
        <details key={locale} className="rounded-xl border border-line" open={locales.length === 1}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
            <span className="rounded-full bg-ink/5 px-2.5 py-0.5 font-mono text-xs font-semibold">{locale}</span>
            <span className="flex-1 text-xs text-ink-faint">
              {Object.keys(translations[locale]?.blocks ?? {}).length} of {blocks.length} translated
            </span>
            <button
              type="button"
              aria-label={`Remove ${locale}`}
              onClick={(e) => {
                e.preventDefault();
                if (window.confirm(`Remove ${locale} translations?`)) removeLocale(locale);
              }}
              className="rounded p-1 text-ink-faint hover:bg-ink/5 hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </summary>
          <div className="grid gap-2 border-t border-line p-3">
            <TextRow label="Form title" value={translations[locale]?.title ?? ""} max={200} onChange={(v) => setTitle(locale, v)} />
            {blocks.map((b) => (
              <BlockFields
                key={b.id}
                block={b}
                value={translations[locale]?.blocks?.[b.id] ?? {}}
                onChange={(patch) => setBlockT(locale, b.id, patch)}
              />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
