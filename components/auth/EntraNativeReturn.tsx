"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NATIVE_VERIFIER_KEY } from "./EntraProof";
import { safeAuthNext } from "@/lib/auth/redirect";

export function EntraNativeReturn() {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const input = new URL(window.location.href);
    const ticket = input.searchParams.get("ticket");
    const verifier = sessionStorage.getItem(NATIVE_VERIFIER_KEY);
    window.history.replaceState(null, "", "/auth/entra/native-return");
    if (!ticket || !verifier) {
      setError("This sign-in must finish in the app where it started. Please try again.");
      return;
    }
    void (async () => {
      try {
        const response = await fetch("/auth/entra/redeem", {
          method: "POST", headers: { "Content-Type": "application/json" },
          credentials: "same-origin", body: JSON.stringify({ ticket, verifier }),
        });
        if (!response.ok) throw new Error("Sign-in could not be completed");
        const result: { next?: string } = await response.json();
        sessionStorage.removeItem(NATIVE_VERIFIER_KEY);
        window.location.replace(safeAuthNext(result.next, "/auth/entra/proof"));
      } catch {
        sessionStorage.removeItem(NATIVE_VERIFIER_KEY);
        setError("Sign-in expired or could not be completed. Please try again.");
      }
    })();
  }, []);
  return <main className="mx-auto max-w-lg space-y-4 px-6 py-20">
    <h1 className="text-2xl font-semibold">Finishing sign-in</h1>
    {error ? <><p role="alert">{error}</p><Link className="underline" href="/auth/entra/proof">Return to sign-in</Link></> : <p role="status">Please wait…</p>}
  </main>;
}
