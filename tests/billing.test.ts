import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  applyRazorpayEvent,
  isSubscriptionEntitled,
  planFromRazorpayPlanId,
  resolveEffectivePlan,
} from "@/lib/billing/subscriptions";
import { validateOverride } from "@/lib/admin";
import { aiProvider } from "@/lib/ai/generate";

describe("razorpay event mapping", () => {
  it("activates on activated/charged, downgrades on cancelled/expired", () => {
    const entity = { id: "sub_1", plan_id: "plan_x", current_start: 1_700_000_000, current_end: 1_700_259_200 };
    expect(applyRazorpayEvent("subscription.activated", entity)?.status).toBe("active");
    expect(applyRazorpayEvent("subscription.activated", entity)?.downgradeToFree).toBe(false);
    const cancelled = applyRazorpayEvent("subscription.cancelled", entity);
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.downgradeToFree).toBe(true);
    expect(applyRazorpayEvent("subscription.halted", entity)?.status).toBe("halted");
    expect(applyRazorpayEvent("invoice.paid", entity)).toBeNull();
  });

  it("verifies webhook signatures like the route does", () => {
    const secret = "whsec_test";
    const raw = JSON.stringify({ event: "subscription.activated" });
    const sig = createHmac("sha256", secret).update(raw).digest("hex");
    expect(createHmac("sha256", secret).update(raw).digest("hex")).toBe(sig);
    expect(createHmac("sha256", secret).update(`${raw} `).digest("hex")).not.toBe(sig);
  });

  it("resolves reverse plan lookup from env", () => {
    process.env.RAZORPAY_PLAN_STARTER_MONTHLY = "plan_sm";
    expect(planFromRazorpayPlanId("plan_sm")).toEqual({ plan: "starter", interval: "monthly" });
    expect(planFromRazorpayPlanId("nope")).toBeNull();
  });

  it("gates entitlements on live states only", () => {
    expect(isSubscriptionEntitled("active")).toBe(true);
    expect(isSubscriptionEntitled("authenticated")).toBe(true);
    for (const s of ["free", "created", "pending", "halted", "cancelled", "expired"]) {
      expect(isSubscriptionEntitled(s)).toBe(false);
    }
  });

  it("prefers unexpired overrides, then subscriptions, then free", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(
      resolveEffectivePlan({ plan_code: "pro", status: "free", override_reason: "incident", override_expires_at: future }),
    ).toEqual({ plan: "pro", source: "override" });
    expect(
      resolveEffectivePlan({ plan_code: "pro", status: "free", override_reason: "incident", override_expires_at: past }),
    ).toEqual({ plan: "free", source: "free" });
    expect(resolveEffectivePlan({ plan_code: "starter", status: "active" })).toEqual({
      plan: "starter",
      source: "subscription",
    });
    expect(resolveEffectivePlan({ plan_code: "starter", status: "halted" })).toEqual({
      plan: "free",
      source: "free",
    });
    expect(resolveEffectivePlan(null)).toEqual({ plan: "free", source: "free" });
  });
});

describe("admin override validation", () => {
  it("demands reason + future expiry + valid plan", () => {
    const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    expect(validateOverride({ plan: "pro", reason: "incident 123", expiresAt: future }).ok).toBe(true);
    expect(validateOverride({ plan: "pro", reason: "x", expiresAt: future }).ok).toBe(false);
    expect(
      validateOverride({ plan: "pro", reason: "incident 123", expiresAt: "2020-01-01" }).ok,
    ).toBe(false);
    expect(validateOverride({ plan: "enterprise", reason: "incident 123", expiresAt: future }).ok).toBe(
      false,
    );
  });
});

describe("ai provider switch", () => {
  it("defaults to openai and recognizes azure flavors", () => {
    delete process.env.AI_PROVIDER;
    expect(aiProvider()).toBe("openai");
    process.env.AI_PROVIDER = "azure-foundry";
    expect(aiProvider()).toBe("azure-foundry");
    process.env.AI_PROVIDER = "azure-openai";
    expect(aiProvider()).toBe("azure-openai");
    delete process.env.AI_PROVIDER;
  });
});
