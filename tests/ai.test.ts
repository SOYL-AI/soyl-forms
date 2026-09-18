import { describe, expect, it } from "vitest";
import { buildStarterSchema } from "@/lib/forms/builder";
import { formSchemaV1 } from "@/lib/forms/schema";
import {
  AI_COST_PER_DRAFT,
  AI_CREDIT_PACKS,
  AI_FREE_MONTHLY_CREDITS,
} from "@/lib/plans";
import {
  buildFormPrompt,
  extractJson,
  parseGeneratedSchema,
} from "@/lib/ai/generate";

describe("AI draft pipeline", () => {
  it("extracts JSON from fenced model output", () => {
    const schema = buildStarterSchema("T");
    const raw = "Here you go:\n```json\n" + JSON.stringify(schema) + "\n```";
    expect(extractJson(raw)).toEqual(schema);
  });

  it("rejects non-JSON output with a safe message", () => {
    expect(() => extractJson("sorry, no")).toThrow("did not return JSON");
  });

  it("validates and normalizes a generated draft", () => {
    const schema = buildStarterSchema("Hackathon");
    const { schema: clean, logicDropped } = parseGeneratedSchema({
      ...schema,
      blocks: [...schema.blocks, { id: "bad id!!", type: "short_text", title: "Q" }],
      logic: [
        {
          id: "r1",
          when: { questionId: "nope", operator: "answered" },
          then: { action: "goto", blockId: "alsono" },
        },
      ],
    });
    expect(formSchemaV1.safeParse(clean).success).toBe(true);
    expect(logicDropped).toBe(true);
    expect(clean.logic).toEqual([]);
    for (const b of clean.blocks) {
      expect(b.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    }
  });

  it("caps oversized drafts", () => {
    const schema = buildStarterSchema("Big");
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `q${i}`,
      type: "short_text",
      title: `Q${i}`,
    }));
    const { schema: clean } = parseGeneratedSchema({
      ...schema,
      blocks: [...schema.blocks, ...many],
    });
    expect(clean.blocks.length).toBeLessThanOrEqual(25);
  });

  it("prices generation in whole credits with sane packs", () => {
    expect(AI_COST_PER_DRAFT).toBe(1);
    expect(AI_FREE_MONTHLY_CREDITS).toBeGreaterThan(0);
    const ids = new Set(AI_CREDIT_PACKS.map((p) => p.id));
    expect(ids.size).toBe(AI_CREDIT_PACKS.length);
    for (const p of AI_CREDIT_PACKS) {
      expect(p.credits).toBeGreaterThan(0);
      expect(p.paise).toBeGreaterThan(0);
    }
    expect(buildFormPrompt()).toContain("schemaVersion");
  });
});
