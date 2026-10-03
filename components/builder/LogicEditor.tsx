"use client";

import { Plus, Trash2 } from "lucide-react";
import type { Block, LogicCondition, LogicOperator, LogicRule } from "@/types/forms";
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
    case "slider":
    case "number":
      return ["equals", "greater_than", "less_than", "answered", "not_answered"];
    case "short_text":
    case "long_text":
    case "email":
    case "phone":
    case "url":
      return ["contains", "equals", "answered", "not_answered"];
    case "payment":
    case "address":
    case "signature":
    default:
      return ["answered", "not_answered"];
  }
}

function optionsFor(block: Block): Array<{ id: string; label: string }> | null {
  if (block.type === "single_choice" || block.type === "multiple_choice" || block.type === "dropdown") {
    return block.options;
  }
  if (block.type === "yes_no") return [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }];
  if (block.type === "legal") return [{ id: "accepted", label: "Accepted" }];
  return null;
}

function needsValue(op: LogicOperator): boolean {
  return op !== "answered" && op !== "not_answered";
}

type Action = LogicRule["then"]["action"];

/** One extra condition row on another question. */
function ConditionRow({
  cond,
  index,
  blocks,
  selfId,
  onPatch,
  onRemove,
}: {
  cond: LogicCondition;
  index: number;
  blocks: Block[];
  selfId: string;
  onPatch: (c: LogicCondition) => void;
  onRemove: () => void;
}) {
  const others = blocks.filter((b) => b.id !== selfId);
  const watched = blocks.find((b) => b.id === cond.questionId) ?? others[0];
  const ops = watched ? operatorsFor(watched) : (["answered", "not_answered"] as LogicOperator[]);
  const opts = watched ? optionsFor(watched) : null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
        {index === 0 ? "and/or" : ""}
      </span>
      <Select
        aria-label="Condition question"
        value={cond.questionId}
        onChange={(e) => {
          const next = blocks.find((b) => b.id === e.target.value);
          const op = (next ? operatorsFor(next)[0] : "answered") as LogicOperator;
          onPatch({ questionId: e.target.value, operator: op, value: needsValue(op) ? "" : undefined });
        }}
        className="!py-1.5 text-xs"
      >
        {others.map((b) => (
          <option key={b.id} value={b.id}>
            {(b.title || BLOCK_TYPE_LABELS[b.type]).slice(0, 40)}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Condition operator"
        value={cond.operator}
        onChange={(e) => {
          const op = e.target.value as LogicOperator;
          onPatch({ ...cond, operator: op, value: needsValue(op) ? (cond.value ?? "") : undefined });
        }}
        className="!py-1.5 text-xs"
      >
        {ops.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_LABELS[op]}
          </option>
        ))}
      </Select>
      {needsValue(cond.operator) &&
        (opts && watched && !supportsNumericRules(watched.type) ? (
          <Select
            aria-label="Condition value"
            value={typeof cond.value === "string" ? cond.value : ""}
            onChange={(e) => onPatch({ ...cond, value: e.target.value })}
            className="!py-1.5 text-xs"
          >
            {opts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            aria-label="Condition value"
            type={watched && supportsNumericRules(watched.type) ? "number" : "text"}
            value={typeof cond.value === "string" ? cond.value : ""}
            onChange={(e) => onPatch({ ...cond, value: e.target.value })}
            className="!py-1.5 text-xs"
          />
        ))}
      <button
        type="button"
        aria-label="Remove condition"
        onClick={onRemove}
        className="shrink-0 rounded p-1 text-ink-faint hover:bg-ink/5 hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
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
  const choiceOptions = optionsFor(block);

  function patchRule(id: string, patch: Partial<LogicRule>) {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function patchWhen(id: string, patch: Partial<LogicCondition>) {
    onChange(rules.map((r) => (r.id === id ? { ...r, when: { ...r.when, ...patch } } : r)));
  }

  function setAction(id: string, action: Action, target?: string) {
    onChange(
      rules.map((r) =>
        r.id === id
          ? { ...r, then: action === "end" ? { action } : { action, blockId: target ?? r.then.blockId ?? targets[0]?.id } }
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
          {rules.map((r, i) => {
            const extra = r.conditions ?? [];
            return (
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
                      patchWhen(r.id, {
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
                        onChange={(e) => patchWhen(r.id, { value: e.target.value })}
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
                        onChange={(e) => patchWhen(r.id, { value: e.target.value })}
                        placeholder={supportsNumericRules(block.type) ? "e.g. 3" : "text to match"}
                        className="!py-1.5 text-xs"
                      />
                    ))}
                  {extra.map((c, ci) => (
                    <div key={ci}>
                      {ci === 0 && (
                        <div className="mb-1 flex gap-1">
                          {(["all", "any"] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => patchRule(r.id, { match: m })}
                              aria-pressed={(r.match ?? "all") === m}
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                                (r.match ?? "all") === m ? "bg-ink text-paper" : "bg-ink/5 text-ink-soft"
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      )}
                      <ConditionRow
                        cond={c}
                        index={ci}
                        blocks={blocks}
                        selfId={block.id}
                        onPatch={(nc) =>
                          patchRule(r.id, { conditions: extra.map((x, xi) => (xi === ci ? nc : x)) })
                        }
                        onRemove={() => patchRule(r.id, { conditions: extra.filter((_, xi) => xi !== ci) })}
                      />
                    </div>
                  ))}
                  {extra.length < 5 && (
                    <button
                      type="button"
                      onClick={() => {
                        const first = targets[0] ?? block;
                        const op = operatorsFor(first)[0] as LogicOperator;
                        patchRule(r.id, {
                          match: r.match ?? "all",
                          conditions: [
                            ...extra,
                            { questionId: first.id, operator: op, value: needsValue(op) ? "" : undefined },
                          ],
                        });
                      }}
                      className="justify-self-start text-[11px] font-semibold text-ink underline underline-offset-2"
                    >
                      + Add condition
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <Select
                      aria-label="Action"
                      value={r.then.action}
                      onChange={(e) => setAction(r.id, e.target.value as Action)}
                      className="!py-1.5 text-xs"
                    >
                      <option value="goto">go to</option>
                      <option value="end">finish form</option>
                      <option value="hide">hide</option>
                    </Select>
                    {r.then.action !== "end" && (
                      <Select
                        aria-label={r.then.action === "hide" ? "Hide question" : "Jump to"}
                        value={r.then.blockId ?? ""}
                        onChange={(e) => setAction(r.id, r.then.action, e.target.value)}
                        className="!py-1.5 text-xs"
                      >
                        {targets.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.title.replace(/\{\{\s*[A-Za-z0-9_-]+\s*\}\}/g, "…").slice(0, 60) || BLOCK_TYPE_LABELS[b.type]}
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
