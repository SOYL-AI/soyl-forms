"use client";

import { useState } from "react";
import { isNativeApp } from "@/lib/native";

export const NATIVE_VERIFIER_KEY = "soyl.entra.native-verifier";

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function EntraProofSignIn({ next = "/auth/entra/proof", label = "Continue to secure sign-in" }: { next?: string; label?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const url = new URL("/auth/entra/start", window.location.origin);
      url.searchParams.set("next", next);
      if (isNativeApp()) {
        const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
        sessionStorage.setItem(NATIVE_VERIFIER_KEY, verifier);
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
        url.searchParams.set("native_challenge", base64url(new Uint8Array(digest)));
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: url.href });
        setBusy(false);
      } else {
        window.location.assign(url.href);
      }
    } catch {
      sessionStorage.removeItem(NATIVE_VERIFIER_KEY);
      setError("Could not open sign-in. Please try again.");
      setBusy(false);
    }
  }
  return <div className="space-y-3">
    <button type="button" className="rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white disabled:opacity-60" disabled={busy} onClick={() => void signIn()}>
      {busy ? "Opening sign-in…" : label}
    </button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
