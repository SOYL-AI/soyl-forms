import type { AnswerValue, Block, FormSchemaV1 } from "@/types/forms";

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

function asWrapper(raw: unknown): { type?: unknown; value?: unknown } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as { type?: unknown; value?: unknown };
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
    case "date": {
      if (typeof v !== "string" || v.trim() === "") {
        return block.required ? fail(block, "answer is required.") : fail(block, "answer must be text.");
      }
      if (block.type !== "date") {
        const max = block.validation?.maxLength;
        if (max !== undefined && v.length > max) {
          return fail(block, `keep it under ${max} characters.`);
        }
        const min = block.validation?.minLength;
        if (min !== undefined && v.length < min) {
          return fail(block, `needs at least ${min} characters.`);
        }
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
      return { ok: true, value: { type: block.type, value: v } as AnswerValue };
    }

    case "number":
    case "rating":
    case "opinion_scale": {
      if (typeof v !== "number" || !Number.isFinite(v)) {
        return fail(block, "answer must be a number.");
      }
      if (block.type === "rating") {
        const max = block.max ?? 5;
        if (!Number.isInteger(v) || v < 1 || v > max) {
          return fail(block, `pick a whole number from 1 to ${max}.`);
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

    case "single_choice":
    case "dropdown":
    case "yes_no": {
      if (typeof v !== "string" || v === "") {
        return fail(block, "choose an option.");
      }
      const allowed =
        block.type === "yes_no" ? ["yes", "no"] : block.options.map((o) => o.id);
      const allowOther =
        block.type === "yes_no" ? false : (block.allowOther ?? false);
      if (!allowed.includes(v) && !allowOther) {
        return fail(block, "choice is not a valid option.");
      }
      return { ok: true, value: { type: block.type, value: v } as AnswerValue };
    }

    case "multiple_choice": {
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
        return fail(block, "answer must be a list of choices.");
      }
      if (block.required && v.length === 0) {
        return fail(block, "choose at least one option.");
      }
      const allowed = block.options.map((o) => o.id);
      for (const choice of v as string[]) {
        if (!allowed.includes(choice) && !(block.allowOther ?? false)) {
          return fail(block, `"${choice}" is not a valid option.`);
        }
      }
      return { ok: true, value: { type: "multiple_choice", value: v as string[] } };
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
