import type { AnswerValue, Block } from "@/types/forms";

export interface ChoiceStat {
  optionId: string;
  label: string;
  count: number;
}

export interface NumericStat {
  average: number | null;
  total: number;
  counts: Array<{ value: number; count: number }>;
}

/** Per-option response counts for choice blocks. */
export function choiceDistribution(
  block: Block,
  answers: Array<Record<string, AnswerValue>>,
): ChoiceStat[] | null {
  if (
    block.type !== "single_choice" &&
    block.type !== "multiple_choice" &&
    block.type !== "dropdown"
  ) {
    return null;
  }
  const counts = new Map(block.options.map((o) => [o.id, 0]));
  for (const a of answers) {
    const v = a[block.id];
    if (!v) continue;
    if (
      (v.type === "single_choice" || v.type === "dropdown") &&
      typeof v.value === "string"
    ) {
      counts.set(v.value, (counts.get(v.value) ?? 0) + 1);
    } else if (v.type === "multiple_choice" && Array.isArray(v.value)) {
      for (const id of v.value) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return block.options.map((o) => ({
    optionId: o.id,
    label: o.label,
    count: counts.get(o.id) ?? 0,
  }));
}

/** Average + per-value counts for rating / opinion-scale blocks. */
export function numericDistribution(
  block: Block,
  answers: Array<Record<string, AnswerValue>>,
): NumericStat | null {
  if (
    block.type !== "rating" &&
    block.type !== "opinion_scale" &&
    block.type !== "number"
  ) {
    return null;
  }
  const values: number[] = [];
  for (const a of answers) {
    const v = a[block.id];
    if (
      v &&
      (v.type === "rating" || v.type === "opinion_scale" || v.type === "number") &&
      typeof v.value === "number"
    ) {
      values.push(v.value);
    }
  }
  const counts = new Map<number, number>();
  for (const n of values) counts.set(n, (counts.get(n) ?? 0) + 1);
  return {
    average:
      values.length > 0
        ? Math.round((values.reduce((s, n) => s + n, 0) / values.length) * 10) / 10
        : null,
    total: values.length,
    counts: [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value - b.value),
  };
}
