"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatINR, type CreditPack } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";

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

export function BuyButtons({ packs, configured }: { packs: CreditPack[]; configured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function buy(pack: CreditPack) {
    setError(null);
    setNotice(null);
    setBusy(pack.id);
    try {
      const orderRes = await fetch("/api/billing/credits/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packId: pack.id }),
      });
      const order = (await orderRes.json()) as { key?: string; orderId?: string; amount?: number; error?: string };
      if (!orderRes.ok || !order.key || !order.orderId) throw new Error(order.error ?? "Checkout unavailable.");
      if (!(await loadCheckout()) || !window.Razorpay) throw new Error("Payment window failed to load. Check your connection.");
      const rzp = new window.Razorpay({
        key: order.key,
        amount: order.amount,
        currency: "INR",
        name: "SOYL Forms AI credits",
        description: `${pack.credits} credits`,
        order_id: order.orderId,
        theme: { color: "#101012" },
        modal: { ondismiss: () => setBusy(null) },
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
          const done = (await verifyRes.json()) as { ok?: boolean; balance?: number; error?: string };
          if (!verifyRes.ok || !done.ok) {
            setError(done.error ?? "Verification failed. If you were charged, contact support with your payment id.");
          } else {
            setNotice(`${pack.credits} credits added. New balance: ${done.balance}.`);
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

  if (!configured) {
    return <Notice tone="warn">Payments aren&apos;t connected in this environment, so packs are preview-only.</Notice>;
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        {packs.map((p, i) => (
          <div key={p.id} className={`rounded-2xl border p-6 ${i === 1 ? "border-ink" : "border-line"} bg-paper`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{p.label}</p>
              {i === 1 && <Badge tone="accent">Best value</Badge>}
            </div>
            <p className="mt-3 font-display text-3xl tracking-tight">
              {p.credits}
              <span className="ml-1.5 align-middle font-sans text-sm font-normal text-ink-faint">credits</span>
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {formatINR(p.paise)} · ₹{(p.paise / 100 / p.credits).toFixed(2)} per credit
            </p>
            <Button variant={i === 1 ? "primary" : "secondary"} className="mt-5 w-full" disabled={busy !== null} onClick={() => buy(p)}>
              {busy === p.id ? "Opening…" : "Buy"}
            </Button>
          </div>
        ))}
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
    </div>
  );
}
