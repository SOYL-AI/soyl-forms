import { describe, expect, it } from "vitest";
import { validateAnswers } from "@/lib/forms/answers";
import { demoForm } from "@/lib/forms/demo";

const good = {
  q_name: { type: "short_text", value: "Ada" },
  q_role: { type: "single_choice", value: "opt_student" },
  q_college: { type: "short_text", value: "IIT" },
  q_topics: { type: "multiple_choice", value: ["opt_pricing", "opt_mobile"] },
  q_rank: { type: "ranking", value: ["opt_ai", "opt_design", "opt_price", "opt_data"] },
  q_recommend: { type: "nps", value: 9 },
  q_rating: { type: "rating", value: 5 },
  q_notes: { type: "long_text", value: "Lovely." },
};

describe("validateAnswers", () => {
  it("accepts a complete valid payload", () => {
    const res = validateAnswers(demoForm, good);
    expect(res.ok).toBe(true);
  });

  it("accepts skipped optional questions", () => {
    const { q_notes: _drop, q_college: _drop2, ...rest } = good;
    expect(validateAnswers(demoForm, rest).ok).toBe(true);
  });

  it("rejects missing required answers", () => {
    const { q_name: _drop, ...rest } = good;
    const res = validateAnswers(demoForm, rest);
    expect(res.ok).toBe(false);
  });

  it("rejects unknown question ids", () => {
    const res = validateAnswers(demoForm, { ...good, ghost: { type: "short_text", value: "x" } });
    expect(res.ok).toBe(false);
  });

  it("rejects off-list choices and out-of-range ratings", () => {
    expect(
      validateAnswers(demoForm, {
        ...good,
        q_role: { type: "single_choice", value: "opt_hacker" },
      }).ok,
    ).toBe(false);
    expect(
      validateAnswers(demoForm, {
        ...good,
        q_rating: { type: "rating", value: 9 },
      }).ok,
    ).toBe(false);
  });

  it("rejects malformed wrappers", () => {
    expect(validateAnswers(demoForm, { ...good, q_name: "Ada" }).ok).toBe(false);
    expect(validateAnswers(demoForm, "nope").ok).toBe(false);
  });
});
