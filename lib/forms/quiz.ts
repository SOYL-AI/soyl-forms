import type { Answers, Block, FormSchemaV1 } from "@/types/forms";

/** Question types that can carry an answer key. */
export function isGradable(type: Block["type"]): boolean {
  return (
    type === "single_choice" ||
    type === "multiple_choice" ||
    type === "dropdown" ||
    type === "yes_no" ||
    type === "short_text"
  );
}

export interface QuizResult {
  points: number;
  max: number;
  perQuestion: Array<{ id: string; correct: boolean; points: number; max: number }>;
}

function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function isCorrect(block: Block, answers: Answers): boolean {
  const key = block.quiz?.correct ?? [];
  const a = answers[block.id];
  if (!a || key.length === 0) return false;
  switch (a.type) {
    case "single_choice":
    case "dropdown":
    case "yes_no":
      return key.includes(a.value);
    case "multiple_choice": {
      const picked = new Set(a.value);
      return picked.size === key.length && key.every((k) => picked.has(k));
    }
    case "short_text":
      return key.some((k) => normalise(k) === normalise(a.value));
    default:
      return false;
  }
}

/** Grade a response. Only questions with a non-empty answer key count. */
export function scoreAnswers(schema: Pick<FormSchemaV1, "blocks">, answers: Answers): QuizResult {
  const perQuestion: QuizResult["perQuestion"] = [];
  for (const block of schema.blocks) {
    if (!isGradable(block.type) || !block.quiz || block.quiz.correct.length === 0) continue;
    const max = block.quiz.points ?? 1;
    const correct = isCorrect(block, answers);
    perQuestion.push({ id: block.id, correct, points: correct ? max : 0, max });
  }
  return {
    points: perQuestion.reduce((s, q) => s + q.points, 0),
    max: perQuestion.reduce((s, q) => s + q.max, 0),
    perQuestion,
  };
}

/** The schema respondents receive: answer keys removed so they can't be read from the page. */
export function publicSchema<T extends Pick<FormSchemaV1, "blocks">>(schema: T): T {
  return {
    ...schema,
    blocks: schema.blocks.map((b) => {
      if (!b.quiz) return b;
      const { quiz: _omit, ...rest } = b;
      return rest as Block;
    }),
  };
}
