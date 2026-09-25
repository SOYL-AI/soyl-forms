"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import {
  PLANS,
  formatINR,
  yearlyPerMonthPaise,
  yearlySavingsPct,
  type BillingInterval,
  type PlanCode,
} from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";

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

const PERKS: Record<Exclude<PlanCode, "free">, string[]> = {
  starter: ["15 live forms · 5,000 responses/mo", "Custom colours, fonts & logo", "Brand kits, notifications, no SOYL branding", "40 AI credits/mo"],
  pro: ["100 live forms · 25,000 responses/mo", "Everything in Starter", "10 brand kits, advanced analytics", "150 AI credits/mo"],
};

export function SubscribeButtons({
  currentPlan,
  configured,
  initialInterval = "monthly",
  autoOpenPlan = null,
}: {
  currentPlan: PlanCode;
  configured: boolean;
  initialInterval?: BillingInterval;
  /** From the pricing page: open checkout for this plan immediately (once). */
  autoOpenPlan?: PlanCode | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<BillingInterval>(initialInterval);
  const opened = useRef(false);

  async function subscribe(plan: PlanCode) {
    if (plan === "free") return;
    setError(null);
    setNotice(null);
    setBusy(`${plan}-${interval}`);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, interval }),
      });
      const data = (await res.json()) as { key?: string; subscriptionId?: string; error?: string };
      if (!res.ok || !data.key || !data.subscriptionId) throw new Error(data.error ?? "Checkout unavailable.");
      if (!(await loadCheckout()) || !window.Razorpay) throw new Error("Payment window failed to load. Check your connection and try again.");
      const rzp = new window.Razorpay({
        key: data.key,
        subscription_id: data.subscriptionId,
        name: `SOYL Forms ${PLANS[plan].name}`,
        description: `${PLANS[plan].name} · ${interval}`,
        theme: { color: "#101012" },
        modal: { ondismiss: () => setBusy(null) },
        handler: async (resp: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => {
          const verify = await fetch("/api/billing/subscribe/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              paymentId: resp.razorpay_payment_id,
              subscriptionId: resp.razorpay_subscription_id,
              signature: resp.razorpay_signature,
            }),
          });
          const done = (await verify.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
          if (!verify.ok || !done?.ok) {
            setNotice("Payment received. Your plan activates as soon as Razorpay confirms — usually within a minute. Refresh to see it.");
          } else {
            setNotice(`Payment verified — welcome to ${PLANS[plan].name}. Razorpay's confirmation finalises the subscription in the background.`);
          }
          setBusy(null);
          router.refresh();
        },
      });
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed.");
      setBusy(null);
    }
  }

  // Arriving from a pricing CTA: open checkout without another click.
  useEffect(() => {
    if (!autoOpenPlan || !configured || opened.current) return;
    opened.current = true;
    void subscribe(autoOpenPlan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenPlan, configured]);

  if (!configured) {
    return (
      <Notice tone="warn" role="note">
        Billing isn&apos;t connected in this environment (missing Razorpay keys or upgrades paused). Plans below are preview-only.
      </Notice>
    );
  }

  return (
    <div>
      <Segmented<BillingInterval>
        label="Billing period"
        value={interval}
        onChange={setInterval}
        options={[
          { value: "monthly", label: "Monthly" },
          { value: "yearly", label: `Yearly · save ${yearlySavingsPct(PLANS.starter)}%` },
        ]}
      />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {(["starter", "pro"] as Array<Exclude<PlanCode, "free">>).map((code) => {
          const plan = PLANS[code];
          const perMonth = interval === "monthly" ? plan.monthlyPaise : yearlyPerMonthPaise(plan);
          const isCurrent = currentPlan === code;
          const featured = code === "starter" && currentPlan === "free";
          return (
            <div key={code} className={cn("rounded-2xl border p-6", featured ? "border-ink bg-ink text-paper" : "border-line bg-paper")}>
              <p className="font-display text-lg font-semibold">{plan.name}</p>
              <p className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-3xl tracking-tight">{formatINR(perMonth)}</span>
                <span className={cn("text-xs", featured ? "text-paper/60" : "text-ink-faint")}>/ month</span>
              </p>
              <p className={cn("text-xs", featured ? "text-paper/60" : "text-ink-faint")}>
                {interval === "yearly" ? `${formatINR(plan.yearlyPaise)} billed yearly` : `or ${formatINR(yearlyPerMonthPaise(plan))}/mo yearly`}
              </p>
              <ul className={cn("mt-4 space-y-1.5 text-sm", featured ? "text-paper/85" : "text-ink-soft")}>
                {PERKS[code].map((p) => (
                  <li key={p} className="flex items-start gap-2">
                    <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", featured ? "text-accent" : "text-positive")} /> {p}
                  </li>
                ))}
              </ul>
              <Button
                variant={featured ? "accent" : "primary"}
                className="mt-5 w-full"
                disabled={busy !== null || isCurrent}
                onClick={() => subscribe(code)}
              >
                {busy === `${code}-${interval}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isCurrent ? "Current plan" : busy === `${code}-${interval}` ? "Opening checkout…" : currentPlan === "pro" && code === "starter" ? "Switch to Starter" : `Choose ${plan.name}`}
              </Button>
            </div>
          );
        })}
      </div>
      {notice && (
        <Notice tone="positive" className="mt-4">
          {notice}
        </Notice>
      )}
      {error && (
        <Notice tone="danger" className="mt-4">
          {error}
        </Notice>
      )}
      <p className="mt-3 text-xs text-ink-faint">
        UPI, cards, netbanking via Razorpay. Paid access is confirmed by Razorpay&apos;s server webhook — never by the browser alone.
      </p>
    </div>
  );
}
