import { getServiceSupabase } from "@/lib/supabase/admin";
import { PLANS, isPlanCode } from "@/lib/plans";
import { isSubscriptionEntitled } from "@/lib/billing/subscriptions";

export type Admin = NonNullable<ReturnType<typeof getServiceSupabase>>;

export function dayStart(daysAgo: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

export function dayKey(iso: string): string {
  return iso.slice(5, 10).replace("-", "/");
}

/** Bucket ISO timestamps into the last `days` days (oldest first). */
export function dailySeries(rows: Array<{ at: string }>, days: number, key: string): Array<Record<string, string | number>> {
  const map = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) map.set(dayKey(dayStart(i)), 0);
  for (const r of rows) {
    const k = dayKey(r.at);
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([date, n]) => ({ date, [key]: n }));
}

export interface RevenueSnapshot {
  mrrPaise: number;
  paying: number;
  byPlan: Record<"free" | "starter" | "pro", number>;
  yearly: number;
  monthly: number;
}

/** MRR from entitled subscriptions, priced from the central plan table. */
export function revenueSnapshot(
  subs: Array<{ plan_code: string; status: string; billing_interval: string | null }>,
): RevenueSnapshot {
  const out: RevenueSnapshot = { mrrPaise: 0, paying: 0, byPlan: { free: 0, starter: 0, pro: 0 }, yearly: 0, monthly: 0 };
  for (const s of subs) {
    const code = isPlanCode(s.plan_code) ? s.plan_code : "free";
    const entitled = isSubscriptionEntitled(s.status) && code !== "free";
    if (!entitled) {
      out.byPlan.free += 1;
      continue;
    }
    out.byPlan[code] += 1;
    out.paying += 1;
    const plan = PLANS[code];
    if (s.billing_interval === "yearly") {
      out.mrrPaise += Math.round(plan.yearlyPaise / 12);
      out.yearly += 1;
    } else {
      out.mrrPaise += plan.monthlyPaise;
      out.monthly += 1;
    }
  }
  return out;
}

export function paise(p: number): string {
  return `₹${Math.round(p / 100).toLocaleString("en-IN")}`;
}
