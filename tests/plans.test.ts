import { describe, expect, it } from "vitest";
import {
  canAcceptSubmission,
  canPublishForm,
  canUploadFile,
  formatINR,
} from "@/lib/plans";

describe("plan entitlements", () => {
  it("blocks a third active form on free", () => {
    expect(canPublishForm({ plan: "free", activeForms: 2 }).ok).toBe(false);
    expect(canPublishForm({ plan: "free", activeForms: 1 }).ok).toBe(true);
  });

  it("re-publishing an active form never consumes quota", () => {
    expect(
      canPublishForm({ plan: "free", activeForms: 2, republishingActive: true })
        .ok,
    ).toBe(true);
  });

  it("enforces monthly submission caps", () => {
    expect(
      canAcceptSubmission({ plan: "free", monthlyCount: 250 }).ok,
    ).toBe(false);
    expect(
      canAcceptSubmission({ plan: "starter", monthlyCount: 250 }).ok,
    ).toBe(true);
  });

  it("enforces storage quotas", () => {
    const MB = 1024 * 1024;
    expect(
      canUploadFile({ plan: "free", storageUsedBytes: 20 * MB, fileBytes: 10 * MB })
        .ok,
    ).toBe(false);
    expect(
      canUploadFile({ plan: "free", storageUsedBytes: 20 * MB, fileBytes: 4 * MB })
        .ok,
    ).toBe(true);
  });

  it("formats INR from paise", () => {
    expect(formatINR(0)).toBe("₹0");
    expect(formatINR(19900)).toBe("₹199");
    expect(formatINR(499000)).toBe("₹4,990");
  });
});
