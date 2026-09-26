import { describe, expect, it } from "vitest";
import { getNextBlockId } from "@/lib/forms/logic";
import { demoForm } from "@/lib/forms/demo";

const student = {
  q_role: { type: "single_choice", value: "opt_student" },
} as const;

const founder = {
  q_role: { type: "single_choice", value: "opt_founder" },
} as const;

describe("getNextBlockId", () => {
  it("routes students to the college question", () => {
    expect(
      getNextBlockId(demoForm, "q_role", { ...student }),
    ).toBe("q_college");
  });

  it("skips the college question for non-students", () => {
    expect(
      getNextBlockId(demoForm, "q_role", { ...founder }),
    ).toBe("q_topics");
  });

  it("falls back to linear order without rules", () => {
    expect(getNextBlockId(demoForm, "q_topics", {})).toBe("q_rank");
  });

  it("returns null after the thank-you screen", () => {
    expect(getNextBlockId(demoForm, "blk_thanks", {})).toBe(null);
    expect(getNextBlockId(demoForm, "q_notes", {})).toBe("blk_thanks");
  });

  it("starts at the first block for unknown ids", () => {
    expect(getNextBlockId(demoForm, "nope", {})).toBe("blk_welcome");
  });
});
