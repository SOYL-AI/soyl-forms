/**
 * Fixed-window in-memory rate limiter for public endpoints.
 *
 * Single-instance only: it protects one Node process. Production uses
 * Cloudflare edge rate limiting in front of this (Phase 8); this layer
 * guarantees sane behavior everywhere, including `next start` and dev.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { ok: boolean; retryAfterMs: number } {
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (current.count < limit) {
    current.count += 1;
    return { ok: true, retryAfterMs: 0 };
  }
  return { ok: false, retryAfterMs: current.resetAt - now };
}

/** Test-only reset. */
export function resetRateLimits(): void {
  buckets.clear();
}
