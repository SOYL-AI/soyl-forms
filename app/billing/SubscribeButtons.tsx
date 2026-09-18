"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatINR, PLAN_ORDER, PLANS, type BillingInterval, type PlanCode } from "@/lib/plans";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadCheckout(): Promise<boolean> {
  if (typeof window.Razorpay !== "undefined") return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export function SubscribeButtons({
  currentPlan,
  configured,
}: {
  currentPlan: PlanCode;
  configured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  async function subscribe(plan: PlanCode) {
    setError(null);
    setNotice(null);
    setBusy(`${plan}-${interval}`);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });
      const data = (await res.json()) as {
        key?: string;
        subscriptionId?: string;
        error?: string;
      };
      if (!res.ok || !data.key || !data.subscriptionId) {
        throw new Error(data.error ?? "Checkout unavailable.");
      }
      if (!(await loadCheckout()) || !window.Razorpay) {
        throw new Error("Payment window failed to load.");
      }
      const rzp = new window.Razorpay({
        key: data.key,
        subscription_id: data.subscriptionId,
        name: `${PLANS[plan].name} plan`,
        description: `${PLANS[plan].name} ${interval}`,
        handler: () => {
          setNotice(
            "Payment received — your plan activates as soon as Razorpay confirms (usually within a couple of minutes). This page will reflect it after refresh.",
          );
          router.refresh();
        },
      });
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed.");
    } finally {
      setBusy(null);
    }
  }

  if (!configured) {
    return (
      <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Billing isn&apos;t connected in this environment (missing Razorpay
        keys). Plans below are preview-only until test mode is configured.
      </p>
    );
  }

  return (
    <div>
      <div className="flex gap-1 rounded-full bg-paper-deep/60 p-1 sm:w-64" role="group" aria-label="Billing period">
        {(["monthly", "yearly"] as BillingInterval[]).map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setInterval(i)}
            aria-pressed={interval === i}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
              interval === i ? "bg-white shadow-sm" : "text-ink-soft"
            }`}
          >
            {i === "yearly" ? "Yearly · save ~2 mo" : "Monthly"}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {(["starter", "pro"] as PlanCode[]).map((code) => {
          const plan = PLANS[code];
          const price = interval === "monthly" ? plan.monthlyPaise : plan.yearlyPaise;
          const isCurrent = currentPlan === code;
          return (
            <div key={code} className="rounded-2xl border border-ink/10 bg-white p-6">
              <p className="font-bold">{plan.name}</p>
              <p className="mt-1 font-display text-3xl">{formatINR(price)}</p>
              <p className="text-xs text-ink-faint">
                per {interval === "monthly" ? "month" : "year"}
              </p>
              <button
                type="button"
                disabled={busy !== null || isCurrent}
                onClick={() => subscribe(code)}
                className="mt-4 w-full rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isCurrent
                  ? "Current plan"
                  : busy === `${code}-${interval}`
                    ? "Opening…"
                    : `Choose ${plan.name}`}
              </button>
            </div>
          );
        })}
      </div>
      {notice && (
        <p role="status" className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-red-700">{error}</p>
      )}
      <p className="mt-3 text-xs text-ink-faint">
        Plans render from {PLAN_ORDER.length} centrally-defined tiers. Paid access
        activates only after Razorpay&apos;s server webhook confirms — never from
        the browser callback alone.
      </p>
    </div>
  );
}
