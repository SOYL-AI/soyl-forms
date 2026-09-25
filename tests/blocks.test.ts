import { describe, expect, it } from "vitest";
import { OTHER_OPTION_ID, type Block, type FormSchemaV1 } from "@/types/forms";
import { formSchemaV1, formSettingsSchema, validateLogicGraph } from "@/lib/forms/schema";
import { validateAnswers, displayAnswer } from "@/lib/forms/answers";
import { submissionsToCsv } from "@/lib/forms/csv";
import { choiceDistribution, matrixDistribution } from "@/lib/forms/distributions";
import { getNextBlockId, estimateProgress } from "@/lib/forms/logic";
import { createBlock, duplicateBlock, BLOCK_TYPE_LABELS, BLOCK_TYPE_META } from "@/lib/forms/builder";
import { TEMPLATES } from "@/lib/forms/templates";

const matrix: Block = {
  id: "grid",
  type: "matrix",
  title: "Rate us",
  required: true,
  rows: [
    { id: "r_food", label: "Food" },
    { id: "r_service", label: "Service" },
  ],
  columns: [
    { id: "c_bad", label: "Bad" },
    { id: "c_ok", label: "Okay" },
    { id: "c_great", label: "Great" },
  ],
};
const choice: Block = {
  id: "pick",
  type: "single_choice",
  title: "Pick one",
  required: true,
  allowOther: true,
  options: [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
  ],
};
const consent: Block = { id: "legal", type: "legal", title: "Consent", required: true, acceptLabel: "I agree" };
const time: Block = { id: "when", type: "time", title: "When?", required: false };
const schema: FormSchemaV1 = { schemaVersion: 1, title: "T", blocks: [matrix, choice, consent, time], logic: [] };

describe("new block types", () => {
  it("validate as a schema and create with sane defaults", () => {
    expect(formSchemaV1.safeParse(schema).success).toBe(true);
    for (const type of Object.keys(BLOCK_TYPE_LABELS) as Block["type"][]) {
      const b = createBlock(type);
      expect(formSchemaV1.safeParse({ schemaVersion: 1, title: "x", blocks: [b], logic: [] }).success).toBe(true);
      expect(BLOCK_TYPE_META[type].hint.length).toBeGreaterThan(0);
    }
  });

  it("duplicates grids with fresh row/column ids", () => {
    const copy = duplicateBlock(matrix);
    expect(copy.id).not.toBe(matrix.id);
    if (copy.type === "matrix") {
      expect(copy.rows.map((r) => r.id)).not.toEqual(matrix.type === "matrix" ? matrix.rows.map((r) => r.id) : []);
    }
  });

  it("accepts and rejects matrix / legal / time / other answers", () => {
    const good = {
      grid: { type: "matrix", value: { r_food: "c_great", r_service: "c_ok" } },
      pick: { type: "single_choice", value: OTHER_OPTION_ID, otherText: "Gamma" },
      legal: { type: "legal", value: "accepted" },
      when: { type: "time", value: "14:30" },
    };
    const ok = validateAnswers(schema, good);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.pick).toEqual({ type: "single_choice", value: OTHER_OPTION_ID, otherText: "Gamma" });
    }
    // Missing a required row
    expect(validateAnswers(schema, { ...good, grid: { type: "matrix", value: { r_food: "c_great" } } }).ok).toBe(false);
    // Unknown column
    expect(validateAnswers(schema, { ...good, grid: { type: "matrix", value: { r_food: "c_nope", r_service: "c_ok" } } }).ok).toBe(false);
    // Other without text
    expect(validateAnswers(schema, { ...good, pick: { type: "single_choice", value: OTHER_OPTION_ID } }).ok).toBe(false);
    // Consent not given
    expect(validateAnswers(schema, { ...good, legal: { type: "legal", value: "nope" } }).ok).toBe(false);
    // Bad time
    expect(validateAnswers(schema, { ...good, when: { type: "time", value: "25:99" } }).ok).toBe(false);
  });

  it("renders human-readable answers, CSV columns per grid row, and distributions", () => {
    const answers = {
      grid: { type: "matrix" as const, value: { r_food: "c_great", r_service: "c_ok" } },
      pick: { type: "single_choice" as const, value: OTHER_OPTION_ID, otherText: "Gamma" },
      legal: { type: "legal" as const, value: "accepted" as const },
      when: { type: "time" as const, value: "14:30" },
    };
    expect(displayAnswer(matrix, answers.grid)).toBe("Food: Great; Service: Okay");
    expect(displayAnswer(choice, answers.pick)).toBe("Other: Gamma");
    expect(displayAnswer(consent, answers.legal)).toBe("Accepted");

    const csv = submissionsToCsv(schema.blocks, [{ id: "s1", submitted_at: "2026-09-20T00:00:00.000Z", answers }]);
    const [header, row] = csv.trim().split("\n");
    expect(header).toContain("Rate us — Food");
    expect(header).toContain("Rate us — Service");
    expect(row).toContain("Great");
    expect(row).toContain("Other: Gamma");

    const dist = matrixDistribution(matrix, [answers]);
    expect(dist?.rows[0]?.counts).toEqual([0, 0, 1]);
    const cd = choiceDistribution(choice, [answers]);
    expect(cd?.find((c) => c.optionId === OTHER_OPTION_ID)?.count).toBe(1);
  });
});

describe("logic operators and progress", () => {
  const s: FormSchemaV1 = {
    schemaVersion: 1,
    title: "L",
    blocks: [
      { id: "score", type: "opinion_scale", title: "Score", required: true, min: 0, max: 10 },
      { id: "why", type: "long_text", title: "Why?" },
      { id: "love", type: "long_text", title: "Love?" },
      { id: "end", type: "thank_you", title: "Bye" },
    ],
    logic: [
      { id: "r1", when: { questionId: "score", operator: "greater_than", value: "8" }, then: { action: "goto", blockId: "love" } },
      { id: "r2", when: { questionId: "score", operator: "not_answered" }, then: { action: "goto", blockId: "end" } },
    ],
  };
  it("routes on numeric comparisons and skipped answers", () => {
    expect(getNextBlockId(s, "score", { score: { type: "opinion_scale", value: 9 } })).toBe("love");
    expect(getNextBlockId(s, "score", { score: { type: "opinion_scale", value: 3 } })).toBe("why");
    expect(getNextBlockId(s, "score", {})).toBe("end");
    expect(validateLogicGraph(formSchemaV1.parse(s))).toEqual([]);
  });
  it("estimates progress without lying about branching", () => {
    expect(estimateProgress(s, "why", ["score"])).toEqual({ done: 1, total: 3 });
  });
});

describe("templates", () => {
  it("are all valid, publishable schemas with legible themes", () => {
    const ids = new Set<string>();
    for (const t of TEMPLATES) {
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      const parsed = formSchemaV1.safeParse(t.schema);
      expect(parsed.success, `${t.id} schema`).toBe(true);
      if (parsed.success) expect(validateLogicGraph(parsed.data), `${t.id} logic`).toEqual([]);
      expect(t.schema.blocks.some((b) => !["welcome", "statement", "thank_you"].includes(b.type))).toBe(true);
      if (t.settings) expect(formSettingsSchema.safeParse(t.settings).success).toBe(true);
    }
  });
});

describe("settings schema", () => {
  it("rejects http redirects and bad emails", () => {
    expect(formSettingsSchema.safeParse({ redirectUrl: "http://insecure.example" }).success).toBe(false);
    expect(formSettingsSchema.safeParse({ redirectUrl: "https://ok.example/thanks", notifyEmails: ["a@b.co"] }).success).toBe(true);
    expect(formSettingsSchema.safeParse({ notifyEmails: ["not-an-email"] }).success).toBe(false);
  });
});
