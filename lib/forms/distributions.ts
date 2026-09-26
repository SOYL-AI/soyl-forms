import { OTHER_OPTION_ID, type AnswerValue, type Block } from "@/types/forms";

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

export interface NpsStat {
  /** −100 … 100, or null with no answers. */
  score: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
}

export interface RankingStat {
  /** Options sorted best-first by average position (1 = top). */
  options: Array<{ id: string; label: string; averagePosition: number | null }>;
  total: number;
}

export interface MatrixStat {
  columns: Array<{ id: string; label: string }>;
  rows: Array<{ id: string; label: string; counts: number[]; total: number }>;
}

/** Per-option response counts for choice + yes/no blocks. */
export function choiceDistribution(
  block: Block,
  answers: Array<Record<string, AnswerValue>>,
): ChoiceStat[] | null {
  if (block.type === "yes_no") {
    let yes = 0;
    let no = 0;
    for (const a of answers) {
      const v = a[block.id];
      if (v?.type === "yes_no") {
        if (v.value === "yes") yes += 1;
        else if (v.value === "no") no += 1;
      }
    }
    return [
      { optionId: "yes", label: "Yes", count: yes },
      { optionId: "no", label: "No", count: no },
    ];
  }
  if (
    block.type !== "single_choice" &&
    block.type !== "multiple_choice" &&
    block.type !== "dropdown"
  ) {
    return null;
  }
  const counts = new Map(block.options.map((o) => [o.id, 0]));
  let other = 0;
  for (const a of answers) {
    const v = a[block.id];
    if (!v) continue;
    if (
      (v.type === "single_choice" || v.type === "dropdown") &&
      typeof v.value === "string"
    ) {
      if (v.value === OTHER_OPTION_ID) other += 1;
      else counts.set(v.value, (counts.get(v.value) ?? 0) + 1);
    } else if (v.type === "multiple_choice" && Array.isArray(v.value)) {
      for (const id of v.value) {
        if (id === OTHER_OPTION_ID) other += 1;
        else counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }
  const stats = block.options.map((o) => ({
    optionId: o.id,
    label: o.label,
    count: counts.get(o.id) ?? 0,
  }));
  if (block.allowOther || other > 0) {
    stats.push({ optionId: OTHER_OPTION_ID, label: "Other", count: other });
  }
  return stats;
}

/** Average + per-value counts for rating / opinion-scale / number blocks. */
export function numericDistribution(
  block: Block,
  answers: Array<Record<string, AnswerValue>>,
): NumericStat | null {
  if (
    block.type !== "rating" &&
    block.type !== "opinion_scale" &&
    block.type !== "number" &&
    block.type !== "nps"
  ) {
    return null;
  }
  const values: number[] = [];
  for (const a of answers) {
    const v = a[block.id];
    if (
      v &&
      (v.type === "rating" || v.type === "opinion_scale" || v.type === "number" || v.type === "nps") &&
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

/** Row × column counts for grid questions. */
export function matrixDistribution(
  block: Block,
  answers: Array<Record<string, AnswerValue>>,
): MatrixStat | null {
  if (block.type !== "matrix") return null;
  const colIndex = new Map(block.columns.map((c, i) => [c.id, i]));
  const rows = block.rows.map((r) => ({
    id: r.id,
    label: r.label,
    counts: block.columns.map(() => 0),
    total: 0,
  }));
  const rowIndex = new Map(block.rows.map((r, i) => [r.id, i]));
  for (const a of answers) {
    const v = a[block.id];
    if (!v || v.type !== "matrix") continue;
    for (const [rowId, pick] of Object.entries(v.value)) {
      const ri = rowIndex.get(rowId);
      if (ri === undefined) continue;
      const row = rows[ri] as (typeof rows)[number];
      for (const colId of Array.isArray(pick) ? pick : [pick]) {
        const ci = colIndex.get(colId);
        if (ci === undefined) continue;
        row.counts[ci] = (row.counts[ci] ?? 0) + 1;
        row.total += 1;
      }
    }
  }
  return { columns: block.columns.map((c) => ({ id: c.id, label: c.label })), rows };
}

/** NPS = % promoters (9–10) − % detractors (0–6), rounded to a whole number. */
export function npsScore(block: Block, answers: Array<Record<string, AnswerValue>>): NpsStat | null {
  if (block.type !== "nps") return null;
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const a of answers) {
    const v = a[block.id];
    if (!v || v.type !== "nps") continue;
    if (v.value >= 9) promoters += 1;
    else if (v.value >= 7) passives += 1;
    else detractors += 1;
  }
  const total = promoters + passives + detractors;
  return {
    score: total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null,
    promoters,
    passives,
    detractors,
    total,
  };
}

/** Average rank per option (1 = ranked first), best first. */
export function rankingDistribution(block: Block, answers: Array<Record<string, AnswerValue>>): RankingStat | null {
  if (block.type !== "ranking") return null;
  const sums = new Map(block.options.map((o) => [o.id, 0]));
  let total = 0;
  for (const a of answers) {
    const v = a[block.id];
    if (!v || v.type !== "ranking") continue;
    total += 1;
    v.value.forEach((id, i) => {
      if (sums.has(id)) sums.set(id, (sums.get(id) ?? 0) + i + 1);
    });
  }
  const options = block.options
    .map((o) => ({
      id: o.id,
      label: o.label,
      averagePosition: total > 0 ? Math.round(((sums.get(o.id) ?? 0) / total) * 10) / 10 : null,
    }))
    .sort((x, y) => (x.averagePosition ?? 99) - (y.averagePosition ?? 99));
  return { options, total };
}
