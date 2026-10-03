import { isValidAnswer } from "./answers";
import type {
  Answers,
  AnswerValue,
  Block,
  FormSchemaV1,
  FormSettings,
} from "@/types/forms";

/** Query keys consumed by the form machinery itself, never stored. */
const RESERVED_KEYS = new Set(["src", "embed"]);

const KEY_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const MAX_PREFILLS = 200;
const MAX_HIDDEN = 20;

/** Match `?Your Question=...` to a question title (case-insensitive). */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "_")
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 64);
}

type Schema = Pick<FormSchemaV1, "blocks">;

/** Look up a question by block id first, then by slugified title. */
function indexByParam(blocks: Block[]): Map<string, Block> {
  const map = new Map<string, Block>();
  for (const b of blocks) {
    if (!map.has(b.id)) map.set(b.id, b);
    const slug = slugifyTitle(b.title);
    if (slug && !map.has(slug)) map.set(slug, b);
  }
  return map;
}

/**
 * Build a candidate answer from one raw query value. Returns null for
 * question types that can't be prefilled (grids, rankings, uploads, consent,
 * screens) or values that can't map cleanly.
 */
function candidateFor(block: Block, raw: string): unknown {
  const value = raw.slice(0, 2000);
  switch (block.type) {
    case "short_text":
    case "long_text":
    case "email":
    case "phone":
    case "url":
    case "date":
    case "time":
      return value.trim() === "" ? null : { type: block.type, value };
    case "number":
    case "rating":
    case "opinion_scale":
    case "slider":
    case "nps": {
      if (value.trim() === "") return null;
      const n = Number(value);
      return Number.isFinite(n) ? { type: block.type, value: n } : null;
    }
    case "single_choice":
    case "dropdown": {
      const opt =
        block.options.find((o) => o.id === value) ??
        block.options.find((o) => o.label.toLowerCase() === value.toLowerCase());
      return opt ? { type: block.type, value: opt.id } : null;
    }
    case "yes_no": {
      const t = value.trim().toLowerCase();
      if (["yes", "y", "true", "1"].includes(t)) return { type: "yes_no", value: "yes" };
      if (["no", "n", "false", "0"].includes(t)) return { type: "yes_no", value: "no" };
      return null;
    }
    case "multiple_choice": {
      const parts = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length === 0) return null;
      const ids: string[] = [];
      for (const part of parts) {
        const opt =
          block.options.find((o) => o.id === part) ??
          block.options.find((o) => o.label.toLowerCase() === part.toLowerCase());
        // Unknown or repeated picks reject the whole value — a half-right
        // prefill is worse than none.
        if (!opt || ids.includes(opt.id)) return null;
        ids.push(opt.id);
      }
      return { type: "multiple_choice", value: ids };
    }
    default:
      return null;
  }
}

export interface PrefillResult {
  /** Answers to show pre-filled (every one re-validated, so the server accepts them). */
  answers: Answers;
  /** Hidden-field values to store with the response (never rendered). */
  hidden: Record<string, string>;
}

/**
 * Split URL parameters into prefilled answers and hidden fields.
 *
 * - A key matching a declared `hiddenFields` entry is always stored hidden,
 *   even if a question shares the name.
 * - Otherwise a key matching a block id (or slugified question title) fills
 *   that question, unless `prefillEnabled` is off or the value is invalid —
 *   invalid values are dropped, never stored.
 * - Everything else is stored as a hidden tracking field when collection is
 *   on (`collectQueryParams !== false`), same rules as the submit endpoint.
 */
export function parsePrefillParams(
  schema: Schema,
  settings: FormSettings,
  params: Record<string, string>,
): PrefillResult {
  const answers: Answers = {};
  const hidden: Record<string, string> = {};
  const declared = new Set(settings.hiddenFields ?? []);
  const byParam = indexByParam(schema.blocks);
  const prefill = settings.prefillEnabled !== false;
  let prefilled = 0;

  for (const [key, rawVal] of Object.entries(params)) {
    if (typeof rawVal !== "string" || RESERVED_KEYS.has(key)) continue;
    const value = rawVal.slice(0, 2000);

    if (declared.has(key)) {
      if (value !== "" && value.length <= 200 && Object.keys(hidden).length < MAX_HIDDEN) {
        hidden[key] = value;
      }
      continue;
    }

    const block = byParam.get(key);
    if (block && prefill && prefilled < MAX_PREFILLS) {
      const candidate = candidateFor(block, value);
      if (candidate && isValidAnswer(block, candidate)) {
        answers[block.id] = candidate as AnswerValue;
        prefilled += 1;
      }
      // A matched-but-invalid value is dropped: it must not leak into hidden.
      continue;
    }

    if (block) continue;
    if (settings.collectQueryParams === false) continue;
    if (!KEY_PATTERN.test(key) || value === "" || value.length > 200) continue;
    if (Object.keys(hidden).length >= MAX_HIDDEN) break;
    hidden[key] = value;
  }
  return { answers, hidden };
}
