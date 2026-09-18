import type { Answers, FormSchemaV1 } from "@/types/forms";

type Schema = Pick<FormSchemaV1, "blocks" | "logic">;

function ruleMatches(
  rule: Schema["logic"][number],
  answers: Answers,
): boolean {
  const answer = answers[rule.when.questionId];
  if (!answer) return false;
  switch (rule.when.operator) {
    case "answered":
      return true;
    case "equals":
      if (typeof rule.when.value === "string") {
        return (
          ("value" in answer && answer.value === rule.when.value) ||
          (answer.type === "multiple_choice" &&
            Array.isArray(answer.value) &&
            answer.value.includes(rule.when.value))
        );
      }
      return false;
    case "not_equals":
      return (
        typeof rule.when.value === "string" &&
        "value" in answer &&
        answer.value !== rule.when.value
      );
    case "contains":
      if (answer.type === "multiple_choice" && Array.isArray(answer.value)) {
        return typeof rule.when.value === "string"
          ? answer.value.includes(rule.when.value)
          : false;
      }
      if (
        (answer.type === "short_text" || answer.type === "long_text") &&
        typeof answer.value === "string" &&
        typeof rule.when.value === "string"
      ) {
        return answer.value
          .toLowerCase()
          .includes(rule.when.value.toLowerCase());
      }
      return false;
    default:
      return false;
  }
}

/**
 * Resolve the next block id after `currentId`, honoring conditional jumps.
 * Falls back to linear order. Returns null when the form is complete.
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
    // Never jump backwards into an infinite loop or to self.
    if (target !== currentId && order.includes(target)) return target;
  }

  const next = order[currentIndex + 1];
  if (!next) return null;
  if (schema.blocks[currentIndex + 1]?.type === "thank_you") return next;
  return next;
}

/** Blocks that collect an answer (used for progress + counts). */
export function isAnswerable(type: string): boolean {
  return (
    type !== "welcome" && type !== "statement" && type !== "thank_you"
  );
}
