/**
 * Fixed-window in-memory rate limiter for public endpoints.
 *
 * Single-instance only: it protects one Node process. Production uses
 * Cloudflare edge rate limiting in front of this (Phase 8); this layer
 * guarantees sane behavior everywhere, including `next start` and dev.
 */

import { createHmac } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/admin";

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
    if (buckets.size >= 10_000 && !current) return { ok: false, retryAfterMs: windowMs };
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (current.count < limit) {
    current.count += 1;
    return { ok: true, retryAfterMs: 0 };
  }
  return { ok: false, retryAfterMs: current.resetAt - now };
}

/** Database-backed production gate shared by every application instance. */
export async function enforceRateLimit(key: string, limit: number, windowMs: number) {
  if (process.env.NODE_ENV !== "production") return checkRateLimit(key, limit, windowMs);
  const admin = getServiceSupabase();
  const secret = process.env.RATE_LIMIT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!admin || !secret) return { ok: false, retryAfterMs: windowMs };
  const day = new Date().toISOString().slice(0, 10);
  const hashed = createHmac("sha256", secret).update(`${day}:${key}`).digest("hex");
  try {
    const { data, error } = await admin.rpc("consume_rate_limit", { p_key: hashed, p_limit: limit, p_window_ms: windowMs });
    if (error || !data) return { ok: false, retryAfterMs: windowMs };
    return data as { ok: boolean; retryAfterMs: number };
  } catch { return { ok: false, retryAfterMs: windowMs }; }
}

/** Test-only reset. */
export function resetRateLimits(): void {
  buckets.clear();
}
