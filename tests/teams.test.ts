import { describe, expect, it } from "vitest";
import {
  canChangeRole,
  canManageTeam,
  canRemoveMember,
  isInviteExpired,
  isMemberRole,
  newInviteToken,
  normalizeInviteEmail,
  roleAtLeast,
} from "@/lib/teams";
import { applyEditedAnswer, normalizeTag, normalizeTags } from "@/lib/forms/submissions";
import { computeFunnel } from "@/lib/forms/funnel";
import type { FormSchemaV1 } from "@/types/forms";

describe("teams policy", () => {
  it("normalizes invite emails", () => {
    expect(normalizeInviteEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(normalizeInviteEmail("not-an-email")).toBeNull();
    expect(normalizeInviteEmail("")).toBeNull();
    expect(normalizeInviteEmail(42)).toBeNull();
  });

  it("limits management to owner/admin", () => {
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageTeam("admin")).toBe(true);
    expect(canManageTeam("editor")).toBe(false);
    expect(canManageTeam("viewer")).toBe(false);
    expect(canManageTeam(null)).toBe(false);
  });

  it("ranks roles", () => {
    expect(roleAtLeast("admin", "editor")).toBe(true);
    expect(roleAtLeast("viewer", "editor")).toBe(false);
    expect(isMemberRole("owner")).toBe(true);
    expect(isMemberRole("super")).toBe(false);
  });

  it("guards role changes", () => {
    expect(canChangeRole("owner", "editor", "admin", false)).toBe(true);
    expect(canChangeRole("owner", "editor", "editor", false)).toBe(false); // no-op
    expect(canChangeRole("admin", "editor", "viewer", false)).toBe(true);
    expect(canChangeRole("admin", "editor", "owner", false)).toBe(false);
    expect(canChangeRole("admin", "owner", "editor", false)).toBe(false);
    expect(canChangeRole("owner", "editor", "admin", true)).toBe(false); // self
    expect(canChangeRole("viewer", "viewer", "editor", false)).toBe(false);
  });

  it("guards removals", () => {
    expect(canRemoveMember("owner", "admin", false)).toBe(true);
    expect(canRemoveMember("admin", "owner", false)).toBe(false);
    expect(canRemoveMember("owner", "editor", true)).toBe(false); // leave flow
    expect(canRemoveMember("editor", "viewer", false)).toBe(false);
  });

  it("expires invites and mints tokens", () => {
    expect(isInviteExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
    expect(isInviteExpired(new Date(Date.now() + 3600000).toISOString())).toBe(false);
    expect(isInviteExpired("garbage")).toBe(true);
    const a = newInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9]{8,64}$/);
    expect(newInviteToken()).not.toBe(a);
  });
});

const schema: Pick<FormSchemaV1, "blocks" | "logic"> = {
  blocks: [
    { id: "q_name", type: "short_text", title: "Name", required: true },
    { id: "q_email", type: "email", title: "Email" },
  ],
  logic: [],
};

describe("submission tags", () => {
  it("normalizes tags", () => {
    expect(normalizeTag("  Hot Lead ")).toBe("hot-lead");
    expect(normalizeTag("!!!")).toBeNull();
    expect(normalizeTag("")).toBeNull();
  });

  it("dedupes and caps tag lists", () => {
    expect(normalizeTags(["A", "a", "B", "!!!"])).toEqual(["a", "b"]);
    expect(normalizeTags("nope")).toEqual([]);
    expect(normalizeTags(Array(15).fill("x").map((v, i) => `${v}${i}`))).toHaveLength(10);
  });
});

describe("applyEditedAnswer", () => {
  const existing = {
    q_name: { type: "short_text", value: "Ada" },
    q_email: { type: "email", value: "a@b.com" },
  };

  it("applies a valid edit and normalizes", () => {
    const r = applyEditedAnswer(schema, existing, "q_name", { type: "short_text", value: "Grace" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.answers.q_name).toEqual({ type: "short_text", value: "Grace" });
  });

  it("rejects invalid values and unknown questions", () => {
    expect(applyEditedAnswer(schema, existing, "q_email", { type: "email", value: "nope" }).ok).toBe(false);
    expect(applyEditedAnswer(schema, existing, "ghost", { type: "short_text", value: "x" }).ok).toBe(false);
  });

  it("rejects edits that break required questions", () => {
    // Empty text fails the shape check, so the required question can't be cleared.
    expect(applyEditedAnswer(schema, existing, "q_name", { type: "short_text", value: "  " }).ok).toBe(false);
  });
});

describe("computeFunnel", () => {
  it("attributes reach per step with completions reaching all", () => {
    const f = computeFunnel({
      order: ["a", "b", "c"],
      labels: { a: "A", b: "B", c: "C" },
      lastBlocks: ["a", "b", null, "zzz"],
      completions: 2,
    });
    expect(f.started).toBe(6);
    expect(f.completed).toBe(2);
    expect(f.abandoned).toBe(4);
    // a: 4 partials (null + unknown sit at first step) + 2 completions
    expect(f.steps.map((s) => s.reached)).toEqual([6, 3, 2]);
  });

  it("handles no partials", () => {
    const f = computeFunnel({ order: ["a"], labels: {}, lastBlocks: [], completions: 3 });
    expect(f.started).toBe(3);
    expect(f.steps[0].reached).toBe(3);
  });
});
