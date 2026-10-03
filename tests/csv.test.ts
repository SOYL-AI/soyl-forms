import { describe, expect, it } from "vitest";
import { submissionsToCsv, type CsvRow } from "@/lib/forms/csv";
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

  it("appends hidden-field columns only when present", () => {
    const base: CsvRow = {
      id: "sub_3",
      submitted_at: "2026-09-18T10:00:00.000Z",
      answers: { q_name: { type: "short_text", value: "Ada" } },
    };
    const plain = submissionsToCsv(demoForm.blocks, [base]);
    expect(plain.split("\n")[0]).not.toContain("cohort");
    const csv = submissionsToCsv(demoForm.blocks, [
      { ...base, hidden: { cohort: "jul26", utm_source: "qr" } },
      { ...base, id: "sub_4" },
    ]);
    const [header, r1, r2] = csv.trim().split("\n");
    expect(header.endsWith("cohort,utm_source")).toBe(true);
    expect(r1.endsWith("jul26,qr")).toBe(true);
    expect(r2.endsWith(",")).toBe(true);
  });

  it("appends a tags column only when present", () => {
    const row = (tags?: string[]): CsvRow => ({
      id: "sub_1",
      submitted_at: "2026-09-18T10:00:00.000Z",
      answers: { q_name: { type: "short_text", value: "Ada" } },
      ...(tags ? { tags } : {}),
    });
    const plain = submissionsToCsv(demoForm.blocks, [row()]);
    expect(plain.split("\n")[0].endsWith("tags")).toBe(false);
    const csv = submissionsToCsv(demoForm.blocks, [row(["hot-lead", "vip"]), row()]);
    const [header, r1, r2] = csv.trim().split("\n");
    expect(header.endsWith(",tags")).toBe(true);
    expect(r1.endsWith(",hot-lead; vip")).toBe(true);
    expect(r2.endsWith(",")).toBe(true);
  });
});
