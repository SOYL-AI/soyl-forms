import { OTHER_OPTION_ID, type AnswerValue, type Block, type FormSchemaV1 } from "@/types/forms";

export type NormalizedAnswers = Record<string, AnswerValue>;

/**
 * Server-side answer validation against the EXACT published version.
 * Mirrors client checks but never trusts them. Returns the first problem
 * found — the submission endpoint treats any failure as a 400.
 */
export function validateAnswers(
  schema: Pick<FormSchemaV1, "blocks">,
  answers: unknown,
): { ok: true; value: NormalizedAnswers } | { ok: false; error: string } {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return { ok: false, error: "Answers must be an object keyed by question id." };
  }
  const input = answers as Record<string, unknown>;
  const byId = new Map(schema.blocks.map((b) => [b.id, b]));
  const out: NormalizedAnswers = {};

  for (const key of Object.keys(input)) {
    if (!byId.has(key)) {
      return { ok: false, error: `Unknown question "${key}".` };
    }
  }

  for (const block of schema.blocks) {
    const raw = input[block.id];
    if (raw === undefined || raw === null) {
      if (isRequired(block)) {
        return { ok: false, error: `“${block.title}” needs an answer.` };
      }
      continue;
    }
    const checked = checkBlock(block, raw);
    if (!checked.ok) return checked;
    out[block.id] = checked.value;
  }
  return { ok: true, value: out };
}

function isRequired(block: Block): boolean {
  return (
    block.type !== "welcome" &&
    block.type !== "statement" &&
    block.type !== "thank_you" &&
    block.required === true
  );
}

type Checked =
  | { ok: true; value: AnswerValue }
  | { ok: false; error: string };

function fail(block: Block, detail: string): Checked {
  return { ok: false, error: `“${block.title}”: ${detail}` };
}

function asWrapper(raw: unknown): { type?: unknown; value?: unknown; otherText?: unknown } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as { type?: unknown; value?: unknown; otherText?: unknown };
}

function cleanOther(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, 200);
  return t || undefined;
}

function checkBlock(block: Block, raw: unknown): Checked {
  const w = asWrapper(raw);
  if (!w || typeof w.type !== "string" || !("value" in w)) {
    return fail(block, "answer must be shaped like {type, value}.");
  }
  const v = w.value;

  switch (block.type) {
    case "welcome":
    case "statement":
    case "thank_you":
      return fail(block, "this screen takes no answer.");

    case "short_text":
    case "long_text":
    case "email":
    case "phone":
    case "url":
    case "date":
    case "time": {
      if (typeof v !== "string" || v.trim() === "") {
        return block.required ? fail(block, "answer is required.") : fail(block, "answer must be text.");
      }
      if (block.type !== "date" && block.type !== "time") {
        const max = block.validation?.maxLength;
        if (max !== undefined && v.length > max) {
          return fail(block, `keep it under ${max} characters.`);
        }
        const min = block.validation?.minLength;
        if (min !== undefined && v.length < min) {
          return fail(block, `needs at least ${min} characters.`);
        }
        if (v.length > 10000) return fail(block, "answer is too long.");
      }
      if (block.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        return fail(block, "enter a valid email address.");
      }
      if (block.type === "url") {
        try {
          const u = new URL(v.includes("://") ? v : `https://${v}`);
          if (!u.hostname.includes(".")) throw new Error("bad host");
        } catch {
          return fail(block, "enter a valid URL.");
        }
      }
      if (block.type === "date" && Number.isNaN(Date.parse(v))) {
        return fail(block, "enter a valid date.");
      }
      if (block.type === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
        return fail(block, "enter a valid time.");
      }
      return { ok: true, value: { type: block.type, value: v } as AnswerValue };
    }

    case "number":
    case "rating":
    case "opinion_scale":
    case "nps": {
      if (typeof v !== "number" || !Number.isFinite(v)) {
        return fail(block, "answer must be a number.");
      }
      if (block.type === "rating") {
        const max = block.max ?? 5;
        if (!Number.isInteger(v) || v < 1 || v > max) {
          return fail(block, `pick a whole number from 1 to ${max}.`);
        }
      } else if (block.type === "nps") {
        if (!Number.isInteger(v) || v < 0 || v > 10) {
          return fail(block, "pick a whole number from 0 to 10.");
        }
      } else if (block.type === "opinion_scale") {
        const min = block.min ?? 0;
        const max = block.max ?? 10;
        if (!Number.isInteger(v) || v < min || v > max) {
          return fail(block, `pick a whole number from ${min} to ${max}.`);
        }
      } else {
        if (block.validation?.min !== undefined && v < block.validation.min) {
          return fail(block, `enter ${block.validation.min} or more.`);
        }
        if (block.validation?.max !== undefined && v > block.validation.max) {
          return fail(block, `enter ${block.validation.max} or less.`);
        }
      }
      return { ok: true, value: { type: block.type, value: v } as AnswerValue };
    }

    case "yes_no": {
      if (v !== "yes" && v !== "no") return fail(block, "choose Yes or No.");
      return { ok: true, value: { type: "yes_no", value: v } };
    }

    case "single_choice":
    case "dropdown": {
      if (typeof v !== "string" || v === "") {
        return fail(block, "choose an option.");
      }
      const allowed = block.options.map((o) => o.id);
      if (allowed.includes(v)) {
        return { ok: true, value: { type: block.type, value: v } };
      }
      if (v === OTHER_OPTION_ID && block.allowOther) {
        const other = cleanOther(w.otherText);
        if (!other) return fail(block, "tell us what “Other” is.");
        return { ok: true, value: { type: block.type, value: v, otherText: other } };
      }
      return fail(block, "choice is not a valid option.");
    }

    case "multiple_choice": {
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
        return fail(block, "answer must be a list of choices.");
      }
      const picks = [...new Set(v as string[])];
      if (block.required && picks.length === 0) {
        return fail(block, "choose at least one option.");
      }
      if (block.minSelections !== undefined && picks.length > 0 && picks.length < block.minSelections) {
        return fail(block, `choose at least ${block.minSelections}.`);
      }
      if (block.maxSelections !== undefined && picks.length > block.maxSelections) {
        return fail(block, `choose at most ${block.maxSelections}.`);
      }
      const allowed = block.options.map((o) => o.id);
      let otherText: string | undefined;
      for (const choice of picks) {
        if (allowed.includes(choice)) continue;
        if (choice === OTHER_OPTION_ID && block.allowOther) {
          otherText = cleanOther(w.otherText);
          if (!otherText) return fail(block, "tell us what “Other” is.");
          continue;
        }
        return fail(block, `"${choice}" is not a valid option.`);
      }
      return {
        ok: true,
        value: otherText
          ? { type: "multiple_choice", value: picks, otherText }
          : { type: "multiple_choice", value: picks },
      };
    }

    case "matrix": {
      if (!v || typeof v !== "object" || Array.isArray(v)) {
        return fail(block, "answer must map rows to a column.");
      }
      const grid = v as Record<string, unknown>;
      const rows = new Set(block.rows.map((r) => r.id));
      const cols = new Set(block.columns.map((c) => c.id));
      const out: Record<string, string | string[]> = {};
      for (const [rowId, pick] of Object.entries(grid)) {
        if (!rows.has(rowId)) return fail(block, "unknown row.");
        if (block.multiple) {
          if (!Array.isArray(pick) || pick.some((c) => typeof c !== "string" || !cols.has(c))) {
            return fail(block, "unknown column.");
          }
          const picks = [...new Set(pick as string[])];
          if (picks.length > 0) out[rowId] = picks;
        } else {
          if (typeof pick !== "string" || !cols.has(pick)) return fail(block, "unknown column.");
          out[rowId] = pick;
        }
      }
      if (block.required && Object.keys(out).length < block.rows.length) {
        return fail(block, "answer every row.");
      }
      if (Object.keys(out).length === 0) return fail(block, "answer at least one row.");
      return { ok: true, value: { type: "matrix", value: out } };
    }

    case "ranking": {
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
        return fail(block, "answer must be an ordered list.");
      }
      const ids = block.options.map((o) => o.id);
      const order = v as string[];
      if (order.length !== ids.length || new Set(order).size !== ids.length || order.some((id) => !ids.includes(id))) {
        return fail(block, "rank every option exactly once.");
      }
      return { ok: true, value: { type: "ranking", value: order } };
    }

    case "legal": {
      if (v !== "accepted") return fail(block, "consent is required to continue.");
      return { ok: true, value: { type: "legal", value: "accepted" } };
    }

    case "file_upload": {
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
        return fail(block, "answer must be a list of uploaded files.");
      }
      const ids = (v as string[]).filter((s) => s.length >= 1 && s.length <= 100);
      if (block.required && ids.length === 0) {
        return fail(block, "upload at least one file.");
      }
      if (ids.length > 10) {
        return fail(block, "attach at most 10 files.");
      }
      // Existence + ownership of each id is verified in the submit endpoint.
      return { ok: true, value: { type: "file_upload", value: ids } };
    }

    default:
      return fail(block, "unsupported question type.");
  }
}

/** Human-readable rendering of one answer, shared by CSV, detail page and emails. */
export function displayAnswer(block: Block, answer: AnswerValue | undefined): string {
  if (!answer) return "";
  const optionLabel = (id: string): string => {
    if (
      block.type === "single_choice" ||
      block.type === "multiple_choice" ||
      block.type === "dropdown"
    ) {
      if (id === OTHER_OPTION_ID) return "Other";
      return block.options.find((o) => o.id === id)?.label ?? id;
    }
    return id;
  };
  switch (answer.type) {
    case "short_text":
    case "long_text":
    case "email":
    case "phone":
    case "url":
    case "date":
    case "time":
      return answer.value;
    case "number":
    case "rating":
    case "opinion_scale":
    case "nps":
      return String(answer.value);
    case "ranking": {
      const label = (id: string) =>
        block.type === "ranking" ? (block.options.find((o) => o.id === id)?.label ?? id) : id;
      return answer.value.map((id, i) => `${i + 1}. ${label(id)}`).join("; ");
    }
    case "single_choice":
    case "dropdown":
      return answer.value === OTHER_OPTION_ID && answer.otherText
        ? `Other: ${answer.otherText}`
        : optionLabel(answer.value);
    case "yes_no":
      return answer.value === "yes" ? "Yes" : "No";
    case "multiple_choice":
      return answer.value
        .map((id) =>
          id === OTHER_OPTION_ID && answer.otherText ? `Other: ${answer.otherText}` : optionLabel(id),
        )
        .join("; ");
    case "matrix": {
      if (block.type !== "matrix") return JSON.stringify(answer.value);
      const colLabel = (id: string) => block.columns.find((c) => c.id === id)?.label ?? id;
      return block.rows
        .filter((r) => answer.value[r.id])
        .map((r) => {
          const pick = answer.value[r.id] as string | string[];
          return `${r.label}: ${Array.isArray(pick) ? pick.map(colLabel).join(", ") : colLabel(pick)}`;
        })
        .join("; ");
    }
    case "legal":
      return "Accepted";
    case "file_upload":
      return answer.value.join("; ");
    default:
      return "";
  }
}
