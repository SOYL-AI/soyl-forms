"use client";

import { Plus, Trash2 } from "lucide-react";
import type { Block, LogicOperator, LogicRule } from "@/types/forms";
import { BLOCK_TYPE_LABELS, newBlockId } from "@/lib/forms/builder";
import { supportsNumericRules } from "@/lib/forms/logic";
import { Select } from "@/components/ui/input";
import { Input } from "@/components/ui/input";

const OPERATOR_LABELS: Record<LogicOperator, string> = {
  equals: "is",
  not_equals: "is not",
  contains: "contains",
  answered: "is answered",
  not_answered: "is skipped",
  greater_than: "is greater than",
  less_than: "is less than",
};

function operatorsFor(block: Block): LogicOperator[] {
  switch (block.type) {
    case "single_choice":
    case "dropdown":
    case "yes_no":
    case "legal":
      return ["equals", "not_equals", "answered", "not_answered"];
    case "multiple_choice":
      return ["contains", "not_equals", "answered", "not_answered"];
    case "rating":
    case "opinion_scale":
    case "number":
      return ["equals", "greater_than", "less_than", "answered", "not_answered"];
    case "short_text":
    case "long_text":
    case "email":
    case "phone":
    case "url":
      return ["contains", "equals", "answered", "not_answered"];
    default:
      return ["answered", "not_answered"];
  }
}

function needsValue(op: LogicOperator): boolean {
  return op !== "answered" && op !== "not_answered";
}

/** Per-question branching: ordered rules, first match wins, else next in order. */
export function LogicEditor({
  block,
  blocks,
  rules,
  onChange,
}: {
  block: Block;
  blocks: Block[];
  /** Rules whose `when.questionId` is this block. */
  rules: LogicRule[];
  onChange: (rules: LogicRule[]) => void;
}) {
  const ops = operatorsFor(block);
  const targets = blocks.filter((b) => b.id !== block.id);
  const choiceOptions =
    block.type === "single_choice" || block.type === "multiple_choice" || block.type === "dropdown"
      ? block.options
      : block.type === "yes_no"
        ? [
            { id: "yes", label: "Yes" },
            { id: "no", label: "No" },
          ]
        : block.type === "legal"
          ? [{ id: "accepted", label: "Accepted" }]
          : null;

  function update(id: string, patch: Partial<LogicRule["when"]> & { target?: string }) {
    onChange(
      rules.map((r) =>
        r.id === id
          ? {
              ...r,
              when: { ...r.when, ...("operator" in patch || "value" in patch ? patch : {}) },
              then: patch.target ? { action: "goto", blockId: patch.target } : r.then,
            }
          : r,
      ),
    );
  }

  function add() {
    const firstTarget = targets[Math.min(targets.length - 1, blocks.findIndex((b) => b.id === block.id) + 1)] ?? targets[0];
    if (!firstTarget) return;
    const op = ops[0] as LogicOperator;
    onChange([
      ...rules,
      {
        id: newBlockId("r"),
        when: {
          questionId: block.id,
          operator: op,
          value: needsValue(op) ? (choiceOptions?.[0]?.id ?? "") : undefined,
        },
        then: { action: "goto", blockId: firstTarget.id },
      },
    ]);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink-soft">Logic jumps</p>
        <button
          type="button"
          onClick={add}
          disabled={targets.length === 0}
          className="inline-flex items-center gap-1 text-xs font-semibold text-ink underline underline-offset-2 disabled:opacity-50"
        >
          <Plus className="h-3 w-3" /> Add rule
        </button>
      </div>
      {rules.length === 0 ? (
        <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
          Respondents continue to the next question. Add a rule to branch based on the answer.
        </p>
      ) : (
        <ol className="mt-2 flex flex-col gap-2">
          {rules.map((r, i) => (
            <li key={r.id} className="rounded-xl border border-line bg-paper-deep/40 p-2.5">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                <span>{i === 0 ? "If" : "Else if"} answer</span>
                <span className="flex-1" />
                <button
                  type="button"
                  aria-label="Remove rule"
                  onClick={() => onChange(rules.filter((x) => x.id !== r.id))}
                  className="rounded p-1 text-ink-faint hover:bg-ink/5 hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-1.5 grid gap-1.5">
                <Select
                  aria-label="Condition"
                  value={r.when.operator}
                  onChange={(e) => {
                    const op = e.target.value as LogicOperator;
                    update(r.id, {
                      operator: op,
                      value: needsValue(op) ? (r.when.value ?? choiceOptions?.[0]?.id ?? "") : undefined,
                    });
                  }}
                  className="!py-1.5 text-xs"
                >
                  {ops.map((op) => (
                    <option key={op} value={op}>
                      {OPERATOR_LABELS[op]}
                    </option>
                  ))}
                </Select>
                {needsValue(r.when.operator) &&
                  (choiceOptions && !supportsNumericRules(block.type) ? (
                    <Select
                      aria-label="Value"
                      value={typeof r.when.value === "string" ? r.when.value : ""}
                      onChange={(e) => update(r.id, { value: e.target.value })}
                      className="!py-1.5 text-xs"
                    >
                      {choiceOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      aria-label="Value"
                      type={supportsNumericRules(block.type) ? "number" : "text"}
                      value={typeof r.when.value === "string" ? r.when.value : ""}
                      onChange={(e) => update(r.id, { value: e.target.value })}
                      placeholder={supportsNumericRules(block.type) ? "e.g. 3" : "text to match"}
                      className="!py-1.5 text-xs"
                    />
                  ))}
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    go to
                  </span>
                  <Select
                    aria-label="Jump to"
                    value={r.then.blockId}
                    onChange={(e) => update(r.id, { target: e.target.value })}
                    className="!py-1.5 text-xs"
                  >
                    {targets.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title.replace(/\{\{\s*[A-Za-z0-9_-]+\s*\}\}/g, "…").slice(0, 60) || BLOCK_TYPE_LABELS[b.type]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
