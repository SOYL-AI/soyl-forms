import { describe, expect, it } from "vitest";
import { DEFAULT_FLAGS, platformFlagsSchema } from "@/lib/platform";
import { canCreateBrandKit, PLANS, yearlyPerMonthPaise, yearlySavingsPct } from "@/lib/plans";
import { resolveEffectivePlan } from "@/lib/billing/subscriptions";

describe("platform flags", () => {
  it("default to permissive and tolerate partial rows", () => {
    expect(DEFAULT_FLAGS.registrationsEnabled).toBe(true);
    expect(platformFlagsSchema.parse({ aiEnabled: false })).toEqual({ ...DEFAULT_FLAGS, aiEnabled: false });
    expect(platformFlagsSchema.safeParse({ maintenanceBanner: "x".repeat(301) }).success).toBe(false);
  });
});

describe("plan maths and gates", () => {
  it("computes yearly savings from the plan table", () => {
    expect(yearlyPerMonthPaise(PLANS.starter)).toBe(Math.round(199000 / 12));
    expect(yearlySavingsPct(PLANS.starter)).toBe(17);
    expect(yearlySavingsPct(PLANS.free)).toBe(0);
  });

  it("caps brand kits per plan", () => {
    expect(canCreateBrandKit({ plan: "free", existing: 1 }).ok).toBe(false);
    expect(canCreateBrandKit({ plan: "starter", existing: 1 }).ok).toBe(true);
  });

  it("never grants entitlements for a merely-created checkout", () => {
    // Regression: opening Razorpay checkout upserts plan_code=starter, status=created.
    expect(resolveEffectivePlan({ plan_code: "starter", status: "created" })).toEqual({ plan: "free", source: "free" });
    expect(resolveEffectivePlan({ plan_code: "starter", status: "authenticated" })).toEqual({ plan: "starter", source: "subscription" });
  });
});
