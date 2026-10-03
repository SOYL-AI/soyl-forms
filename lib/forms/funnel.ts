/**
 * Drop-off funnel. Pure and client-safe: the responses page feeds it visit
 * progress (last question each session reached) plus completion counts.
 */

export interface FunnelStep {
  id: string;
  label: string;
  /** Sessions that reached at least this question (completions count as reaching all). */
  reached: number;
}

export interface Funnel {
  started: number;
  completed: number;
  abandoned: number;
  steps: FunnelStep[];
}

/**
 * Totalling rule: every completion reached every step; an incomplete visit
 * reached its last question and everything before it. Visits with no
 * progress sit at the first step.
 */
export function computeFunnel(args: {
  /** Answerable question ids in form order. */
  order: string[];
  labels: Record<string, string>;
  /** Last question reached per INCOMPLETE visit. */
  lastBlocks: Array<string | null>;
  completions: number;
}): Funnel {
  const indexOf = new Map(args.order.map((id, i) => [id, i]));
  const perStep = args.order.map(() => 0);
  for (const last of args.lastBlocks) {
    const idx = last ? (indexOf.get(last) ?? -1) : -1;
    const upto = idx >= 0 ? idx : 0;
    for (let i = 0; i <= upto && i < perStep.length; i++) perStep[i] += 1;
  }
  const steps = args.order.map((id, i) => ({
    id,
    label: args.labels[id] ?? id,
    reached: (perStep[i] ?? 0) + args.completions,
  }));
  const started = args.lastBlocks.length + args.completions;
  return {
    started,
    completed: args.completions,
    abandoned: args.lastBlocks.length,
    steps,
  };
}
