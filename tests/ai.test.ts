import { describe, expect, it } from "vitest";
import { buildStarterSchema } from "@/lib/forms/builder";
import { formSchemaV1, formThemeSchema } from "@/lib/forms/schema";
import { AI_COST_PER_DRAFT, AI_COST_PER_BRAND_EXTRACTION, AI_CREDIT_PACKS, AI_FREE_MONTHLY_CREDITS, PLANS } from "@/lib/plans";
import {
  buildFormPrompt,
  buildUserPrompt,
  extractJson,
  parseGeneratedSchema,
  parseGeneratedSettings,
  parseGeneratedTheme,
} from "@/lib/ai/generate";
import { aiProvider } from "@/lib/ai/client";

describe("AI draft pipeline", () => {
  it("extracts JSON from fenced model output", () => {
    const schema = buildStarterSchema("T");
    const raw = "Here you go:\n```json\n" + JSON.stringify(schema) + "\n```";
    expect(extractJson(raw)).toEqual(schema);
  });

  it("rejects non-JSON output with a safe message", () => {
    expect(() => extractJson("sorry, no")).toThrow("did not return JSON");
  });

  it("validates and normalizes a generated draft, repairing ids and logic references", () => {
    const schema = buildStarterSchema("Hackathon");
    const { schema: clean, logicDropped } = parseGeneratedSchema({
      ...schema,
      blocks: [
        ...schema.blocks,
        { id: "bad id!!", type: "short_text", title: "Q" },
        {
          id: "Team Size?",
          type: "single_choice",
          title: "Team",
          options: [
            { id: "just me", label: "Just me" },
            { id: "2-4", label: "2–4" },
          ],
        },
      ],
      logic: [
        { id: "r1", when: { questionId: "Team Size?", operator: "equals", value: "just me" }, then: { action: "goto", blockId: schema.blocks[2]?.id } },
      ],
    });
    expect(formSchemaV1.safeParse(clean).success).toBe(true);
    expect(logicDropped).toBe(false);
    for (const b of clean.blocks) expect(b.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    const rule = clean.logic[0];
    expect(rule?.when.questionId).toBe("Team_Size_");
    expect(rule?.when.value).toBe("just_me");
  });

  it("drops logic that points at missing blocks instead of failing", () => {
    const schema = buildStarterSchema("X");
    const { logicDropped, schema: clean } = parseGeneratedSchema({
      ...schema,
      logic: [{ id: "r1", when: { questionId: "nope", operator: "answered" }, then: { action: "goto", blockId: "alsono" } }],
    });
    expect(logicDropped).toBe(true);
    expect(clean.logic).toEqual([]);
  });

  it("accepts new block types from the model", () => {
    const schema = buildStarterSchema("Grid");
    const { schema: clean } = parseGeneratedSchema({
      ...schema,
      blocks: [
        ...schema.blocks.slice(0, -1),
        { id: "grid", type: "matrix", title: "Rate", rows: [{ id: "a", label: "A" }], columns: [{ id: "x", label: "X" }, { id: "y", label: "Y" }] },
        { id: "ok", type: "legal", title: "Consent", acceptLabel: "I agree", linkUrl: null },
        { id: "t", type: "time", title: "When" },
        schema.blocks[schema.blocks.length - 1],
      ],
    });
    expect(clean.blocks.map((b) => b.type)).toContain("matrix");
    expect(clean.blocks.map((b) => b.type)).toContain("legal");
  });

  it("caps oversized drafts", () => {
    const schema = buildStarterSchema("Big");
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `q${i}`, type: "short_text", title: `Q${i}` }));
    const { schema: clean } = parseGeneratedSchema({ ...schema, blocks: [...schema.blocks, ...many] });
    expect(clean.blocks.length).toBeLessThanOrEqual(30);
  });

  it("parses themes with contrast repair and prefers a brand kit when present", () => {
    const t = parseGeneratedTheme({ background: "#ffffff", text: "#eeeeee", accent: "#0e7c5b", headingFont: "fraunces", bodyFont: "inter", radius: "lg", buttonStyle: "pill" });
    expect(formThemeSchema.safeParse(t).success).toBe(true);
    expect(t.text).not.toBe("#eeeeee");
    const garbage = parseGeneratedTheme({ background: "blue" });
    expect(formThemeSchema.safeParse(garbage).success).toBe(true);
    expect(parseGeneratedSettings({ autoAdvance: false, buttonLabelSubmit: "Send" })).toEqual({ autoAdvance: false, showProgress: true, buttonLabelSubmit: "Send" });
  });

  it("builds prompts that mention the schema and the brand", () => {
    expect(buildFormPrompt()).toContain("schemaVersion");
    expect(buildFormPrompt()).toContain("matrix");
    const u = buildUserPrompt({ description: "Feedback form for a café", length: "short", language: "Hindi" });
    expect(u).toContain("3–5 questions");
    expect(u).toContain("Hindi");
  });

  it("prices generation in whole credits with sane packs and plan allowances", () => {
    expect(AI_COST_PER_DRAFT).toBe(1);
    expect(AI_COST_PER_BRAND_EXTRACTION).toBeGreaterThan(AI_COST_PER_DRAFT);
    expect(AI_FREE_MONTHLY_CREDITS).toBe(PLANS.free.entitlements.aiCreditsMonthly);
    expect(PLANS.pro.entitlements.aiCreditsMonthly).toBeGreaterThan(PLANS.starter.entitlements.aiCreditsMonthly);
    const ids = new Set(AI_CREDIT_PACKS.map((p) => p.id));
    expect(ids.size).toBe(AI_CREDIT_PACKS.length);
    for (const p of AI_CREDIT_PACKS) {
      expect(p.credits).toBeGreaterThan(0);
      expect(p.paise).toBeGreaterThan(0);
    }
  });

  it("recognizes the anthropic provider switch", () => {
    process.env.AI_PROVIDER = "anthropic";
    expect(aiProvider()).toBe("anthropic");
    process.env.AI_PROVIDER = "claude";
    expect(aiProvider()).toBe("anthropic");
    delete process.env.AI_PROVIDER;
    expect(aiProvider()).toBe("openai");
  });
});
