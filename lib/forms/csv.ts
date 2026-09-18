import type { AnswerValue, Block } from "@/types/forms";
import { isAnswerable } from "./logic";

export interface CsvRow {
  id: string;
  submitted_at: string;
  answers: Record<string, AnswerValue>;
}

function optionLabel(block: Block, id: string): string {
  if (
    block.type === "single_choice" ||
    block.type === "multiple_choice" ||
    block.type === "dropdown"
  ) {
    return block.options.find((o) => o.id === id)?.label ?? id;
  }
  return id;
}

function cell(block: Block, answer: AnswerValue | undefined): string {
  if (!answer) return "";
  switch (answer.type) {
    case "short_text":
    case "long_text":
    case "email":
    case "phone":
    case "url":
    case "date":
      return answer.value;
    case "number":
    case "rating":
    case "opinion_scale":
      return String(answer.value);
    case "single_choice":
    case "dropdown":
      return optionLabel(block, answer.value);
    case "yes_no":
      return answer.value === "yes" ? "Yes" : "No";
    case "multiple_choice":
      return answer.value.map((id) => optionLabel(block, id)).join("; ");
    case "file_upload":
      return answer.value.join("; ");
    default:
      return "";
  }
}

function escape(value: string): string {
  return /["\n,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Flatten submissions to CSV. One column per answerable question (in form
 * order), human-readable labels for choices. Matches the on-screen response
 * data — the export test pins this.
 */
export function submissionsToCsv(blocks: Block[], rows: CsvRow[]): string {
  const answerable = blocks.filter((b) => isAnswerable(b.type));
  const seen = new Map<string, number>();
  const headers = ["submission_id", "submitted_at"];
  for (const b of answerable) {
    const n = (seen.get(b.title) ?? 0) + 1;
    seen.set(b.title, n);
    headers.push(n > 1 ? `${b.title} (${n})` : b.title);
  }
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    const cols = [row.id, row.submitted_at];
    for (const b of answerable) {
      cols.push(cell(b, row.answers[b.id]));
    }
    lines.push(cols.map(escape).join(","));
  }
  // BOM so Excel opens UTF-8 correctly.
  return `﻿${lines.join("\n")}\n`;
}
