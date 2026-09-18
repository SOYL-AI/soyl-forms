import { describe, expect, it } from "vitest";
import { submissionsToCsv } from "@/lib/forms/csv";
import { demoForm } from "@/lib/forms/demo";

describe("submissionsToCsv", () => {
  it("flattens answers with human-readable labels", () => {
    const csv = submissionsToCsv(demoForm.blocks, [
      {
        id: "sub_1",
        submitted_at: "2026-09-18T10:00:00.000Z",
        answers: {
          q_name: { type: "short_text", value: "Ada" },
          q_role: { type: "single_choice", value: "opt_student" },
          q_topics: { type: "multiple_choice", value: ["opt_pricing", "opt_mobile"] },
          q_recommend: { type: "yes_no", value: "yes" },
          q_rating: { type: "rating", value: 5 },
        },
      },
    ]);
    const [header, row] = csv.trim().split("\n");
    expect(header).toContain("submission_id,submitted_at,");
    expect(header).toContain("What should we call you?");
    expect(row).toContain("sub_1");
    expect(row).toContain("Ada");
    expect(row).toContain("Student");
    expect(row).toContain("Pricing; Mobile experience");
    expect(row).toContain("Yes");
  });

  it("escapes commas, quotes, and newlines", () => {
    const csv = submissionsToCsv(demoForm.blocks, [
      {
        id: "sub_2",
        submitted_at: "2026-09-18T10:00:00.000Z",
        answers: {
          q_name: { type: "short_text", value: 'O"Neil, Jr.\nEsq' },
          q_role: { type: "single_choice", value: "opt_founder" },
          q_topics: { type: "multiple_choice", value: [] },
          q_recommend: { type: "yes_no", value: "no" },
          q_rating: { type: "rating", value: 3 },
        },
      },
    ]);
    expect(csv).toContain('"O""Neil, Jr.\nEsq"');
  });
});
