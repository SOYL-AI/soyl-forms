import { describe, expect, it } from "vitest";
import { parsePrefillParams, slugifyTitle } from "@/lib/forms/prefill";
import { formSettingsSchema } from "@/lib/forms/schema";
import type { FormSchemaV1, FormSettings } from "@/types/forms";

const schema: FormSchemaV1 = {
  schemaVersion: 1,
  title: "Signup",
  logic: [],
  blocks: [
    { id: "q_name", type: "short_text", title: "Your Name" },
    { id: "q_email", type: "email", title: "Work Email" },
    { id: "q_age", type: "number", title: "Age" },
    {
      id: "q_plan",
      type: "single_choice",
      title: "Plan",
      options: [
        { id: "opt_free", label: "Free" },
        { id: "opt_pro", label: "Pro" },
      ],
    },
    { id: "q_news", type: "yes_no", title: "Newsletter?" },
    {
      id: "q_topics",
      type: "multiple_choice",
      title: "Topics",
      options: [
        { id: "opt_a", label: "Alpha" },
        { id: "opt_b", label: "Beta" },
      ],
    },
    { id: "q_birth", type: "date", title: "Birthday" },
  ],
};

const settings: FormSettings = {};

describe("slugifyTitle", () => {
  it("matches ?Your Name=... to a title", () => {
    expect(slugifyTitle("Your Name")).toBe("your_name");
    expect(slugifyTitle("  Work-Email! ")).toBe("work-email");
  });
});

describe("parsePrefillParams", () => {
  it("prefills by block id", () => {
    const r = parsePrefillParams(schema, settings, { q_name: "Ada", q_email: "a@b.com" });
    expect(r.answers).toEqual({
      q_name: { type: "short_text", value: "Ada" },
      q_email: { type: "email", value: "a@b.com" },
    });
    expect(r.hidden).toEqual({});
  });

  it("prefills by slugified question title", () => {
    const r = parsePrefillParams(schema, settings, { your_name: "Ada", age: "30" });
    expect(r.answers.q_name).toEqual({ type: "short_text", value: "Ada" });
    expect(r.answers.q_age).toEqual({ type: "number", value: 30 });
  });

  it("drops invalid values instead of storing them anywhere", () => {
    const r = parsePrefillParams(schema, settings, { q_email: "not-an-email", q_age: "old" });
    expect(r.answers).toEqual({});
    expect(r.hidden).toEqual({});
  });

  it("matches choices by option id or label", () => {
    const byId = parsePrefillParams(schema, settings, { q_plan: "opt_pro" });
    expect(byId.answers.q_plan).toEqual({ type: "single_choice", value: "opt_pro" });
    const byLabel = parsePrefillParams(schema, settings, { q_plan: "free" });
    expect(byLabel.answers.q_plan).toEqual({ type: "single_choice", value: "opt_free" });
    const bad = parsePrefillParams(schema, settings, { q_plan: "enterprise" });
    expect(bad.answers).toEqual({});
  });

  it("parses yes/no and comma-separated multi picks", () => {
    expect(parsePrefillParams(schema, settings, { q_news: "1" }).answers.q_news).toEqual({
      type: "yes_no",
      value: "yes",
    });
    const r = parsePrefillParams(schema, settings, { q_topics: "Alpha,opt_b" });
    expect(r.answers.q_topics).toEqual({ type: "multiple_choice", value: ["opt_a", "opt_b"] });
    // One unknown pick rejects the whole value.
    expect(parsePrefillParams(schema, settings, { q_topics: "Alpha,nope" }).answers).toEqual({});
  });

  it("stores declared hidden fields and gives them precedence", () => {
    const s: FormSettings = { hiddenFields: ["cohort", "q_name"] };
    const r = parsePrefillParams(schema, s, { cohort: "jul26", q_name: "Ada", utm_source: "x" });
    expect(r.hidden).toEqual({ cohort: "jul26", q_name: "Ada", utm_source: "x" });
    expect(r.answers).toEqual({});
  });

  it("collects tracking params as hidden by default, skips reserved keys", () => {
    const r = parsePrefillParams(schema, settings, {
      utm_source: "newsletter",
      src: "qr",
      embed: "1",
    });
    expect(r.hidden).toEqual({ utm_source: "newsletter" });
  });

  it("stops hidden collection when the form opts out", () => {
    const r = parsePrefillParams(schema, { collectQueryParams: false }, { utm_source: "x" });
    expect(r.hidden).toEqual({});
  });

  it("disables prefilling but keeps hidden collection", () => {
    const r = parsePrefillParams(schema, { prefillEnabled: false }, { q_name: "Ada", utm_source: "x" });
    expect(r.answers).toEqual({});
    expect(r.hidden).toEqual({ utm_source: "x" });
  });
});

describe("formSettingsSchema additions", () => {
  it("accepts the new prefill/responder settings", () => {
    const parsed = formSettingsSchema.safeParse({
      hiddenFields: ["name", "cohort-1"],
      prefillEnabled: true,
      responderEnabled: true,
      responderSubject: "Thanks {{form_title}}",
      responderMessage: "Hello!",
      responderQuestionId: "q_email",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects bad hidden-field keys", () => {
    expect(formSettingsSchema.safeParse({ hiddenFields: ["has space"] }).success).toBe(false);
    expect(formSettingsSchema.safeParse({ hiddenFields: Array(21).fill("k") }).success).toBe(false);
  });
});
