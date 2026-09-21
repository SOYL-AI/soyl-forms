import type { AnswerValue, Block } from "@/types/forms";
import { displayAnswer } from "./answers";
import { isAnswerable } from "./logic";

export interface CsvRow {
  id: string;
  submitted_at: string;
  answers: Record<string, AnswerValue>;
}

function escape(value: string): string {
  return /["\n,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Flatten submissions to CSV. One column per answerable question (in form
 * order; grid questions expand to one column per row), human-readable
 * labels for choices. Matches the on-screen response data — the export
 * test pins this.
 */
export function submissionsToCsv(blocks: Block[], rows: CsvRow[]): string {
  const answerable = blocks.filter((b) => isAnswerable(b.type));
  const seen = new Map<string, number>();
  const headers = ["submission_id", "submitted_at"];
  const columns: Array<(answers: Record<string, AnswerValue>) => string> = [];

  const uniqueTitle = (title: string): string => {
    const n = (seen.get(title) ?? 0) + 1;
    seen.set(title, n);
    return n > 1 ? `${title} (${n})` : title;
  };

  for (const b of answerable) {
    if (b.type === "matrix") {
      for (const row of b.rows) {
        headers.push(uniqueTitle(`${b.title} — ${row.label}`));
        columns.push((answers) => {
          const a = answers[b.id];
          if (!a || a.type !== "matrix") return "";
          const colId = a.value[row.id];
          return colId ? (b.columns.find((c) => c.id === colId)?.label ?? colId) : "";
        });
      }
      continue;
    }
    headers.push(uniqueTitle(b.title));
    columns.push((answers) => displayAnswer(b, answers[b.id]));
  }

  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    const cols = [row.id, row.submitted_at, ...columns.map((fn) => fn(row.answers))];
    lines.push(cols.map(escape).join(","));
  }
  // BOM so Excel opens UTF-8 correctly.
  return `﻿${lines.join("\n")}\n`;
}
