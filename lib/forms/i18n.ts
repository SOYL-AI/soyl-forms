import type { Block, BlockTranslation, FormSchemaV1 } from "@/types/forms";

/**
 * Multi-language forms. Translations swap display strings only — block ids,
 * option ids, logic, and answers are identical in every locale, so submitted
 * data never depends on the language it was answered in.
 */

/** Locales the form offers (the base language is always first, as "Default"). */
export function availableLocales(schema: Pick<FormSchemaV1, "locales">): string[] {
  const seen = new Set<string>();
  return (schema.locales ?? []).filter((l) => {
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });
}

function applyBlockTranslation(block: Block, t: BlockTranslation | undefined): Block {
  if (!t) return block;
  const next = { ...block } as Block & Record<string, unknown>;
  if (t.title !== undefined) next.title = t.title;
  if (t.description !== undefined) next.description = t.description;
  if (t.placeholder !== undefined && "placeholder" in next) next.placeholder = t.placeholder;
  if (t.buttonLabel !== undefined && "buttonLabel" in next) next.buttonLabel = t.buttonLabel;
  if (t.minLabel !== undefined && "minLabel" in next) next.minLabel = t.minLabel;
  if (t.maxLabel !== undefined && "maxLabel" in next) next.maxLabel = t.maxLabel;
  if (t.acceptLabel !== undefined && "acceptLabel" in next) next.acceptLabel = t.acceptLabel;
  if (t.caption !== undefined && "caption" in next) next.caption = t.caption;
  if (t.options && "options" in next && Array.isArray(next.options)) {
    next.options = (next.options as Array<{ id: string; label: string }>).map((o) => ({
      ...o,
      label: t.options?.[o.id] ?? o.label,
    }));
  }
  if (block.type === "matrix") {
    const b = next as Block & { rows: Array<{ id: string; label: string }>; columns: Array<{ id: string; label: string }> };
    if (t.rows) b.rows = b.rows.map((r) => ({ ...r, label: t.rows?.[r.id] ?? r.label }));
    if (t.columns) b.columns = b.columns.map((c) => ({ ...c, label: t.columns?.[c.id] ?? c.label }));
  }
  return next as Block;
}

/**
 * Schema with display strings replaced for `locale`. Unknown or missing
 * locales return the schema unchanged (base language).
 */
export function localizeSchema(schema: FormSchemaV1, locale: string | null): FormSchemaV1 {
  if (!locale) return schema;
  const t = schema.translations?.[locale];
  if (!t) return schema;
  return {
    ...schema,
    title: t.title ?? schema.title,
    blocks: schema.blocks.map((b) => applyBlockTranslation(b, t.blocks?.[b.id])),
  };
}
