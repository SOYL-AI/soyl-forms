import { describe, expect, it } from "vitest";
import { choiceDistribution, numericDistribution } from "@/lib/forms/distributions";
import { createBlock } from "@/lib/forms/builder";

describe("distributions", () => {
  it("counts single and multiple choices per option", () => {
    const block = createBlock("single_choice");
    if (block.type !== "single_choice") throw new Error("fixture");
    const [a, b] = block.options;
    const byId = choiceDistribution(block, [
      { [block.id]: { type: "single_choice", value: a!.id } },
      { [block.id]: { type: "single_choice", value: a!.id } },
      { [block.id]: { type: "single_choice", value: b!.id } },
    ]);
    expect(byId?.find((s) => s.optionId === a!.id)?.count).toBe(2);
    expect(byId?.find((s) => s.optionId === b!.id)?.count).toBe(1);
  });

  it("averages ratings and ignores other types", () => {
    const rating = createBlock("rating");
    const text = createBlock("short_text");
    const stats = numericDistribution(rating, [
      { [rating.id]: { type: "rating", value: 5 } },
      { [rating.id]: { type: "rating", value: 3 } },
    ]);
    expect(stats?.average).toBe(4);
    expect(stats?.total).toBe(2);
    expect(numericDistribution(text, [])).toBeNull();
    expect(choiceDistribution(text, [])).toBeNull();
  });
});
