import { describe, expect, it } from "vitest";
import { validateAnswers } from "@/lib/forms/answers";
import { demoForm } from "@/lib/forms/demo";
import type { FormSchemaV1 } from "@/types/forms";

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

  it("ignores answers to questions that no longer exist", () => {
    const res = validateAnswers(demoForm, { ...good, ghost: { type: "short_text", value: "x" } });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).not.toHaveProperty("ghost");
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

describe("validateAnswers with branching", () => {
  // score > 8 jumps straight to "email", skipping the required "why" question.
  const branching: FormSchemaV1 = {
    schemaVersion: 1,
    title: "B",
    blocks: [
      { id: "score", type: "opinion_scale", title: "Score", required: true, min: 0, max: 10 },
      { id: "why", type: "long_text", title: "Why so low?", required: true },
      { id: "email", type: "email", title: "Email", required: true },
      { id: "end", type: "thank_you", title: "Thanks" },
    ],
    logic: [{ id: "r1", when: { questionId: "score", operator: "greater_than", value: "8" }, then: { action: "goto", blockId: "email" } }],
  };

  it("doesn't require questions the respondent's branch skipped", () => {
    const res = validateAnswers(branching, {
      score: { type: "opinion_scale", value: 10 },
      email: { type: "email", value: "a@b.co" },
    });
    expect(res.ok).toBe(true);
  });

  it("still requires questions on the respondent's path", () => {
    const res = validateAnswers(branching, {
      score: { type: "opinion_scale", value: 3 },
      email: { type: "email", value: "a@b.co" },
    });
    expect(res.ok).toBe(false);
  });

  it("drops answers left on a branch the respondent backed out of", () => {
    const res = validateAnswers(branching, {
      score: { type: "opinion_scale", value: 10 },
      why: { type: "long_text", value: "typed before changing the score" },
      email: { type: "email", value: "a@b.co" },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).not.toHaveProperty("why");
  });

  it("doesn't fail on a malformed answer that isn't on the path", () => {
    const res = validateAnswers(branching, {
      score: { type: "opinion_scale", value: 10 },
      why: "stale",
      email: { type: "email", value: "a@b.co" },
    });
    expect(res.ok).toBe(true);
  });

  it("terminates when logic loops back", () => {
    const looping: FormSchemaV1 = {
      ...branching,
      logic: [{ id: "r1", when: { questionId: "email", operator: "answered" }, then: { action: "goto", blockId: "score" } }],
    };
    const res = validateAnswers(looping, {
      score: { type: "opinion_scale", value: 2 },
      why: { type: "long_text", value: "x" },
      email: { type: "email", value: "a@b.co" },
    });
    expect(res.ok).toBe(true);
  });
});
