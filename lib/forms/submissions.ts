import { isValidAnswer, validateAnswers } from "./answers";
import type { Answers, FormSchemaV1 } from "@/types/forms";

/** Max tags per response (keeps the filter UI honest). */
export const MAX_TAGS = 10;

/**
 * Normalize one tag: lowercase, spaces become dashes, 30 chars max.
 * Null when the input can't be a tag.
 */
export function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 30);
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(t)) return null;
  return t;
}

/** Dedupe + cap a tag list from the editor. */
export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const t = normalizeTag(item);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

type Schema = Pick<FormSchemaV1, "blocks"> & { logic?: FormSchemaV1["logic"] };

/**
 * Apply an owner's edit to one answer, re-validating the WHOLE response
 * against the version the respondent answered (required questions, logic
 * branches, option lists all still hold). Returns the normalized answers to
 * persist. Fails when the question isn't on the response's path.
 */
export function applyEditedAnswer(
  schema: Schema,
  existing: Record<string, unknown>,
  blockId: string,
  raw: unknown,
): { ok: true; answers: Answers } | { ok: false; error: string } {
  const block = schema.blocks.find((b) => b.id === blockId);
  if (!block) return { ok: false, error: "That question no longer exists." };
  if (!isValidAnswer(block, raw)) {
    return { ok: false, error: "That value isn't valid for this question." };
  }
  const merged = { ...(existing as Record<string, unknown>), [blockId]: raw };
  const checked = validateAnswers(schema, merged);
  if (!checked.ok) return { ok: false, error: checked.error };
  if (!checked.value[blockId]) {
    return { ok: false, error: "That question isn't on this response's path." };
  }
  return { ok: true, answers: checked.value };
}
