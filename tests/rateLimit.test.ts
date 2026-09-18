import { describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimits } from "@/lib/security/rateLimit";

describe("checkRateLimit", () => {
  it("allows up to the limit, then blocks with retry-after", () => {
    resetRateLimits();
    const now = 1_000_000;
    expect(checkRateLimit("k", 2, 60_000, now).ok).toBe(true);
    expect(checkRateLimit("k", 2, 60_000, now).ok).toBe(true);
    const blocked = checkRateLimit("k", 2, 60_000, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window and isolates keys", () => {
    resetRateLimits();
    expect(checkRateLimit("a", 1, 1_000, 0).ok).toBe(true);
    expect(checkRateLimit("a", 1, 1_000, 0).ok).toBe(false);
    expect(checkRateLimit("a", 1, 1_000, 1_001).ok).toBe(true);
    expect(checkRateLimit("b", 1, 1_000, 0).ok).toBe(true);
  });
});
