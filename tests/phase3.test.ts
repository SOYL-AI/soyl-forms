import { describe, expect, it } from "vitest";
import {
  estimateProgress,
  getNextBlockId,
  hiddenBlockIds,
  isAnswerable,
  respondentPath,
  ruleMatches,
  supportsNumericRules,
} from "@/lib/forms/logic";
import { evaluateFormula, extractFormulaRefs } from "@/lib/forms/formula";
import { availableLocales, localizeSchema } from "@/lib/forms/i18n";
import { displayAnswer, validateAnswers } from "@/lib/forms/answers";
import { formSchemaV1, validateLogicGraph } from "@/lib/forms/schema";
import type { Answers, FormSchemaV1, LogicRule } from "@/types/forms";

const base: FormSchemaV1 = {
  schemaVersion: 1,
  title: "Order",
  logic: [],
  blocks: [
    { id: "q_vip", type: "yes_no", title: "VIP?" },
    { id: "q_qty", type: "number", title: "Qty" },
    { id: "q_extra", type: "short_text", title: "Extra" },
    { id: "q_end", type: "thank_you", title: "Done" },
  ],
};

const yesVip: Answers = { q_vip: { type: "yes_no", value: "yes" } };

describe("logic groups", () => {
  const rule: LogicRule = {
    id: "r1",
    when: { questionId: "q_vip", operator: "equals", value: "yes" },
    match: "all",
    conditions: [{ questionId: "q_qty", operator: "greater_than", value: "2" }],
    then: { action: "goto", blockId: "q_end" },
  };

  it("requires every condition with match=all", () => {
    expect(ruleMatches(rule, { ...yesVip } as never)).toBe(false);
    expect(
      ruleMatches(rule, { ...yesVip, q_qty: { type: "number", value: 5 } } as never),
    ).toBe(true);
  });

  it("accepts any condition with match=any", () => {
    const any = { ...rule, match: "any" as const };
    expect(ruleMatches(any, { ...yesVip } as never)).toBe(true);
    expect(ruleMatches(any, { q_qty: { type: "number", value: 5 } } as never)).toBe(true);
    expect(ruleMatches(any, {} as never)).toBe(false);
  });

  it("legacy single-condition rules still match", () => {
    const legacy: LogicRule = {
      id: "r0",
      when: { questionId: "q_vip", operator: "equals", value: "yes" },
      then: { action: "goto", blockId: "q_end" },
    };
    expect(ruleMatches(legacy, { ...yesVip } as never)).toBe(true);
  });
});

describe("jump to end", () => {
  const schema: FormSchemaV1 = {
    ...base,
    logic: [
      {
        id: "r_end",
        when: { questionId: "q_vip", operator: "equals", value: "no" },
        then: { action: "end" },
      },
    ],
  };
  it("finishes the form from the trigger question", () => {
    expect(getNextBlockId(schema, "q_vip", { q_vip: { type: "yes_no", value: "no" } })).toBeNull();
    expect(getNextBlockId(schema, "q_vip", { ...yesVip } as never)).toBe("q_qty");
  });
});

describe("hide rules", () => {
  const schema: FormSchemaV1 = {
    ...base,
    logic: [
      {
        id: "r_hide",
        when: { questionId: "q_vip", operator: "equals", value: "no" },
        then: { action: "hide", blockId: "q_extra" },
      },
    ],
  };
  const noVip: Answers = { q_vip: { type: "yes_no", value: "no" } };

  it("hides matching blocks", () => {
    expect(hiddenBlockIds(schema, noVip)).toEqual(new Set(["q_extra"]));
    expect(hiddenBlockIds(schema, { ...yesVip } as never)).toEqual(new Set());
  });

  it("steps over hidden blocks in navigation and path", () => {
    expect(getNextBlockId(schema, "q_qty", noVip)).toBe("q_end");
    expect(getNextBlockId(schema, "q_qty", { ...yesVip } as never)).toBe("q_extra");
    const path = respondentPath(schema, noVip);
    expect(path.has("q_extra")).toBe(false);
    expect(path.has("q_end")).toBe(true);
  });

  it("excludes hidden blocks from progress", () => {
    const hide = new Set(["q_extra"]);
    expect(estimateProgress(schema, "q_vip", [], hide).total).toBe(2); // vip + qty
    expect(estimateProgress(schema, "q_vip", [], undefined).total).toBe(3); // + extra
  });
});

describe("formula evaluation", () => {
  it("computes arithmetic with precedence", () => {
    expect(evaluateFormula("{a} + {b} * 2", { a: 3, b: 4 })).toEqual({ ok: true, value: 11 });
    expect(evaluateFormula("({a} + {b}) / 2", { a: 3, b: 4 })).toEqual({ ok: true, value: 3.5 });
    expect(evaluateFormula("-{a} + 10", { a: 3 })).toEqual({ ok: true, value: 7 });
    expect(evaluateFormula("0.1 + 0.2", {})).toEqual({ ok: false, error: expect.any(String) });
  });

  it("extracts references", () => {
    expect(extractFormulaRefs("{q_price} * {q_qty} + {q_price}")).toEqual(["q_price", "q_qty"]);
  });

  it("fails closed on missing inputs, div-zero, and injection", () => {
    expect(evaluateFormula("{a} + {missing}", { a: 1 }).ok).toBe(false);
    expect(evaluateFormula("{a} / {b}", { a: 1, b: 0 }).ok).toBe(false);
    expect(evaluateFormula("1 + (2", {}).ok).toBe(false);
    expect(evaluateFormula("process.exit(1)", {}).ok).toBe(false);
    expect(evaluateFormula("{a}; evil()", { a: 1 }).ok).toBe(false);
  });
});

describe("formula answers", () => {
  const schema: Pick<FormSchemaV1, "blocks" | "logic"> = {
    blocks: [
      { id: "q_price", type: "number", title: "Price" },
      { id: "q_qty", type: "number", title: "Qty" },
      { id: "q_total", type: "number", title: "Total", required: true, formula: "{q_price} * {q_qty}" },
    ],
    logic: [],
  };

  it("recomputes totals and ignores client values", () => {
    const res = validateAnswers(schema, {
      q_price: { type: "number", value: 10 },
      q_qty: { type: "number", value: 3 },
      q_total: { type: "number", value: 9999 },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.q_total).toEqual({ type: "number", value: 30 });
  });

  it("fails required totals when inputs are missing", () => {
    const res = validateAnswers(schema, { q_price: { type: "number", value: 10 } });
    expect(res.ok).toBe(false);
  });
});

describe("new block answers", () => {
  const schema: Pick<FormSchemaV1, "blocks" | "logic"> = {
    blocks: [
      { id: "q_addr", type: "address", title: "Address", required: true },
      { id: "q_slide", type: "slider", title: "Slide", min: 0, max: 10 },
      { id: "q_sig", type: "signature", title: "Sign" },
    ],
    logic: [],
  };

  it("validates addresses", () => {
    const good = {
      q_addr: { type: "address", value: { street: "1 Main", city: "Pune", postal: "411001" } },
      q_slide: { type: "slider", value: 5 },
    };
    expect(validateAnswers(schema, good).ok).toBe(true);
    const missing = {
      q_addr: { type: "address", value: { street: "1 Main", city: "", postal: "" } },
      q_slide: { type: "slider", value: 5 },
    };
    expect(validateAnswers(schema, missing).ok).toBe(false);
  });

  it("bounds sliders", () => {
    const res = validateAnswers(
      { blocks: [schema.blocks[1]], logic: [] },
      { q_slide: { type: "slider", value: 99 } },
    );
    expect(res.ok).toBe(false);
  });

  it("accepts PNG data-URL signatures only", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const res = validateAnswers(
      { blocks: [schema.blocks[2]], logic: [] },
      { q_sig: { type: "signature", value: png } },
    );
    expect(res.ok).toBe(true);
    expect(
      validateAnswers({ blocks: [schema.blocks[2]], logic: [] }, { q_sig: { type: "signature", value: "nope" } }).ok,
    ).toBe(false);
  });

  it("renders display strings without dumping data", () => {
    const addr = schema.blocks[0];
    expect(
      displayAnswer(addr, { type: "address", value: { street: "1 Main", city: "Pune", postal: "411001" } }),
    ).toBe("1 Main, Pune, 411001");
    expect(displayAnswer(schema.blocks[2], { type: "signature", value: "data:image/png;base64,xx" })).toBe("Signed");
  });

  it("screens take no answers", () => {
    expect(isAnswerable("section")).toBe(false);
    expect(isAnswerable("media")).toBe(false);
    expect(isAnswerable("address")).toBe(true);
    expect(isAnswerable("signature")).toBe(true);
    expect(supportsNumericRules("slider")).toBe(true);
  });
});

describe("i18n", () => {
  const schema: FormSchemaV1 = {
    schemaVersion: 1,
    title: "Signup",
    blocks: [
      {
        id: "q_plan",
        type: "single_choice",
        title: "Plan",
        options: [
          { id: "o1", label: "Free" },
          { id: "o2", label: "Pro" },
        ],
      },
    ],
    logic: [],
    locales: ["hi"],
    translations: {
      hi: {
        title: "साइन अप",
        blocks: { q_plan: { title: "योजना", options: { o1: "मुफ़्त" } } },
      },
    },
  };

  it("localizes strings and falls back per key", () => {
    expect(availableLocales(schema)).toEqual(["hi"]);
    const hi = localizeSchema(schema, "hi");
    expect(hi.title).toBe("साइन अप");
    const block = hi.blocks[0];
    expect(block.title).toBe("योजना");
    if (block.type === "single_choice") {
      expect(block.options[0].label).toBe("मुफ़्त");
      expect(block.options[1].label).toBe("Pro");
    } else {
      throw new Error("wrong block type");
    }
  });

  it("returns the base language for unknown locales", () => {
    expect(localizeSchema(schema, "fr").title).toBe("Signup");
    expect(localizeSchema(schema, null).title).toBe("Signup");
  });
});

describe("phase-3 schema", () => {
  it("parses the new blocks and formula", () => {
    const parsed = formSchemaV1.safeParse({
      schemaVersion: 1,
      title: "T",
      blocks: [
        { id: "a", type: "address", title: "Where?" },
        { id: "s", type: "slider", title: "Slide", min: 0, max: 5 },
        { id: "sec", type: "section", title: "Part 2" },
        { id: "m", type: "media", title: "Watch", mediaUrl: "https://example.com/v.mp4", mediaType: "video" },
        { id: "sig", type: "signature", title: "Sign" },
        { id: "n", type: "number", title: "Total", formula: "{a} + 1" },
      ],
      logic: [],
      locales: ["hi"],
      translations: { hi: { title: "T" } },
    });
    expect(parsed.success).toBe(true);
  });

  it("blocks media without URL at publish and formulas without references", () => {
    expect(
      validateLogicGraph({
        schemaVersion: 1,
        title: "T",
        blocks: [{ id: "m", type: "media", title: "Watch" }],
        logic: [],
      }),
    ).toEqual([expect.stringContaining("media URL")]);
    expect(
      formSchemaV1.safeParse({
        schemaVersion: 1,
        title: "T",
        blocks: [{ id: "n", type: "number", title: "N", formula: "1 + 1" }],
        logic: [],
      }).success,
    ).toBe(false);
  });

  it("validates end/hide rules and translations", () => {
    const errors = validateLogicGraph({
      schemaVersion: 1,
      title: "T",
      blocks: [
        { id: "a", type: "yes_no", title: "A" },
        { id: "b", type: "short_text", title: "B" },
      ],
      logic: [
        { id: "r1", when: { questionId: "a", operator: "equals", value: "yes" }, then: { action: "end" } },
        { id: "r2", when: { questionId: "a", operator: "equals", value: "no" }, then: { action: "hide", blockId: "b" } },
        { id: "r3", when: { questionId: "b", operator: "answered" }, then: { action: "hide", blockId: "b" } },
      ],
      locales: ["hi"],
      translations: { xx: { title: "X" } },
    });
    expect(errors).toEqual([
      expect.stringContaining('"xx"'),
      expect.stringContaining("hides the question it watches"),
    ]);
  });
});
