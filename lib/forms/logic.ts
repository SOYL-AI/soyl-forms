import type { Answers, FormSchemaV1, LogicCondition, LogicRule } from "@/types/forms";

type Schema = Pick<FormSchemaV1, "blocks" | "logic">;

function scalar(answer: Answers[string]): string | number | null {
  if ("value" in answer) {
    const v = answer.value;
    if (typeof v === "string" || typeof v === "number") return v;
  }
  return null;
}

function conditionMatches(cond: LogicCondition, answers: Answers): boolean {
  const answer = answers[cond.questionId];
  if (cond.operator === "not_answered") return !answer;
  if (!answer) return false;
  switch (cond.operator) {
    case "answered":
      return true;
    case "equals": {
      if (typeof cond.value !== "string") return false;
      const s = scalar(answer);
      if (s !== null && String(s) === cond.value) return true;
      return (
        answer.type === "multiple_choice" &&
        Array.isArray(answer.value) &&
        answer.value.includes(cond.value)
      );
    }
    case "not_equals": {
      if (typeof cond.value !== "string") return false;
      const s = scalar(answer);
      if (s !== null) return String(s) !== cond.value;
      if (answer.type === "multiple_choice" && Array.isArray(answer.value)) {
        return !answer.value.includes(cond.value);
      }
      return false;
    }
    case "contains":
      if (answer.type === "multiple_choice" && Array.isArray(answer.value)) {
        return typeof cond.value === "string" ? answer.value.includes(cond.value) : false;
      }
      if (typeof answer.value === "string" && typeof cond.value === "string") {
        return answer.value.toLowerCase().includes(cond.value.toLowerCase());
      }
      return false;
    case "greater_than":
    case "less_than": {
      const s = scalar(answer);
      const target = Number(cond.value);
      if (typeof s !== "number" || !Number.isFinite(target)) return false;
      return cond.operator === "greater_than" ? s > target : s < target;
    }
    default:
      return false;
  }
}

/**
 * A rule matches when its trigger (`when`) and extra `conditions` combine
 * per `match` ("all" by default — the legacy single-condition behaviour).
 */
export function ruleMatches(rule: LogicRule, answers: Answers): boolean {
  const parts = [
    conditionMatches(rule.when, answers),
    ...(rule.conditions ?? []).map((c) => conditionMatches(c, answers)),
  ];
  return rule.match === "any" ? parts.some(Boolean) : parts.every(Boolean);
}

/**
 * Blocks hidden by matching hide-rules, evaluated against current answers.
 * Hidden questions are skipped in navigation, progress, and required checks.
 */
export function hiddenBlockIds(schema: Schema, answers: Answers): Set<string> {
  const hidden = new Set<string>();
  for (const rule of schema.logic) {
    if (rule.then.action !== "hide" || !rule.then.blockId) continue;
    if (ruleMatches(rule, answers)) hidden.add(rule.then.blockId);
  }
  return hidden;
}

/**
 * Resolve the next block id after `currentId`, honoring conditional jumps.
 * `when.questionId` is the trigger; extra conditions add context. An `end`
 * action finishes the form (null). Hidden blocks are stepped over linearly.
 * Rules are evaluated in order; the first match wins. Falls back to linear
 * order. Returns null when the form is complete.
 */
export function getNextBlockId(
  schema: Schema,
  currentId: string,
  answers: Answers,
  hidden?: Set<string>,
): string | null {
  const hide = hidden ?? hiddenBlockIds(schema, answers);
  const order = schema.blocks.map((b) => b.id);
  const currentIndex = order.indexOf(currentId);
  if (currentIndex === -1) return stepLinear(order, 0, hide);

  const currentBlock = schema.blocks[currentIndex];
  if (currentBlock && currentBlock.type === "thank_you") return null;
  // Stranded on a now-hidden block (an earlier answer hid it): move forward.
  if (hide.has(currentId)) return stepLinear(order, currentIndex + 1, hide);

  for (const rule of schema.logic) {
    if (rule.when.questionId !== currentId) continue;
    if (!ruleMatches(rule, answers)) continue;
    if (rule.then.action === "end") return null;
    const target = rule.then.blockId;
    if (!target || target === currentId || !order.includes(target)) continue;
    // A jump onto a hidden block continues linearly past it.
    return stepLinear(order, order.indexOf(target), hide);
  }

  return stepLinear(order, currentIndex + 1, hide);
}

/** First non-hidden block id at or after `from` (null past the end). */
function stepLinear(order: string[], from: number, hidden: Set<string>): string | null {
  for (let i = from; i < order.length; i++) {
    const id = order[i];
    if (id !== undefined && !hidden.has(id)) return id;
  }
  return null;
}

/**
 * The blocks a respondent actually passed through, replaying the form from the
 * first block with their answers. Branching can skip required questions, and
 * answers left on a branch they backed out of are not on this path.
 */
export function respondentPath(schema: Schema, answers: Answers, hidden?: Set<string>): Set<string> {
  const hide = hidden ?? hiddenBlockIds(schema, answers);
  const path = new Set<string>();
  let id: string | null = stepLinear(
    schema.blocks.map((b) => b.id),
    0,
    hide,
  );
  // A jump can point backwards; stop on the first repeat so a loop can't hang.
  while (id && !path.has(id)) {
    path.add(id);
    id = getNextBlockId(schema, id, answers, hide);
  }
  return path;
}

/** Blocks that collect an answer (used for progress + counts). */
export function isAnswerable(type: string): boolean {
  return (
    type !== "welcome" &&
    type !== "statement" &&
    type !== "section" &&
    type !== "media" &&
    type !== "thank_you"
  );
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
    "slider",
    "short_text",
    "email",
    "legal",
  ].includes(type);
}

export function supportsNumericRules(type: string): boolean {
  return (
    type === "rating" ||
    type === "opinion_scale" ||
    type === "nps" ||
    type === "number" ||
    type === "slider"
  );
}

/**
 * Best-effort remaining-step estimate for progress: walks linear order from
 * the current block and counts answerable, visible blocks, so branching
 * forms never show an obviously wrong "3 of 8".
 */
export function estimateProgress(
  schema: Schema,
  currentId: string,
  visited: string[],
  hidden?: Set<string>,
): { done: number; total: number } {
  const answerable = schema.blocks
    .filter((b) => isAnswerable(b.type) && !hidden?.has(b.id))
    .map((b) => b.id);
  const done = visited.filter((id) => answerable.includes(id)).length;
  const idx = schema.blocks.findIndex((b) => b.id === currentId);
  const ahead = schema.blocks.slice(Math.max(0, idx)).filter((b) => isAnswerable(b.type) && !hidden?.has(b.id)).length;
  return { done, total: Math.max(1, done + ahead) };
}
