import type { AnswerValue, Block } from "@/types/forms";
import { displayAnswer } from "./answers";
import { isAnswerable } from "./logic";
import { recallLabels } from "./recall";

export interface CsvRow {
  id: string;
  submitted_at: string;
  answers: Record<string, AnswerValue>;
  /** Hidden-field values stored with the submission (Typeform parity in exports). */
  hidden?: Record<string, string>;
  /** Response tags, joined with "; " in the export. */
  tags?: string[];
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
  const { headers: questionHeaders, columns } = answerColumns(blocks);
  // Hidden-field columns: union of keys present in any row, sorted. Rows
  // without hidden values keep identical output to before.
  const hiddenKeys = [...new Set(rows.flatMap((r) => Object.keys(r.hidden ?? {})))].sort();
  const hasTags = rows.some((r) => (r.tags ?? []).length > 0);
  const headers = ["submission_id", "submitted_at", ...questionHeaders, ...hiddenKeys, ...(hasTags ? ["tags"] : [])];

  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    const cols = [
      row.id,
      row.submitted_at,
      ...columns.map((fn) => fn(row.answers)),
      ...hiddenKeys.map((k) => row.hidden?.[k] ?? ""),
      ...(hasTags ? [(row.tags ?? []).join("; ")] : []),
    ];
    lines.push(cols.map(escape).join(","));
  }
  // BOM so Excel opens UTF-8 correctly.
  return `﻿${lines.join("\n")}\n`;
}

/**
 * One labelled value per column for a single submission, in form order and
 * formatted exactly like the CSV export. Sent to webhooks as `data.fields`.
 */
export function submissionFields(blocks: Block[], answers: Record<string, AnswerValue>): Array<{ label: string; value: string }> {
  const { headers, columns } = answerColumns(blocks);
  return headers.map((label, i) => ({ label, value: columns[i](answers) }));
}

function answerColumns(blocks: Block[]): {
  headers: string[];
  columns: Array<(answers: Record<string, AnswerValue>) => string>;
} {
  const answerable = blocks.filter((b) => isAnswerable(b.type));
  const seen = new Map<string, number>();
  const headers: string[] = [];
  const columns: Array<(answers: Record<string, AnswerValue>) => string> = [];

  const uniqueTitle = (title: string): string => {
    const n = (seen.get(title) ?? 0) + 1;
    seen.set(title, n);
    return n > 1 ? `${title} (${n})` : title;
  };

  for (const b of answerable) {
    if (b.type === "matrix") {
      for (const row of b.rows) {
        headers.push(uniqueTitle(`${recallLabels(b.title, blocks)} — ${row.label}`));
        columns.push((answers) => {
          const a = answers[b.id];
          if (!a || a.type !== "matrix") return "";
          const pick = a.value[row.id];
          const label = (id: string) => b.columns.find((c) => c.id === id)?.label ?? id;
          if (!pick) return "";
          return Array.isArray(pick) ? pick.map(label).join("; ") : label(pick);
        });
      }
      continue;
    }
    headers.push(uniqueTitle(recallLabels(b.title, blocks)));
    columns.push((answers) => displayAnswer(b, answers[b.id]));
  }
  return { headers, columns };
}
