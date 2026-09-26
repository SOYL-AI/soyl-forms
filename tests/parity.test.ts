import { describe, expect, it } from "vitest";
import { formSchemaV1, formSettingsSchema } from "@/lib/forms/schema";
import { displayAnswer, validateAnswers } from "@/lib/forms/answers";
import { recallLabels, recallText } from "@/lib/forms/recall";
import { publicSchema, scoreAnswers } from "@/lib/forms/quiz";
import { matrixDistribution, npsScore, rankingDistribution } from "@/lib/forms/distributions";
import { submissionsToCsv } from "@/lib/forms/csv";
import { createBlock } from "@/lib/forms/builder";
import { getNextBlockId } from "@/lib/forms/logic";
import { parseGeneratedSchema, parseGeneratedSettings } from "@/lib/ai/generate";
import type { Answers, Block, ChoiceBlock, FormSchemaV1 } from "@/types/forms";

const name: Block = { id: "name", type: "short_text", title: "Your name?", required: true };
const capital: Block = {
  id: "capital",
  type: "single_choice",
  title: "Capital of France?",
  required: true,
  options: [
    { id: "paris", label: "Paris", imageUrl: "https://example.com/paris.jpg" },
    { id: "rome", label: "Rome" },
  ],
  quiz: { correct: ["paris"], points: 2 },
};
const primes: Block = {
  id: "primes",
  type: "multiple_choice",
  title: "Pick the primes",
  options: [
    { id: "two", label: "2" },
    { id: "three", label: "3" },
    { id: "four", label: "4" },
  ],
  quiz: { correct: ["two", "three"] },
};
const city: Block = { id: "city", type: "short_text", title: "Largest city in India?", quiz: { correct: ["Mumbai", "Bombay"] } };
const rank: Block = {
  id: "rank",
  type: "ranking",
  title: "Rank these",
  required: true,
  options: [
    { id: "a", label: "Price" },
    { id: "b", label: "Quality" },
    { id: "c", label: "Speed" },
  ],
};
const nps: Block = { id: "nps", type: "nps", title: "Recommend us?", required: true };
const grid: Block = {
  id: "grid",
  type: "matrix",
  title: "Which apply?",
  required: true,
  multiple: true,
  rows: [
    { id: "r1", label: "Mon" },
    { id: "r2", label: "Tue" },
  ],
  columns: [
    { id: "am", label: "Morning" },
    { id: "pm", label: "Evening" },
  ],
};

const schema: FormSchemaV1 = {
  schemaVersion: 1,
  title: "Parity",
  blocks: [
    name,
    capital,
    primes,
    city,
    rank,
    nps,
    grid,
    { id: "thanks", type: "thank_you", title: "Thanks, {{name}}!" },
  ],
  logic: [],
};

describe("schema", () => {
  it("accepts ranking, NPS, checkbox grids, picture options and quiz keys", () => {
    expect(formSchemaV1.safeParse(schema).success).toBe(true);
    expect(formSettingsSchema.safeParse({ quizMode: true, showScore: false }).success).toBe(true);
  });

  it("gives new blocks valid defaults", () => {
    for (const t of ["ranking", "nps"] as const) {
      const s = { ...schema, blocks: [createBlock(t)] };
      expect(formSchemaV1.safeParse(s).success).toBe(true);
    }
  });
});

describe("answer validation", () => {
  const base: Answers = {
    name: { type: "short_text", value: "Ada" },
    capital: { type: "single_choice", value: "paris" },
    rank: { type: "ranking", value: ["b", "a", "c"] },
    nps: { type: "nps", value: 9 },
    grid: { type: "matrix", value: { r1: ["am", "pm"], r2: ["pm"] } },
  };

  it("accepts a complete, valid response", () => {
    expect(validateAnswers(schema, base).ok).toBe(true);
  });

  it("requires ranking to be a full permutation", () => {
    const r = validateAnswers(schema, { ...base, rank: { type: "ranking", value: ["a", "a", "c"] } });
    expect(r.ok).toBe(false);
    const short = validateAnswers(schema, { ...base, rank: { type: "ranking", value: ["a", "b"] } });
    expect(short.ok).toBe(false);
  });

  it("keeps NPS within 0–10", () => {
    expect(validateAnswers(schema, { ...base, nps: { type: "nps", value: 11 } }).ok).toBe(false);
    expect(validateAnswers(schema, { ...base, nps: { type: "nps", value: 0 } }).ok).toBe(true);
  });

  it("checkbox grid wants lists and every row when required", () => {
    expect(validateAnswers(schema, { ...base, grid: { type: "matrix", value: { r1: "am", r2: ["pm"] } } }).ok).toBe(false);
    expect(validateAnswers(schema, { ...base, grid: { type: "matrix", value: { r1: ["am"] } } }).ok).toBe(false);
  });

  it("renders readable answers", () => {
    expect(displayAnswer(rank, base.rank)).toBe("1. Quality; 2. Price; 3. Speed");
    expect(displayAnswer(grid, base.grid)).toBe("Mon: Morning, Evening; Tue: Evening");
  });
});

describe("recall", () => {
  it("fills earlier answers and tidies empty ones", () => {
    const answers: Answers = { name: { type: "short_text", value: "Ada" } };
    expect(recallText("Thanks, {{name}}!", schema.blocks, answers)).toBe("Thanks, Ada!");
    expect(recallText("Thanks, {{name}}!", schema.blocks, {})).toBe("Thanks!");
    expect(recallText("No tokens here.", schema.blocks, {})).toBe("No tokens here.");
  });

  it("labels tokens for the builder", () => {
    expect(recallLabels("Hi {{name}}", schema.blocks)).toBe("Hi [Your name?]");
    expect(recallLabels("Hi {{gone}}", schema.blocks)).toBe("Hi [deleted question]");
  });
});

describe("quiz", () => {
  it("scores choices, exact multi-select sets and case-insensitive text", () => {
    const answers: Answers = {
      capital: { type: "single_choice", value: "paris" },
      primes: { type: "multiple_choice", value: ["three", "two"] },
      city: { type: "short_text", value: "  bombay " },
    };
    expect(scoreAnswers(schema, answers)).toMatchObject({ points: 4, max: 4 });
    const partial = scoreAnswers(schema, { ...answers, primes: { type: "multiple_choice", value: ["two"] } });
    expect(partial).toMatchObject({ points: 3, max: 4 });
  });

  it("never sends answer keys to respondents", () => {
    const pub = publicSchema(schema);
    expect(JSON.stringify(pub)).not.toContain('"quiz"');
    expect(pub.blocks).toHaveLength(schema.blocks.length);
    expect(schema.blocks.find((b) => b.id === "capital")?.quiz).toBeDefined();
  });
});

describe("analytics", () => {
  const maps = [
    { nps: { type: "nps", value: 10 }, rank: { type: "ranking", value: ["a", "b", "c"] } },
    { nps: { type: "nps", value: 9 }, rank: { type: "ranking", value: ["a", "c", "b"] } },
    { nps: { type: "nps", value: 8 }, rank: { type: "ranking", value: ["b", "a", "c"] } },
    { nps: { type: "nps", value: 3 }, rank: { type: "ranking", value: ["c", "a", "b"] } },
  ] as Answers[];

  it("computes NPS as promoters minus detractors", () => {
    expect(npsScore(nps, maps)).toMatchObject({ score: 25, promoters: 2, passives: 1, detractors: 1, total: 4 });
  });

  it("orders ranking options by average position", () => {
    const r = rankingDistribution(rank, maps);
    expect(r?.options[0]).toMatchObject({ id: "a", averagePosition: 1.5 });
  });

  it("counts every pick in a checkbox grid", () => {
    const m = matrixDistribution(grid, [{ grid: { type: "matrix", value: { r1: ["am", "pm"] } } }]);
    expect(m?.rows[0]?.counts).toEqual([1, 1]);
  });

  it("exports checkbox grids to CSV", () => {
    const csv = submissionsToCsv([grid], [
      { id: "s1", submitted_at: "2026-01-01", answers: { grid: { type: "matrix", value: { r1: ["am", "pm"] } } } },
    ]);
    expect(csv).toContain("Morning; Evening");
  });

  it("lets logic branch on NPS", () => {
    const s: FormSchemaV1 = {
      ...schema,
      blocks: [nps, name, { id: "thanks", type: "thank_you", title: "Thanks" }],
      logic: [{ id: "low", when: { questionId: "nps", operator: "less_than", value: "7" }, then: { action: "goto", blockId: "thanks" } }],
    };
    expect(getNextBlockId(s, "nps", { nps: { type: "nps", value: 3 } })).toBe("thanks");
    expect(getNextBlockId(s, "nps", { nps: { type: "nps", value: 9 } })).toBe("name");
  });
});

describe("AI drafts", () => {
  it("keeps quiz keys and recall tokens pointing at repaired ids", () => {
    const { schema: out } = parseGeneratedSchema({
      schemaVersion: 1,
      title: "Quiz",
      blocks: [
        { id: "first name", type: "short_text", title: "Name?" },
        {
          id: "q1",
          type: "single_choice",
          title: "Hi {{first name}}, 2+2?",
          options: [
            { id: "opt four", label: "4" },
            { id: "five", label: "5" },
          ],
          quiz: { correct: ["opt four"] },
        },
      ],
      logic: [],
    });
    const q1 = out.blocks[1] as ChoiceBlock;
    expect(q1.title).toBe(`Hi {{${out.blocks[0]?.id}}}, 2+2?`);
    expect(q1.quiz?.correct).toEqual([q1.options[0]?.id]);
    expect(parseGeneratedSettings({ quizMode: true }).quizMode).toBe(true);
  });
});
