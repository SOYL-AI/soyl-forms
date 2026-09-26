import type { Answers, Block } from "@/types/forms";
import { displayAnswer } from "./answers";

/**
 * Answer recall ("piping"): `{{blockId}}` in a title or description is
 * replaced with the respondent's earlier answer to that question.
 */
const TOKEN = /\{\{\s*([A-Za-z0-9_-]{1,64})\s*\}\}/g;

export function recallToken(blockId: string): string {
  return `{{${blockId}}}`;
}

export function hasRecall(text: string | undefined): boolean {
  return !!text && /\{\{\s*[A-Za-z0-9_-]{1,64}\s*\}\}/.test(text);
}

/**
 * Fill tokens with answers. Unanswered or unknown references become
 * `fallback` (empty by default) and the surrounding whitespace is tidied, so
 * "Thanks, {{name}}!" reads "Thanks!" rather than "Thanks, !".
 */
export function recallText(
  text: string,
  blocks: Block[],
  answers: Answers,
  fallback = "",
): string {
  if (!hasRecall(text)) return text;
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const filled = text.replace(TOKEN, (_m, id: string) => {
    const block = byId.get(id);
    const value = block ? displayAnswer(block, answers[id]) : "";
    return value || fallback;
  });
  return filled
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/,(\s*[.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Builder display: tokens shown as the referenced question's title. */
export function recallLabels(text: string, blocks: Block[]): string {
  if (!hasRecall(text)) return text;
  const byId = new Map(blocks.map((b) => [b.id, b]));
  return text.replace(TOKEN, (_m, id: string) => {
    const title = byId.get(id)?.title;
    return title ? `[${title.length > 32 ? `${title.slice(0, 31)}…` : title}]` : "[deleted question]";
  });
}
