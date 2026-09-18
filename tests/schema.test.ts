import { describe, expect, it } from "vitest";
import { formSchemaV1, validateLogicGraph } from "@/lib/forms/schema";
import { demoForm } from "@/lib/forms/demo";

describe("formSchemaV1", () => {
  it("accepts the Phase 1 demo form", () => {
    const parsed = formSchemaV1.safeParse(demoForm);
    expect(parsed.success).toBe(true);
  });

  it("rejects choice blocks with fewer than 2 options", () => {
    const bad = {
      schemaVersion: 1,
      title: "Bad",
      blocks: [
        {
          id: "q1",
          type: "single_choice",
          title: "Pick",
          options: [{ id: "only", label: "Only" }],
        },
      ],
      logic: [],
    };
    expect(formSchemaV1.safeParse(bad).success).toBe(false);
  });

  it("rejects answers keyed by unstable ids", () => {
    const bad = {
      schemaVersion: 1,
      title: "Bad",
      blocks: [{ id: "not a valid id!!", type: "yes_no", title: "Q" }],
      logic: [],
    };
    expect(formSchemaV1.safeParse(bad).success).toBe(false);
  });
});

describe("validateLogicGraph", () => {
  it("passes a healthy graph", () => {
    expect(
      validateLogicGraph(
        formSchemaV1.parse(demoForm) as Parameters<typeof validateLogicGraph>[0],
      ),
    ).toEqual([]);
  });

  it("flags jumps to missing blocks", () => {
    const parsed = formSchemaV1.parse(demoForm);
    const errors = validateLogicGraph({
      ...parsed,
      logic: [
        {
          id: "rule_x",
          when: { questionId: "q_role", operator: "equals", value: "opt_student" },
          then: { action: "goto", blockId: "ghost" },
        },
      ],
    });
    expect(errors.some((e) => e.includes("ghost"))).toBe(true);
  });

  it("flags self-loops and duplicate ids", () => {
    const parsed = formSchemaV1.parse(demoForm);
    const errors = validateLogicGraph({
      ...parsed,
      blocks: [...parsed.blocks, { ...parsed.blocks[1], id: "q_name" } as never],
      logic: [
        {
          id: "rule_loop",
          when: { questionId: "q_name", operator: "answered" },
          then: { action: "goto", blockId: "q_name" },
        },
      ],
    });
    expect(errors.some((e) => e.includes("infinite loop"))).toBe(true);
    expect(errors.some((e) => e.includes("Duplicate block id"))).toBe(true);
  });
});
