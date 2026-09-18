import type { BillingInterval, PlanCode } from "@/lib/plans";

export type LocalSubStatus =
  | "free"
  | "created"
  | "authenticated"
  | "active"
  | "pending"
  | "halted"
  | "cancelled"
  | "expired";

/** Trusted server-side mapping of internal plan+interval to Razorpay plan ids. */
export function razorpayPlanIdFor(plan: PlanCode, interval: BillingInterval): string | null {
  if (plan === "free") return null;
  const key =
    plan === "starter"
      ? interval === "monthly"
        ? "RAZORPAY_PLAN_STARTER_MONTHLY"
        : "RAZORPAY_PLAN_STARTER_YEARLY"
      : interval === "monthly"
        ? "RAZORPAY_PLAN_PRO_MONTHLY"
        : "RAZORPAY_PLAN_PRO_YEARLY";
  return process.env[key] || null;
}

/** Which internal plan a Razorpay plan id belongs to (reverse lookup). */
export function planFromRazorpayPlanId(
  providerPlanId: string,
): { plan: PlanCode; interval: BillingInterval } | null {
  const pairs: Array<[PlanCode, BillingInterval, string]> = [
    ["starter", "monthly", "RAZORPAY_PLAN_STARTER_MONTHLY"],
    ["starter", "yearly", "RAZORPAY_PLAN_STARTER_YEARLY"],
    ["pro", "monthly", "RAZORPAY_PLAN_PRO_MONTHLY"],
    ["pro", "yearly", "RAZORPAY_PLAN_PRO_YEARLY"],
  ];
  for (const [plan, interval, envKey] of pairs) {
    if (process.env[envKey] && process.env[envKey] === providerPlanId) {
      return { plan, interval };
    }
  }
  return null;
}

export interface RzpSubscriptionEntity {
  id: string;
  plan_id?: string;
  status?: string;
  current_start?: number | null;
  current_end?: number | null;
}

/**
 * Map a Razorpay subscription.* webhook to local state. Pure and
 * order-tolerant: unknown or terminal-out-of-order events resolve to safe
 * no-op transitions the route can apply idempotently.
 */
export function applyRazorpayEvent(
  event: string,
  entity: RzpSubscriptionEntity,
): {
  providerSubscriptionId: string;
  providerPlanId?: string;
  status: LocalSubStatus;
  downgradeToFree: boolean;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
} | null {
  const period = {
    currentPeriodStart:
      entity.current_start != null
        ? new Date(entity.current_start * 1000).toISOString()
        : null,
    currentPeriodEnd:
      entity.current_end != null
        ? new Date(entity.current_end * 1000).toISOString()
        : null,
  };
  const base = {
    providerSubscriptionId: entity.id,
    providerPlanId: entity.plan_id,
    ...period,
  };
  switch (event) {
    case "subscription.authenticated":
      return { ...base, status: "authenticated", downgradeToFree: false };
    case "subscription.activated":
    case "subscription.charged":
      return { ...base, status: "active", downgradeToFree: false };
    case "subscription.pending":
      return { ...base, status: "pending", downgradeToFree: false };
    case "subscription.halted":
      return { ...base, status: "halted", downgradeToFree: false };
    case "subscription.cancelled":
    case "subscription.expired":
    case "subscription.completed":
      return { ...base, status: event === "subscription.cancelled" ? "cancelled" : "expired", downgradeToFree: true };
    default:
      return null;
  }
}

/** Paid entitlements unlock only for live subscription states. */
export function isSubscriptionEntitled(status: string): boolean {
  return status === "active" || status === "authenticated";
}

export interface StoredSubscription {
  plan_code: string;
  status: string;
  override_reason?: string | null;
  override_expires_at?: string | null;
}

/**
 * Resolve the effective plan: a manual override wins while unexpired,
 * otherwise an entitled subscription, otherwise free. Downgrades never
 * delete anything — resolution only changes what limits apply.
 */
export function resolveEffectivePlan(sub: StoredSubscription | null): {
  plan: PlanCode;
  source: "override" | "subscription" | "free";
} {
  if (sub?.override_reason && sub?.plan_code) {
    const exp = sub.override_expires_at ? new Date(sub.override_expires_at).getTime() : NaN;
    if (Number.isNaN(exp) || exp > Date.now()) {
      const code = sub.plan_code;
      if (code === "starter" || code === "pro" || code === "free") {
        return { plan: code, source: "override" };
      }
    }
  }
  if (sub && isSubscriptionEntitled(sub.status)) {
    const code = sub.plan_code;
    if (code === "starter" || code === "pro") {
      return { plan: code, source: "subscription" };
    }
  }
  return { plan: "free", source: "free" };
}
