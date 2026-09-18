"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatINR, type CreditPack } from "@/lib/plans";

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

export function BuyButtons({ packs }: { packs: CreditPack[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(pack: CreditPack) {
    setError(null);
    setBusy(pack.id);
    try {
      const orderRes = await fetch("/api/billing/credits/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packId: pack.id }),
      });
      const order = (await orderRes.json()) as {
        key?: string;
        orderId?: string;
        amount?: number;
        error?: string;
      };
      if (!orderRes.ok || !order.key || !order.orderId) {
        throw new Error(order.error ?? "Checkout unavailable.");
      }
      if (!(await loadCheckout()) || !window.Razorpay) {
        throw new Error("Payment window failed to load. Check your connection.");
      }
      const rzp = new window.Razorpay({
        key: order.key,
        amount: order.amount,
        currency: "INR",
        name: "AI credits",
        description: `${pack.credits} credits`,
        order_id: order.orderId,
        handler: async (resp: { razorpay_payment_id: string; razorpay_signature: string }) => {
          const verifyRes = await fetch("/api/billing/credits/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              orderId: order.orderId,
              paymentId: resp.razorpay_payment_id,
              signature: resp.razorpay_signature,
              packId: pack.id,
            }),
          });
          const done = (await verifyRes.json()) as { ok?: boolean; error?: string };
          if (!verifyRes.ok || !done.ok) {
            throw new Error(done.error ?? "Verification failed.");
          }
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

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        {packs.map((p) => (
          <div key={p.id} className="rounded-2xl border border-ink/10 bg-white p-6">
            <p className="text-sm font-bold">{p.label}</p>
            <p className="mt-2">
              <span className="font-display text-3xl">{p.credits}</span>
              <span className="text-sm text-ink-faint"> credits</span>
            </p>
            <p className="mt-1 text-lg font-semibold">{formatINR(p.paise)}</p>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => buy(p)}
              className="mt-4 w-full rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy === p.id ? "Opening…" : "Buy"}
            </button>
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-red-700">{error}</p>
      )}
    </div>
  );
}
