import type { Answers, FormSchemaV1, LogicRule } from "@/types/forms";

type Schema = Pick<FormSchemaV1, "blocks" | "logic">;

function scalar(answer: Answers[string]): string | number | null {
  if ("value" in answer) {
    const v = answer.value;
    if (typeof v === "string" || typeof v === "number") return v;
  }
  return null;
}

function ruleMatches(rule: LogicRule, answers: Answers): boolean {
  const answer = answers[rule.when.questionId];
  if (rule.when.operator === "not_answered") return !answer;
  if (!answer) return false;
  switch (rule.when.operator) {
    case "answered":
      return true;
    case "equals": {
      if (typeof rule.when.value !== "string") return false;
      const s = scalar(answer);
      if (s !== null && String(s) === rule.when.value) return true;
      return (
        answer.type === "multiple_choice" &&
        Array.isArray(answer.value) &&
        answer.value.includes(rule.when.value)
      );
    }
    case "not_equals": {
      if (typeof rule.when.value !== "string") return false;
      const s = scalar(answer);
      if (s !== null) return String(s) !== rule.when.value;
      if (answer.type === "multiple_choice" && Array.isArray(answer.value)) {
        return !answer.value.includes(rule.when.value);
      }
      return false;
    }
    case "contains":
      if (answer.type === "multiple_choice" && Array.isArray(answer.value)) {
        return typeof rule.when.value === "string"
          ? answer.value.includes(rule.when.value)
          : false;
      }
      if (typeof answer.value === "string" && typeof rule.when.value === "string") {
        return answer.value.toLowerCase().includes(rule.when.value.toLowerCase());
      }
      return false;
    case "greater_than":
    case "less_than": {
      const s = scalar(answer);
      const target = Number(rule.when.value);
      if (typeof s !== "number" || !Number.isFinite(target)) return false;
      return rule.when.operator === "greater_than" ? s > target : s < target;
    }
    default:
      return false;
  }
}

/**
 * Resolve the next block id after `currentId`, honoring conditional jumps.
 * Rules are evaluated in order; the first match wins. Falls back to linear
 * order. Returns null when the form is complete.
 */
export function getNextBlockId(
  schema: Schema,
  currentId: string,
  answers: Answers,
): string | null {
  const order = schema.blocks.map((b) => b.id);
  const currentIndex = order.indexOf(currentId);
  if (currentIndex === -1) return order[0] ?? null;

  const currentBlock = schema.blocks[currentIndex];
  if (currentBlock && currentBlock.type === "thank_you") return null;

  for (const rule of schema.logic) {
    if (rule.when.questionId !== currentId) continue;
    if (!ruleMatches(rule, answers)) continue;
    const target = rule.then.blockId;
    // Never jump to self; unknown targets fall through to linear order.
    if (target !== currentId && order.includes(target)) return target;
  }

  const next = order[currentIndex + 1];
  return next ?? null;
}

/** Blocks that collect an answer (used for progress + counts). */
export function isAnswerable(type: string): boolean {
  return type !== "welcome" && type !== "statement" && type !== "thank_you";
}

/** Question types whose answers are single values a rule can compare. */
export function supportsEqualityRules(type: string): boolean {
  return [
    "single_choice",
    "multiple_choice",
    "dropdown",
    "yes_no",
    "rating",
    "opinion_scale",
    "nps",
    "number",
    "short_text",
    "email",
    "legal",
  ].includes(type);
}

export function supportsNumericRules(type: string): boolean {
  return type === "rating" || type === "opinion_scale" || type === "nps" || type === "number";
}

/**
 * Best-effort remaining-step estimate for progress: walks linear order from
 * the current block and counts answerable blocks, so branching forms never
 * show an obviously wrong "3 of 8".
 */
export function estimateProgress(
  schema: Schema,
  currentId: string,
  visited: string[],
): { done: number; total: number } {
  const answerable = schema.blocks.filter((b) => isAnswerable(b.type)).map((b) => b.id);
  const done = visited.filter((id) => answerable.includes(id)).length;
  const idx = schema.blocks.findIndex((b) => b.id === currentId);
  const ahead = schema.blocks.slice(Math.max(0, idx)).filter((b) => isAnswerable(b.type)).length;
  return { done, total: Math.max(1, done + ahead) };
}
